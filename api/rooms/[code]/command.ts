import type { VercelRequest, VercelResponse } from '@vercel/node'
import { codeFrom, json, requestBody, sessionToken, withApiError, redis } from '../../_shared.ts'
import { withRoom } from '../../../src/vercel-runtime.ts'
import { RoomError } from '../../../src/room/engine.ts'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    json(res, { error: 'method_not_allowed', message: '只支持 POST 请求' }, 405)
    return
  }
  await withApiError(res, async () => {
    const body = await requestBody(req)
    const token = sessionToken(req, body)
    const command = body.command
    if (!token || !command || typeof command !== 'object' || typeof (command as { type?: unknown }).type !== 'string') {
      throw new RoomError('invalid_command', '命令格式无效')
    }
    const result = await withRoom(redis(), codeFrom(req), (engine) => engine.command(token, command as { type: string; payload?: Record<string, unknown> }))
    json(res, result)
  })
}
