export interface Player {
  id: string
  nickname: string
  isHost: boolean
}

export interface GameState {
  phase: string
  publicInfo: Record<string, unknown>
  privateInfo: Record<string, Record<string, unknown>>
}

export interface Action {
  playerId: string
  type: string
  payload?: Record<string, unknown>
}

export interface PhaseUI {
  phase: string
  title: string
  description?: string
  publicData: Record<string, unknown>
  privateData: Record<string, unknown>
  availableActions: ActionOption[]
}

export interface ActionOption {
  type: string
  label: string
  disabled?: boolean
  options?: { value: string; label: string }[]
}

export type WinResult = {
  winner: string
  reason: string
  revealedRoles: { playerId: string; role: string; team: string }[]
}

export interface GamePlugin {
  id: string
  name: string
  minPlayers: number
  maxPlayers: number

  initGame(players: Player[]): GameState
  handleAction(state: GameState, action: Action): GameState
  getPhaseUI(state: GameState, viewerPlayerId: string): PhaseUI
  checkWinCondition(state: GameState): WinResult | null
}
