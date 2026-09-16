import type { VercelRequest, VercelResponse } from '@vercel/node'
import { codeFrom, json, queryValue, sessionToken, withApiError, redis } from '../../_shared.js'
import { roomEngine } from '../../../src/vercel-runtime.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    json(res, { error: 'method_not_allowed', message: '只支持 GET 请求' }, 405)
    return
  }
  await withApiError(res, async () => {
    const token = sessionToken(req) ?? queryValue(req, 'sessionToken')
    if (!token) {
      json(res, { error: 'invalid_session', message: '缺少玩家凭据' }, 401)
      return
    }
    const engine = roomEngine(redis(), codeFrom(req))
    const player = await engine.authenticate(token)
    json(res, await engine.snapshotFor(player.id))
  })
}
