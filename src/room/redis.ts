import { Redis } from '@upstash/redis'
import type { RoomStorage } from './engine.js'

export interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string, options?: { nx?: boolean; ex?: number }): Promise<unknown>
  del(key: string): Promise<unknown>
}

export class RedisRoomStorage implements RoomStorage {
  private readonly prefix: string
  private readonly redis: RedisLike

  constructor(redis: RedisLike, roomCode: string) {
    this.redis = redis
    this.prefix = `party-game:room:${roomCode.toUpperCase()}:`
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.redis.get<unknown>(`${this.prefix}${key}`)
    if (value === null || value === undefined) return undefined
    if (typeof value === 'string') return JSON.parse(value) as T
    return value as T
  }

  async put<T>(key: string, value: T): Promise<void> {
    await this.redis.set(`${this.prefix}${key}`, JSON.stringify(value))
  }

  async delete(key: string): Promise<boolean> {
    return Number(await this.redis.del(`${this.prefix}${key}`)) > 0
  }
}

export function createRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required')
  return new Redis({ url, token })
}

export async function withRoomLock<T>(redis: RedisLike, roomCode: string, action: () => Promise<T>): Promise<T> {
  const key = `party-game:lock:${roomCode.toUpperCase()}`
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await redis.set(key, token, { nx: true, ex: 5 })
    if (result === 'OK' || result === true) {
      try {
        return await action()
      } finally {
        await redis.del(key)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error('room_busy')
}
