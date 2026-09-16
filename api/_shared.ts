import type { VercelRequest, VercelResponse } from '@vercel/node'
import { RoomError } from '../src/room/engine.ts'
import { errorBody, errorStatus, redisClient } from '../src/vercel-runtime.ts'

export type JsonObject = Record<string, unknown>

export function codeFrom(req: VercelRequest): string {
  const value = req.query.code
  return (Array.isArray(value) ? value[0] : value ?? '').toString().trim().toUpperCase()
}

export function queryValue(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name]
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined
}

export function sessionToken(req: VercelRequest, body?: JsonObject): string | undefined {
  const header = req.headers['x-session-token']
  const fromHeader = Array.isArray(header) ? header[0] : header
  return fromHeader ?? (typeof body?.sessionToken === 'string' ? body.sessionToken : undefined)
}

export async function requestBody(req: VercelRequest): Promise<JsonObject> {
  if (req.body && typeof req.body === 'object') return req.body as JsonObject
  if (typeof req.body === 'string') return JSON.parse(req.body) as JsonObject
  return {}
}

export function nicknameFrom(body: JsonObject): string {
  if (typeof body.nickname !== 'string') throw new RoomError('nickname_invalid', '请输入昵称')
  return body.nickname
}

export function json(res: VercelResponse, body: unknown, status = 200): void {
  res.status(status).json(body)
}

export function shareUrl(req: VercelRequest, code: string): string {
  const forwardedProto = req.headers['x-forwarded-proto']
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ?? 'https'
  const host = req.headers.host ?? 'localhost:3000'
  return `${protocol}://${host}/room/${code}`
}

export async function withApiError(res: VercelResponse, action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    json(res, errorBody(error), errorStatus(error))
  }
}

export function redis() {
  return redisClient()
}
