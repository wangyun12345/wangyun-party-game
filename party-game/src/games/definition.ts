import type { ComponentType } from 'react'
import type { Action, GamePlugin, GameState, PhaseUI, Player, WinResult } from './types'

export interface GameViewProps {
  view: PhaseUI
  sendCommand: (command: Action) => Promise<void>
  pending: boolean
  connected: boolean
}

export interface GameDefinition {
  id: string
  name: string
  minPlayers: number
  maxPlayers: number
  init(players: Player[]): GameState
  reduce(state: GameState, action: Action): GameState
  result(state: GameState): WinResult | null
  projectFor(state: GameState, playerId: string): PhaseUI
  View: ComponentType<GameViewProps>
}

export function defineGame(plugin: GamePlugin, View: ComponentType<GameViewProps>): GameDefinition {
  return {
    id: plugin.id,
    name: plugin.name,
    minPlayers: plugin.minPlayers,
    maxPlayers: plugin.maxPlayers,
    init: plugin.initGame,
    reduce: plugin.handleAction,
    result: plugin.checkWinCondition,
    projectFor: plugin.getPhaseUI,
    View,
  }
}
