import type { Action, GameState, Player, PhaseUI, WinResult } from '../../party-game/src/games/types.ts'

export interface GamePluginLike {
  id: string
  name: string
  minPlayers: number
  maxPlayers: number
  initGame(players: Player[]): GameState
  handleAction(state: GameState, action: Action): GameState
  getPhaseUI(state: GameState, viewerPlayerId: string): PhaseUI
  checkWinCondition(state: GameState): WinResult | null
}

export interface GameCatalog {
  get(id: string): GamePluginLike | undefined
}

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export interface StoredPlayer {
  id: string
  nickname: string
  isOrganizer: boolean
  tokenDigest: string
  joinedAt: number
}

export interface RoomRecord {
  code: string
  status: RoomStatus
  organizerId: string
  gameId: string | null
  gameState: GameState | null
  players: StoredPlayer[]
  sequence: number
  createdAt: number
  lastActivityAt: number
  expiresAt: number
}

export interface RoomStorage {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  setAlarm?(timestamp: number): Promise<void>
}

export interface PublicPlayer {
  id: string
  nickname: string
  isOrganizer: boolean
  joinedAt: number
  online?: boolean
}

export interface RoomView {
  code: string
  status: RoomStatus
  organizerId: string
  gameId: string | null
  players: PublicPlayer[]
  organizerOnline?: boolean
}

export interface PlayerSnapshot {
  type: 'snapshot'
  sequence: number
  room: RoomView
  game: {
    phase: string
    title: string
    description?: string
    publicData: Record<string, unknown>
    privateData: Record<string, unknown>
    availableActions: Array<{
      type: string
      label: string
      disabled?: boolean
      options?: { value: string; label: string }[]
    }>
  } | null
  winResult: WinResult | null
}

export type RoomErrorCode =
  | 'invalid_session'
  | 'room_not_found'
  | 'room_expired'
  | 'room_started'
  | 'room_full'
  | 'forbidden'
  | 'invalid_command'
  | 'nickname_invalid'
  | 'game_required'

export class RoomError extends Error {
  readonly code: RoomErrorCode

  constructor(code: RoomErrorCode, message: string) {
    super(message)
    this.name = 'RoomError'
    this.code = code
  }
}

export interface RoomEngineOptions {
  now?: () => number
  randomId?: () => string
  inactivityLifetimeMs?: number
}

const RECORD_KEY = 'room'

function randomId(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function validateNickname(nickname: string): string {
  const value = nickname.trim()
  if (value.length < 2 || value.length > 12) throw new RoomError('nickname_invalid', '昵称需要为 2-12 个字符')
  return value
}

function roomView(record: RoomRecord, onlineIds?: Set<string>): RoomView {
  return {
    code: record.code,
    status: record.status,
    organizerId: record.organizerId,
    gameId: record.gameId,
    players: record.players.map(({ id, nickname, isOrganizer, joinedAt }) => ({ id, nickname, isOrganizer, joinedAt, ...(onlineIds ? { online: onlineIds.has(id) } : {}) })),
    ...(onlineIds ? { organizerOnline: onlineIds.has(record.organizerId) } : {}),
  }
}

export class RoomEngine {
  private readonly storage: RoomStorage
  private readonly code: string
  private readonly catalog: GameCatalog
  private readonly now: () => number
  private readonly randomId: () => string
  private readonly inactivityLifetimeMs: number
  private record: RoomRecord | null = null

  constructor(storage: RoomStorage, code: string, catalog: GameCatalog, options: RoomEngineOptions = {}) {
    this.storage = storage
    this.code = code
    this.catalog = catalog
    this.now = options.now ?? (() => Date.now())
    this.randomId = options.randomId ?? randomId
    this.inactivityLifetimeMs = options.inactivityLifetimeMs ?? 24 * 60 * 60 * 1000
  }

  async load(): Promise<RoomRecord | null> {
    if (!this.record) this.record = (await this.storage.get<RoomRecord>(RECORD_KEY)) ?? null
    return this.record
  }

  async bootstrap(nickname: string): Promise<{ playerId: string; sessionToken: string; room: RoomView }> {
    if (await this.load()) throw new RoomError('room_full', '房间码已被占用')
    const now = this.now()
    const sessionToken = this.randomId()
    const playerId = this.randomId()
    const record: RoomRecord = {
      code: this.code,
      status: 'waiting',
      organizerId: playerId,
      gameId: null,
      gameState: null,
      players: [{ id: playerId, nickname: validateNickname(nickname), isOrganizer: true, tokenDigest: await digest(sessionToken), joinedAt: now }],
      sequence: 0,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + this.inactivityLifetimeMs,
    }
    await this.save(record)
    return { playerId, sessionToken, room: roomView(record) }
  }

  async join(nickname: string, sessionToken?: string): Promise<{ playerId: string; sessionToken: string; room: RoomView }> {
    const record = await this.requireRoom()
    if (this.now() >= record.expiresAt) throw new RoomError('room_expired', '房间已过期')
    if (sessionToken) {
      const tokenDigest = await digest(sessionToken)
      const existing = record.players.find((player) => player.tokenDigest === tokenDigest)
      if (existing) return { playerId: existing.id, sessionToken, room: roomView(record) }
      throw new RoomError('invalid_session', '玩家凭据无效')
    }
    if (record.status !== 'waiting') throw new RoomError('room_started', '游戏已经开始，无法加入')
    const plugin = record.gameId ? this.catalog.get(record.gameId) : null
    if (plugin && record.players.length >= plugin.maxPlayers) throw new RoomError('room_full', '房间已满')
    const token = this.randomId()
    const player: StoredPlayer = {
      id: this.randomId(),
      nickname: validateNickname(nickname),
      isOrganizer: false,
      tokenDigest: await digest(token),
      joinedAt: this.now(),
    }
    record.players.push(player)
    await this.touch(record)
    return { playerId: player.id, sessionToken: token, room: roomView(record) }
  }

  async authenticate(sessionToken: string): Promise<StoredPlayer> {
    const record = await this.requireRoom()
    const tokenDigest = await digest(sessionToken)
    const player = record.players.find((candidate) => candidate.tokenDigest === tokenDigest)
    if (!player) throw new RoomError('invalid_session', '玩家凭据无效')
    return player
  }

  async leave(sessionToken: string): Promise<void> {
    const record = await this.requireRoom()
    const player = await this.authenticate(sessionToken)
    if (record.status !== 'waiting') throw new RoomError('invalid_command', '游戏开始后不能离开房间')
    record.players = record.players.filter((candidate) => candidate.id !== player.id)
    if (record.players.length === 0) {
      await this.storage.delete(RECORD_KEY)
      this.record = null
      return
    }
    if (record.organizerId === player.id) {
      record.organizerId = record.players[0].id
      record.players[0].isOrganizer = true
    }
    await this.touch(record)
  }

  async command(sessionToken: string, command: { type: string; payload?: Record<string, unknown> }): Promise<PlayerSnapshot> {
    const record = await this.requireRoom()
    const player = await this.authenticate(sessionToken)
    const plugin = record.gameId ? this.catalog.get(record.gameId) : null
    const payload = command.payload ?? {}

    if (command.type === 'select_game') {
      this.requireOrganizer(record, player)
      if (record.status !== 'waiting' || typeof payload.gameId !== 'string' || !this.catalog.get(payload.gameId)) {
        throw new RoomError('invalid_command', '不能选择该游戏')
      }
      record.gameId = payload.gameId
    } else if (command.type === 'start_game') {
      this.requireOrganizer(record, player)
      if (record.status !== 'waiting' || !plugin) throw new RoomError('game_required', '请先选择游戏')
      if (record.players.length < plugin.minPlayers || record.players.length > plugin.maxPlayers) {
        throw new RoomError('invalid_command', '当前人数不符合游戏要求')
      }
      const gamePlayers: Player[] = record.players.map((candidate) => ({ id: candidate.id, nickname: candidate.nickname, isHost: candidate.isOrganizer }))
      record.gameState = plugin.initGame(gamePlayers)
      record.status = 'playing'
    } else if (command.type === 'transfer_organizer') {
      this.requireOrganizer(record, player)
      const target = record.players.find((candidate) => candidate.id === payload.playerId)
      if (!target) throw new RoomError('invalid_command', '组织者目标不存在')
      record.players.forEach((candidate) => { candidate.isOrganizer = candidate.id === target.id })
      record.organizerId = target.id
    } else if (command.type === 'return_lobby') {
      this.requireOrganizer(record, player)
      record.status = 'waiting'
      record.gameState = null
    } else if (command.type === 'replay') {
      this.requireOrganizer(record, player)
      if (!plugin) throw new RoomError('game_required', '请先选择游戏')
      const gamePlayers: Player[] = record.players.map((candidate) => ({ id: candidate.id, nickname: candidate.nickname, isHost: candidate.isOrganizer }))
      record.gameState = plugin.initGame(gamePlayers)
      record.status = 'playing'
    } else {
      if (!plugin || !record.gameState || record.status !== 'playing') throw new RoomError('invalid_command', '当前无法执行游戏动作')
      const action: Action = { playerId: player.id, type: command.type, payload }
      const nextState = plugin.handleAction(record.gameState, action)
      if (nextState === record.gameState) throw new RoomError('invalid_command', '动作不符合当前游戏阶段')
      record.gameState = nextState
      if (plugin.checkWinCondition(nextState)) record.status = 'finished'
    }

    await this.touch(record)
    return this.snapshotFor(player.id)
  }

  async snapshotFor(playerId: string, onlineIds?: Set<string>): Promise<PlayerSnapshot> {
    const record = await this.requireRoom()
    const player = record.players.find((candidate) => candidate.id === playerId)
    if (!player) throw new RoomError('invalid_session', '玩家席位不存在')
    const plugin = record.gameId ? this.catalog.get(record.gameId) : null
    const phaseUI = plugin && record.gameState ? plugin.getPhaseUI(record.gameState, player.id) : null
    return {
      type: 'snapshot',
      sequence: record.sequence,
      room: roomView(record, onlineIds),
      game: phaseUI,
      winResult: plugin && record.gameState ? plugin.checkWinCondition(record.gameState) : null,
    }
  }

  async expireIfNeeded(): Promise<boolean> {
    const record = await this.load()
    if (!record || this.now() < record.expiresAt) return false
    await this.storage.delete(RECORD_KEY)
    this.record = null
    return true
  }

  private async requireRoom(): Promise<RoomRecord> {
    const record = await this.load()
    if (!record) throw new RoomError('room_not_found', '房间不存在')
    if (this.now() >= record.expiresAt) {
      await this.expireIfNeeded()
      throw new RoomError('room_expired', '房间已过期')
    }
    return record
  }

  private requireOrganizer(record: RoomRecord, player: StoredPlayer): void {
    if (record.organizerId !== player.id || !player.isOrganizer) throw new RoomError('forbidden', '只有组织者可以执行此操作')
  }

  private async touch(record: RoomRecord): Promise<void> {
    record.sequence += 1
    record.lastActivityAt = this.now()
    record.expiresAt = record.lastActivityAt + this.inactivityLifetimeMs
    await this.save(record)
  }

  private async save(record: RoomRecord): Promise<void> {
    this.record = record
    await this.storage.put(RECORD_KEY, record)
    await this.storage.setAlarm?.(record.expiresAt)
  }
}
