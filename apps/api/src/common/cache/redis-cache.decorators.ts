import { SetMetadata } from '@nestjs/common'

export const REDIS_CACHE_METADATA = 'arofi:redis-cache'
export const REDIS_CACHE_INVALIDATE_METADATA = 'arofi:redis-cache-invalidate'

export interface RedisCacheOptions {
  namespace: string
  ttlSeconds: number
  scope?: 'tenant' | 'user'
}

export const RedisCache = (options: RedisCacheOptions) => SetMetadata(REDIS_CACHE_METADATA, options)

export const InvalidateRedisCache = (...namespaces: string[]) =>
  SetMetadata(REDIS_CACHE_INVALIDATE_METADATA, namespaces)
