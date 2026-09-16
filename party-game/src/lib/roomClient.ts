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
  private pollTimer: number | null = null
  private pollInFlight = false
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
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer)
    this.onStatus('connecting')
    void this.refresh()
    this.pollTimer = window.setInterval(() => { void this.refresh() }, 1200)
  }

  close(): void {
    this.closed = true
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer)
    this.pollTimer = null
    this.onStatus('disconnected')
  }

  send(command: { type: string; payload?: Record<string, unknown> }): void {
    if (this.closed) return
    void fetch(`${window.location.origin}/api/rooms/${encodeURIComponent(this.roomCode)}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-token': this.sessionToken },
      body: JSON.stringify({ command, requestId: `request-${++this.requestCounter}` }),
    }).then(async (response) => {
      const body = await response.json() as RoomSnapshot | RoomErrorMessage
      if (!response.ok || body.type === 'error') {
        this.onError(body as RoomErrorMessage)
        return
      }
      this.handleMessage(JSON.stringify(body))
    }).catch(() => this.onStatus('reconnecting'))
  }

  private async refresh(): Promise<void> {
    if (this.closed || this.pollInFlight) return
    this.pollInFlight = true
    try {
      const response = await fetch(`${window.location.origin}/api/rooms/${encodeURIComponent(this.roomCode)}/snapshot`, {
        headers: { 'x-session-token': this.sessionToken },
      })
      const body = await response.json() as RoomSnapshot | RoomErrorMessage
      if (!response.ok || body.type === 'error') {
        this.onError(body as RoomErrorMessage)
        this.onStatus(response.status === 401 ? 'disconnected' : 'reconnecting')
        return
      }
      this.onStatus('connected')
      this.handleMessage(JSON.stringify(body))
    } catch {
      this.onStatus('reconnecting')
    } finally {
      this.pollInFlight = false
    }
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
