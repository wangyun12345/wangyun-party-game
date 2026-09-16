import { RoomEngine, RoomError, type RoomRecord, type RoomStorage } from './room/engine.ts'
import { GameRegistry } from '../party-game/src/games/registry.ts'
import '../party-game/src/games/register.ts'

interface WorkerWebSocket extends WebSocket { accept(): void }
declare const WebSocketPair: { new (): [WebSocket, WorkerWebSocket] }

export interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike
  get(id: DurableObjectIdLike): DurableObjectStubLike
}

export interface DurableObjectIdLike { toString(): string }
export interface DurableObjectStubLike { fetch(request: Request): Promise<Response> }
export interface AssetFetcherLike { fetch(request: Request): Promise<Response> }
interface DurableObjectStateLike { storage: RoomStorage }

export interface Env {
  ASSETS: AssetFetcherLike
  ROOMS: DurableObjectNamespaceLike
}

const gameCatalog = { get: (id: string) => GameRegistry.get(id) }

interface ClientCommand {
  type: 'command'
  id: string
  command: { type: string; payload?: Record<string, unknown> }
}

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init?.headers ?? {}) },
  })
}

function errorResponse(error: unknown): Response {
  if (error instanceof RoomError) return json({ error: error.code, message: error.message }, { status: error.code === 'room_not_found' ? 404 : 400 })
  console.error('room runtime failure', error)
  return json({ error: 'internal_error', message: '房间服务暂时不可用' }, { status: 500 })
}

function readNickname(body: unknown): string {
  if (!body || typeof body !== 'object' || typeof (body as { nickname?: unknown }).nickname !== 'string') {
    throw new RoomError('nickname_invalid', '请输入昵称')
  }
  return (body as { nickname: string }).nickname
}

function tokenFromProtocols(request: Request): string | undefined {
  const header = request.headers.get('sec-websocket-protocol')
  if (!header) return undefined
  return header.split(',').map((value) => value.trim()).find((value) => value !== 'party-game.v1')
}

function roomCode(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(100000 + (bytes[0] % 900000))
}

export class RoomDurableObject {
  private readonly state: DurableObjectStateLike
  private engine: RoomEngine | null = null
  private readonly sockets = new Map<WorkerWebSocket, { playerId: string; sessionToken: string }>()
  private commandQueue: Promise<void> = Promise.resolve()

  constructor(state: DurableObjectStateLike) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const action = url.pathname.split('/').filter(Boolean).at(-1)
    const code = url.pathname.split('/').filter(Boolean)[2] ?? ''
    const engine = this.getEngine(code)
    try {
      if (request.headers.get('upgrade')?.toLowerCase() === 'websocket' || action === 'ws') return await this.connect(request)
      if (action === 'bootstrap' && request.method === 'POST') return json(await engine.bootstrap(readNickname(await request.json())))
      if (action === 'join' && request.method === 'POST') {
        const body = await request.json() as { nickname?: unknown; sessionToken?: unknown }
        return json(await engine.join(readNickname(body), typeof body.sessionToken === 'string' ? body.sessionToken : undefined))
      }
      if (action === 'leave' && request.method === 'POST') {
        const body = await request.json() as { sessionToken?: unknown }
        if (typeof body.sessionToken !== 'string') throw new RoomError('invalid_session', '玩家凭据无效')
        await engine.leave(body.sessionToken)
        return json({ ok: true })
      }
      return json({ error: 'not_found', message: '房间接口不存在' }, { status: 404 })
    } catch (error) {
      return errorResponse(error)
    }
  }

  async alarm(): Promise<void> {
    if (!this.engine) {
      const record = await this.state.storage.get<RoomRecord>('room')
      if (!record) return
      this.engine = new RoomEngine(this.state.storage, record.code, gameCatalog)
    }
    await this.engine.expireIfNeeded()
  }

  private getEngine(code: string): RoomEngine {
    if (!this.engine) this.engine = new RoomEngine(this.state.storage, code.toUpperCase(), gameCatalog)
    return this.engine
  }

  private async connect(request: Request): Promise<Response> {
    const sessionToken = tokenFromProtocols(request)
    if (!sessionToken) return errorResponse(new RoomError('invalid_session', '缺少玩家凭据'))
    const code = new URL(request.url).pathname.split('/').filter(Boolean)[2] ?? ''
    const engine = this.getEngine(code)
    const player = await engine.authenticate(sessionToken)
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.accept()
    this.sockets.set(server, { playerId: player.id, sessionToken })
    server.addEventListener('message', (event: MessageEvent<string>) => { this.receive(server, event.data) })
    server.addEventListener('close', () => { this.sockets.delete(server) })
    server.addEventListener('error', () => { this.sockets.delete(server) })
    await this.sendSnapshot(server, player.id)
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket })
  }

  private receive(socket: WorkerWebSocket, data: string | ArrayBuffer | Blob): void {
    this.commandQueue = this.commandQueue.then(() => this.processMessage(socket, data)).catch((error) => {
      const result = error instanceof RoomError ? { type: 'error', code: error.code, message: error.message } : { type: 'error', code: 'internal_error', message: '房间服务暂时不可用' }
      socket.send(JSON.stringify(result))
    })
  }

  private async processMessage(socket: WorkerWebSocket, data: string | ArrayBuffer | Blob): Promise<void> {
    const connection = this.sockets.get(socket)
    if (!connection || typeof data !== 'string') return
    const message = JSON.parse(data) as ClientCommand
    if (message.type !== 'command' || !message.id || !message.command?.type) throw new RoomError('invalid_command', '消息格式无效')
    const snapshot = await this.getEngine('').command(connection.sessionToken, message.command)
    socket.send(JSON.stringify({ ...snapshot, requestId: message.id }))
    await this.broadcast()
  }

  private async sendSnapshot(socket: WorkerWebSocket, playerId: string): Promise<void> {
    socket.send(JSON.stringify(await this.getEngine('').snapshotFor(playerId, this.onlineIds())))
  }

  private async broadcast(): Promise<void> {
    await Promise.all(Array.from(this.sockets.entries()).map(([socket, connection]) => this.sendSnapshot(socket, connection.playerId)))
  }

  private onlineIds(): Set<string> {
    return new Set(Array.from(this.sockets.values(), (connection) => connection.playerId))
  }
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = await request.json()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = roomCode()
    const id = env.ROOMS.idFromName(code)
    const response = await env.ROOMS.get(id).fetch(new Request(`https://room.internal/api/rooms/${code}/bootstrap`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
    const result = await response.json() as Record<string, unknown>
    if (response.status !== 400 || result.error !== 'room_full') return json({ ...result, roomCode: code, shareUrl: new URL(`/room/${code}`, request.url).toString() }, { status: response.ok ? 201 : response.status })
  }
  return json({ error: 'room_unavailable', message: '暂时无法创建房间，请重试' }, { status: 503 })
}

function roomRequest(request: Request, env: Env): Promise<Response> {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  const code = segments[2]
  if (!code) return Promise.resolve(json({ error: 'room_code_required', message: '缺少房间码' }, { status: 400 }))
  const id = env.ROOMS.idFromName(code.toUpperCase())
  return env.ROOMS.get(id).fetch(request)
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/rooms' && request.method === 'POST') return createRoom(request, env)
    if (url.pathname.startsWith('/api/rooms/')) return roomRequest(request, env)
    if (url.pathname === '/api/health') return Promise.resolve(json({ ok: true, service: 'party-game' }))
    if (request.method === 'GET' && /^\/room\/\d{6}\/?$/i.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request))
    return env.ASSETS.fetch(request)
  },
}
