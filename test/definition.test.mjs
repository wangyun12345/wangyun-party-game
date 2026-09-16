import assert from 'node:assert/strict'
import test from 'node:test'
import { defineGame } from '../party-game/src/games/definition.ts'

const plugin = {
  id: 'fake', name: 'Fake', minPlayers: 1, maxPlayers: 4,
  initGame: (players) => ({ phase: 'start', publicInfo: {}, privateInfo: { [players[0].id]: { secret: 'only-me' } } }),
  handleAction: (state) => state,
  checkWinCondition: () => null,
  getPhaseUI: (state, playerId) => ({ phase: state.phase, title: 'Fake', publicData: {}, privateData: state.privateInfo[playerId], availableActions: [] }),
}

test('game definition adapts pure rules and player projection', () => {
  const view = () => null
  const definition = defineGame(plugin, view)
  const state = definition.init([{ id: 'p1', nickname: 'Alice', isHost: true }])
  assert.equal(definition.projectFor(state, 'p1').privateData.secret, 'only-me')
  assert.equal(definition.View, view)
})
