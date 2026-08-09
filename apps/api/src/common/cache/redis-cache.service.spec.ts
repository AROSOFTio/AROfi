import { RedisCacheService } from './redis-cache.service'

describe('RedisCacheService', () => {
  const originalRedisUrl = process.env.REDIS_URL

  beforeEach(() => {
    delete process.env.REDIS_URL
  })

  afterAll(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL
    } else {
      process.env.REDIS_URL = originalRedisUrl
    }
  })

  it('builds the same key regardless of object property order', () => {
    const cache = new RedisCacheService()

    expect(cache.buildKey('dashboard', { tenantId: 'tenant-1', filters: { to: 'b', from: 'a' } })).toBe(
      cache.buildKey('dashboard', { filters: { from: 'a', to: 'b' }, tenantId: 'tenant-1' }),
    )
  })

  it('coalesces concurrent cache misses into one calculation', async () => {
    const cache = new RedisCacheService()
    let resolveLoader: (value: { total: number }) => void = () => undefined
    const loaderResult = new Promise<{ total: number }>((resolve) => {
      resolveLoader = resolve
    })
    const loader = jest.fn(() => loaderResult)

    const first = cache.remember('same-key', 10, loader)
    const second = cache.remember('same-key', 10, loader)

    resolveLoader({ total: 42 })

    await expect(Promise.all([first, second])).resolves.toEqual([{ total: 42 }, { total: 42 }])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('continues with the loader when Redis is not configured', async () => {
    const cache = new RedisCacheService()

    await expect(cache.remember('missing-redis', 10, async () => 'database-result')).resolves.toBe('database-result')
  })
})
