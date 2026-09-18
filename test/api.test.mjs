import assert from 'node:assert/strict'
import test from 'node:test'
import health from '../api/health.ts'
import createRoom from '../api/rooms/index.ts'

function response() {
  return {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this },
    json(body) { this.payload = body; },
  }
}

test('Vercel health function reports the active runtime', async () => {
  const res = response()
  health({}, res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.payload, { ok: true, service: 'party-game', runtime: 'vercel' })
})

test('room function loads through the Vercel import graph and reports missing storage', async () => {
  const names = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  names.forEach((name) => { delete process.env[name] })
  try {
    const res = response()
    await createRoom({ method: 'POST', body: { nickname: '测试玩家' }, headers: { host: 'example.test' } }, res)
    assert.equal(res.statusCode, 503)
    assert.equal(res.payload.error, 'storage_not_configured')
  } finally {
    names.forEach((name) => {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    })
  }
})
