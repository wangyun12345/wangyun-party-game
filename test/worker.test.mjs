import assert from 'node:assert/strict'
import test from 'node:test'
import { RedisRoomStorage, withRoomLock } from '../src/room/redis.ts'

class FakeRedis {
  values = new Map()
  locks = new Map()

  async get(key) { return this.values.get(key) ?? null }
  async set(key, value, options = {}) {
    if (options.nx && this.locks.has(key)) return null
    if (options.nx) this.locks.set(key, value)
    this.values.set(key, value)
    return 'OK'
  }
  async del(key) {
    const existed = this.values.delete(key) || this.locks.has(key)
    this.locks.delete(key)
    return existed ? 1 : 0
  }
}

test('Redis room storage keeps room records isolated by room code', async () => {
  const redis = new FakeRedis()
  const first = new RedisRoomStorage(redis, '123456')
  const second = new RedisRoomStorage(redis, '654321')
  await first.put('room', { code: '123456', sequence: 1 })
  assert.deepEqual(await first.get('room'), { code: '123456', sequence: 1 })
  assert.equal(await second.get('room'), undefined)
})

test('room commands use a distributed lock and release it after completion', async () => {
  const redis = new FakeRedis()
  const result = await withRoomLock(redis, '123456', async () => 'ok')
  assert.equal(result, 'ok')
  assert.equal(redis.locks.size, 0)
})
