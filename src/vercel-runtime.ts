import { GameRegistry } from '../party-game/src/games/registry'
import '../party-game/src/games/register'
import { RoomEngine, RoomError } from './room/engine'
import { createRedisClient, RedisRoomStorage, withRoomLock, type RedisLike } from './room/redis'

export const gameCatalog = { get: (id: string) => GameRegistry.get(id) }

export function redisClient(): RedisLike {
  return createRedisClient()
}

export function roomEngine(redis: RedisLike, code: string): RoomEngine {
  return new RoomEngine(new RedisRoomStorage(redis, code), code.toUpperCase(), gameCatalog)
}

export async function withRoom<T>(redis: RedisLike, code: string, action: (engine: RoomEngine) => Promise<T>): Promise<T> {
  return withRoomLock(redis, code, () => action(roomEngine(redis, code)))
}

export function statusFor(error: unknown): number {
  if (!(error instanceof RoomError)) return 500
  if (error.code === 'room_not_found') return 404
  if (error.code === 'room_expired') return 410
  if (error.code === 'invalid_session') return 401
  if (error.code === 'room_full' || error.code === 'room_started') return 409
  if (error.code === 'forbidden') return 403
  return 400
}

export function errorBody(error: unknown): { error: string; message: string } {
  if (error instanceof RoomError) return { error: error.code, message: error.message }
  if (error instanceof Error && error.message.includes('UPSTASH_REDIS')) {
    return { error: 'storage_not_configured', message: '房间存储尚未配置，请在 Vercel 绑定 Upstash Redis' }
  }
  if (error instanceof Error && error.message === 'room_busy') {
    return { error: 'room_busy', message: '房间正在处理上一条操作，请稍后重试' }
  }
  console.error('party-game api failure', error)
  return { error: 'internal_error', message: '房间服务暂时不可用' }
}

export function errorStatus(error: unknown): number {
  if (error instanceof Error && error.message.includes('UPSTASH_REDIS')) return 503
  if (error instanceof Error && error.message === 'room_busy') return 503
  return statusFor(error)
}
