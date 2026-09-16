import type { PhaseUI, WinResult } from '../games/types'

export interface RoomPlayer {
  id: string
  nickname: string
  isOrganizer: boolean
  joinedAt: number
  online?: boolean
}

export interface RoomView {
  code: string
  status: 'waiting' | 'playing' | 'finished'
  organizerId: string
  gameId: string | null
  players: RoomPlayer[]
  organizerOnline?: boolean
}

export interface RoomSnapshot {
  type: 'snapshot'
  sequence: number
  room: RoomView
  game: PhaseUI | null
  winResult: WinResult | null
  requestId?: string
}

export interface RoomErrorMessage {
  type: 'error'
  code: string
  message: string
  requestId?: string
}

export interface JoinResult {
  playerId: string
  sessionToken: string
  room: RoomView
  roomCode?: string
  shareUrl?: string
}

const SESSION_PREFIX = 'party-game:session:'

function apiUrl(path: string): string {
  return `${window.location.origin}${path}`
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
  const body = await response.json() as T & { message?: string }
  if (!response.ok) throw new Error(body.message ?? '房间请求失败')
  return body
}

export function sessionKey(roomCode: string): string {
  return `${SESSION_PREFIX}${roomCode.toUpperCase()}`
}

export function loadSession(roomCode: string): string | null {
  return localStorage.getItem(sessionKey(roomCode))
}

export function saveSession(roomCode: string, token: string): void {
  localStorage.setItem(sessionKey(roomCode), token)
}

export function clearSession(roomCode: string): void {
  localStorage.removeItem(sessionKey(roomCode))
}

export function createRoom(nickname: string): Promise<JoinResult> {
  return requestJson<JoinResult>('/api/rooms', { method: 'POST', body: JSON.stringify({ nickname }) })
}

export function joinRoom(roomCode: string, nickname: string, sessionToken?: string): Promise<JoinResult> {
  return requestJson<JoinResult>(`/api/rooms/${encodeURIComponent(roomCode.toUpperCase())}/join`, {
    method: 'POST',
    body: JSON.stringify({ nickname, ...(sessionToken ? { sessionToken } : {}) }),
  })
}

export function leaveRoom(roomCode: string, sessionToken: string): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(`/api/rooms/${encodeURIComponent(roomCode.toUpperCase())}/leave`, {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  })
}

export class RoomSocket {
  private readonly roomCode: string
  private readonly sessionToken: string
  private readonly onSnapshot: (snapshot: RoomSnapshot) => void
  private readonly onError: (error: RoomErrorMessage) => void
  private readonly onStatus: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private closed = false
  private lastSequence = -1
  private requestCounter = 0

  constructor(roomCode: string, sessionToken: string, onSnapshot: (snapshot: RoomSnapshot) => void, onError: (error: RoomErrorMessage) => void, onStatus: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void) {
    this.roomCode = roomCode
    this.sessionToken = sessionToken
    this.onSnapshot = onSnapshot
    this.onError = onError
    this.onStatus = onStatus
  }

  connect(): void {
    this.closed = false
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer)
    this.onStatus(this.socket ? 'reconnecting' : 'connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.socket = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(this.roomCode)}/ws`, ['party-game.v1', this.sessionToken])
    this.socket.addEventListener('open', () => this.onStatus('connected'))
    this.socket.addEventListener('message', (event) => this.handleMessage(event.data))
    this.socket.addEventListener('close', () => {
      this.socket = null
      if (this.closed) {
        this.onStatus('disconnected')
      } else {
        this.onStatus('reconnecting')
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1500)
      }
    })
    this.socket.addEventListener('error', () => this.onStatus('reconnecting'))
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer)
    this.socket?.close()
    this.socket = null
  }

  send(command: { type: string; payload?: Record<string, unknown> }): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify({ type: 'command', id: `request-${++this.requestCounter}`, command }))
  }

  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw) as RoomSnapshot | RoomErrorMessage
      if (message.type === 'snapshot') {
        if (message.sequence < this.lastSequence) return
        this.lastSequence = message.sequence
        this.onSnapshot(message)
      } else {
        this.onError(message)
      }
    } catch {
      this.onError({ type: 'error', code: 'invalid_message', message: '收到无法识别的房间消息' })
    }
  }
}
