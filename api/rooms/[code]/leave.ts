import type { VercelRequest, VercelResponse } from '@vercel/node'
import { codeFrom, json, requestBody, sessionToken, withApiError, redis } from '../../_shared'
import { withRoom } from '../../../src/vercel-runtime'
import { RoomError } from '../../../src/room/engine'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    json(res, { error: 'method_not_allowed', message: '只支持 POST 请求' }, 405)
    return
  }
  await withApiError(res, async () => {
    const body = await requestBody(req)
    const token = sessionToken(req, body)
    if (!token) throw new RoomError('invalid_session', '玩家凭据无效')
    await withRoom(redis(), codeFrom(req), (engine) => engine.leave(token))
    json(res, { ok: true })
  })
}
