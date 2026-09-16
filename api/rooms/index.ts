import { randomInt } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { nicknameFrom, requestBody, json, shareUrl, withApiError, redis } from '../_shared.js'
import { withRoom } from '../../src/vercel-runtime.js'
import { RoomError } from '../../src/room/engine.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    json(res, { error: 'method_not_allowed', message: '只支持 POST 请求' }, 405)
    return
  }

  await withApiError(res, async () => {
    const body = await requestBody(req)
    const nickname = nicknameFrom(body)
    const client = redis()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = String(randomInt(100000, 1000000))
      try {
        const result = await withRoom(client, code, (engine) => engine.bootstrap(nickname))
        json(res, { ...result, roomCode: code, shareUrl: shareUrl(req, code) }, 201)
        return
      } catch (error) {
        if (!(error instanceof RoomError) || error.code !== 'room_full') throw error
      }
    }
    throw new Error('room_busy')
  })
}
