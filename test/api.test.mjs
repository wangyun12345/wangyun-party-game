import assert from 'node:assert/strict'
import test from 'node:test'
import health from '../api/health.ts'

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
