import type { VercelRequest, VercelResponse } from '@vercel/node'
import { codeFrom, nicknameFrom, requestBody, json, shareUrl, sessionToken, withApiError, redis } from '../../_shared.ts'
import { withRoom } from '../../../src/vercel-runtime.ts'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    json(res, { error: 'method_not_allowed', message: '只支持 POST 请求' }, 405)
    return
  }
  await withApiError(res, async () => {
    const body = await requestBody(req)
    const code = codeFrom(req)
    const result = await withRoom(redis(), code, (engine) => engine.join(nicknameFrom(body), sessionToken(req, body)))
    json(res, { ...result, roomCode: code, shareUrl: shareUrl(req, code) })
  })
}
