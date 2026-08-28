import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { createHash } from 'crypto'
import { RedisProtocolClient } from './redis-protocol.client'

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name)
  private readonly redisUrl = process.env.REDIS_URL?.trim()
  private readonly keyPrefix = process.env.CACHE_KEY_PREFIX?.trim() || 'arofi'
  private readonly cacheVersion = process.env.CACHE_VERSION?.trim() || 'v1'
  private readonly connectTimeoutMs = Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS ?? '1000', 10)
  private readonly failureCooldownMs = Math.max(
    1_000,
    Number.parseInt(process.env.REDIS_FAILURE_COOLDOWN_MS ?? '5000', 10) || 5_000,
  )
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private readonly redis?: RedisProtocolClient
  private warnedUnavailable = false
  private unavailableUntil = 0

  constructor() {
    if (!this.redisUrl) {
      this.logger.log('Redis cache disabled because REDIS_URL is not configured')
      return
    }

    try {
      this.redis = new RedisProtocolClient(this.redisUrl, this.connectTimeoutMs)
    } catch (error) {
      this.markUnavailable(error)
    }
  }

  onModuleDestroy() {
    this.redis?.disconnect()
  }

  buildKey(namespace: string, value: unknown) {
    const digest = createHash('sha256').update(this.stableStringify(value)).digest('hex')
    return `${this.keyPrefix}:${this.cacheVersion}:${namespace}:${digest}`
  }

  buildHttpKey(namespace: string, request: any, scope: 'tenant' | 'user' = 'tenant') {
    const userScope =
      scope === 'user'
        ? {
            userId: request.user?.id ?? null,
            email: request.user?.email ?? null,
          }
        : undefined

    return this.buildKey(namespace, {
      method: request.method,
      route: request.route?.path ?? request.path ?? request.url,
      params: request.params ?? {},
      query: request.query ?? {},
      scope: {
        tenantId: request.user?.tenantId ?? null,
        role: request.user?.role ?? null,
        user: userScope,
      },
    })
  }

  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached.hit) {
      return cached.value as T
    }

    const existing = this.inFlight.get(key) as Promise<T> | undefined
    if (existing) {
      return existing
    }

    const operation = (async () => {
      const value = await loader()
      await this.set(key, value, ttlSeconds)
      return value
    })().finally(() => {
      this.inFlight.delete(key)
    })

    this.inFlight.set(key, operation)
    return operation
  }

  async invalidateNamespaces(namespaces: string[]) {
    await Promise.all(Array.from(new Set(namespaces)).map((namespace) => this.deleteByPrefix(namespace)))
  }

  private async get<T>(key: string): Promise<{ hit: boolean; value?: T }> {
    if (!this.canUseRedis()) {
      return { hit: false }
    }

    try {
      const raw = await this.redis!.get(key)
      this.markAvailable()
      if (raw === null) {
        return { hit: false }
      }
      return { hit: true, value: JSON.parse(raw) as T }
    } catch (error) {
      this.markUnavailable(error)
      return { hit: false }
    }
  }

  private async set(key: string, value: unknown, ttlSeconds: number) {
    if (!this.canUseRedis() || ttlSeconds <= 0) {
      return
    }

    try {
      const serialized = JSON.stringify(value)
      if (serialized === undefined) {
        return
      }
      await this.redis!.setEx(key, ttlSeconds, serialized)
      this.markAvailable()
    } catch (error) {
      this.markUnavailable(error)
    }
  }

  private async deleteByPrefix(namespace: string) {
    if (!this.canUseRedis()) {
      return
    }

    const pattern = `${this.keyPrefix}:${this.cacheVersion}:${namespace}:*`
    try {
      let cursor = '0'
      do {
        const [nextCursor, keys] = await this.redis!.scan(cursor, pattern, 200)
        cursor = nextCursor
        await this.redis!.unlink(keys)
      } while (cursor !== '0')
      this.markAvailable()
    } catch (error) {
      this.markUnavailable(error)
    }
  }

  private canUseRedis() {
    return Boolean(this.redis && Date.now() >= this.unavailableUntil)
  }

  private markAvailable() {
    this.unavailableUntil = 0
    this.warnedUnavailable = false
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`
    }
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
      .join(',')}}`
  }

  private markUnavailable(error: unknown) {
    this.unavailableUntil = Date.now() + this.failureCooldownMs
    if (this.warnedUnavailable) {
      return
    }
    this.warnedUnavailable = true
    const message = error instanceof Error ? error.message : String(error)
    this.logger.warn(`Redis unavailable; continuing with database reads: ${message}`)
  }
}
