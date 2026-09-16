import assert from 'node:assert/strict'
import test from 'node:test'
import { AvalonPlugin } from '../party-game/src/games/avalon/index.ts'
import { GooseDuckPlugin } from '../party-game/src/games/goose-duck/index.ts'

const players = [
  { id: 'p1', nickname: 'Alice', isHost: true },
  { id: 'p2', nickname: 'Bob', isHost: false },
  { id: 'p3', nickname: 'Cici', isHost: false },
  { id: 'p4', nickname: 'Dora', isHost: false },
  { id: 'p5', nickname: 'Evan', isHost: false },
]

test('Avalon keeps role projection private and reduces a confirmation', () => {
  const state = AvalonPlugin.initGame(players)
  const own = AvalonPlugin.getPhaseUI(state, 'p1')
  const other = AvalonPlugin.getPhaseUI(state, 'p2')
  assert.ok(Object.keys(own.privateData).length > 0)
  assert.ok(Object.keys(other.privateData).length > 0)
  assert.notDeepEqual(own.privateData, other.privateData)
  assert.equal(AvalonPlugin.handleAction(state, { playerId: 'p1', type: 'confirm_role' }).phase, 'nominate')
})

test('Goose Duck keeps role projection private and starts a meeting from free play', () => {
  const state = GooseDuckPlugin.initGame(players)
  const own = GooseDuckPlugin.getPhaseUI(state, 'p1')
  assert.ok(Object.keys(own.privateData).length > 0)
  const free = GooseDuckPlugin.handleAction(state, { playerId: 'p1', type: 'confirm_role' })
  assert.equal(free.phase, 'free')
  const meeting = GooseDuckPlugin.handleAction(free, { playerId: 'p1', type: 'call_meeting' })
  assert.equal(meeting.phase, 'discussion')
})
