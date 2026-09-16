import assert from 'node:assert/strict'
import test from 'node:test'
import { RoomEngine, RoomError } from '../src/room/engine.ts'

const fakeGame = {
  id: 'goose-duck',
  name: '测试游戏',
  minPlayers: 2,
  maxPlayers: 8,
  initGame(players) {
    return {
      phase: 'playing',
      publicInfo: { playerNames: Object.fromEntries(players.map((player) => [player.id, player.nickname])) },
      privateInfo: Object.fromEntries(players.map((player, index) => [player.id, { 身份: index === 0 ? 'host-secret' : 'guest-secret' }])),
    }
  },
  handleAction(state, action) {
    if (action.type !== 'ping') return state
    return { ...state, phase: 'updated' }
  },
  getPhaseUI(state, playerId) {
    return { phase: state.phase, title: '测试', publicData: {}, privateData: state.privateInfo[playerId], availableActions: [] }
  },
  checkWinCondition() { return null },
}
const catalog = { get: (id) => id === fakeGame.id ? fakeGame : undefined }

class MemoryStorage {
  values = new Map()
  alarm = 0

  async get(key) { return this.values.get(key) }
  async put(key, value) { this.values.set(key, structuredClone(value)) }
  async delete(key) { return this.values.delete(key) }
  async setAlarm(timestamp) { this.alarm = timestamp }
}

const ids = ['host', 'p2', 'p3', 'p4', 'p5', 'p6']
function createEngine(now = () => 1000, inactivityLifetimeMs = 10000) {
  let index = 0
  return new RoomEngine(new MemoryStorage(), '123456', catalog, {
    now,
    inactivityLifetimeMs,
    randomId: () => ids[index++] ?? `id-${index}`,
  })
}

test('room creation and reconnect reuse one seat', async () => {
  const engine = createEngine()
  const created = await engine.bootstrap(' Alice ')
  const resumed = await engine.join('Ignored', created.sessionToken)
  assert.equal(resumed.playerId, created.playerId)
  assert.equal(resumed.room.players.length, 1)
  await assert.rejects(() => engine.join('Bob', 'wrong-token'), (error) => error instanceof RoomError && error.code === 'invalid_session')
})

test('commands are sequenced and hidden data is projected per player', async () => {
  const engine = createEngine()
  const host = await engine.bootstrap('Alice')
  const p2 = await engine.join('Bob')
  await engine.join('Cici')
  await engine.join('Dora')
  await engine.command(host.sessionToken, { type: 'select_game', payload: { gameId: 'goose-duck' } })
  const started = await engine.command(host.sessionToken, { type: 'start_game' })
  assert.equal(started.room.status, 'playing')
  assert.ok(started.sequence > 0)

  const hostView = await engine.snapshotFor(host.playerId)
  const playerView = await engine.snapshotFor(p2.playerId)
  assert.ok(hostView.game?.privateData)
  assert.ok(playerView.game?.privateData)
  assert.deepEqual(Object.keys(hostView.game.privateData), Object.keys(playerView.game.privateData))
  assert.notEqual(hostView.game.privateData['身份'], undefined)
  assert.equal(JSON.stringify(hostView.game).includes(p2.playerId), false)
})

test('leave invalidates a seat and expiry rejects the room', async () => {
  let now = 1000
  const engine = createEngine(() => now, 100)
  const host = await engine.bootstrap('Alice')
  const guest = await engine.join('Bob')
  await engine.leave(guest.sessionToken)
  await assert.rejects(() => engine.join('Bob', guest.sessionToken), (error) => error instanceof RoomError && error.code === 'invalid_session')
  now = 1201
  await assert.rejects(() => engine.join('Cici'), (error) => error instanceof RoomError && error.code === 'room_expired')
  assert.equal((await engine.expireIfNeeded()), false)
  await assert.rejects(() => engine.authenticate(host.sessionToken), (error) => error instanceof RoomError && error.code === 'room_not_found')
})
