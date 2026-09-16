import assert from 'node:assert/strict'
import test from 'node:test'
import worker, { RoomDurableObject } from '../src/worker.ts'

class MemoryStorage {
  values = new Map()
  async get(key) { return this.values.get(key) }
  async put(key, value) { this.values.set(key, structuredClone(value)) }
  async delete(key) { return this.values.delete(key) }
  async setAlarm() {}
}

class FakeNamespace {
  objects = new Map()
  idFromName(name) { return { name, toString: () => name } }
  get(id) {
    if (!this.objects.has(id.name)) this.objects.set(id.name, new RoomDurableObject({ storage: new MemoryStorage() }))
    return this.objects.get(id.name)
  }
}

function env() {
  return { ROOMS: new FakeNamespace(), ASSETS: { fetch: async () => new Response('asset') } }
}

test('worker health, create, and join endpoints use one room runtime', async () => {
  const runtime = env()
  const health = await worker.fetch(new Request('https://party.test/api/health'), runtime)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { ok: true, service: 'party-game' })

  const created = await worker.fetch(new Request('https://party.test/api/rooms', { method: 'POST', body: JSON.stringify({ nickname: 'Alice' }), headers: { 'content-type': 'application/json' } }), runtime)
  assert.equal(created.status, 201)
  const creator = await created.json()
  assert.match(creator.roomCode, /^\d{6}$/)
  assert.match(creator.shareUrl, /\/room\/\d{6}$/)

  const joined = await worker.fetch(new Request(`https://party.test/api/rooms/${creator.roomCode}/join`, { method: 'POST', body: JSON.stringify({ nickname: 'Bob' }), headers: { 'content-type': 'application/json' } }), runtime)
  assert.equal(joined.status, 200)
  assert.equal((await joined.json()).room.players.length, 2)
})

test('durable object alarm removes an expired room record', async () => {
  const storage = new MemoryStorage()
  const room = new RoomDurableObject({ storage })
  const response = await room.fetch(new Request('https://room.test/api/rooms/123456/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ nickname: 'Alice' }),
    headers: { 'content-type': 'application/json' },
  }))
  assert.equal(response.status, 200)

  const record = await storage.get('room')
  record.expiresAt = Date.now() - 1
  await storage.put('room', record)
  await new RoomDurableObject({ storage }).alarm()
  assert.equal(await storage.get('room'), undefined)
})
