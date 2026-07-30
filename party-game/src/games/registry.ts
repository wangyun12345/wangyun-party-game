import type { GamePlugin } from './types'

class GameRegistryImpl {
  private plugins: Map<string, GamePlugin> = new Map()

  register(plugin: GamePlugin) {
    this.plugins.set(plugin.id, plugin)
  }

  get(id: string): GamePlugin | undefined {
    return this.plugins.get(id)
  }

  getAll(): GamePlugin[] {
    return Array.from(this.plugins.values())
  }
}

export const GameRegistry = new GameRegistryImpl()
