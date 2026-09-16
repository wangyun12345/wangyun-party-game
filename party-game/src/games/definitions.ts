import { defineGame, type GameDefinition } from './definition'
import { AvalonPlugin } from './avalon/index.ts'
import { AvalonView } from './avalon/View'
import { GooseDuckPlugin } from './goose-duck/index.ts'
import { GooseDuckView } from './goose-duck/View'

export const GameDefinitions = new Map<string, GameDefinition>([
  [AvalonPlugin.id, defineGame(AvalonPlugin, AvalonView)],
  [GooseDuckPlugin.id, defineGame(GooseDuckPlugin, GooseDuckView)],
])

export function getGameDefinition(gameId: string): GameDefinition | undefined {
  return GameDefinitions.get(gameId)
}
