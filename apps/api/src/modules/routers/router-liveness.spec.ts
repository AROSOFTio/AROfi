import { RouterStatus } from '@prisma/client'
import { RoutersService } from './routers.service'

function buildService() {
  return new RoutersService({} as never, {} as never, {} as never, {} as never, { publish: jest.fn() } as never, {} as never, {} as never, { sendText: jest.fn() } as never)
}

describe('RoutersService router liveness state machine', () => {
  const previousLive = process.env.ROUTER_LIVE_WINDOW_SECONDS
  const previousStale = process.env.ROUTER_STALE_WINDOW_SECONDS

  beforeAll(() => {
    process.env.ROUTER_LIVE_WINDOW_SECONDS = '12'
    process.env.ROUTER_STALE_WINDOW_SECONDS = '30'
  })

  afterAll(() => {
    if (previousLive !== undefined) process.env.ROUTER_LIVE_WINDOW_SECONDS = previousLive
    else delete process.env.ROUTER_LIVE_WINDOW_SECONDS
    if (previousStale !== undefined) process.env.ROUTER_STALE_WINDOW_SECONDS = previousStale
    else delete process.env.ROUTER_STALE_WINDOW_SECONDS
  })

  function resolve(secondsAgo: number | null, status: RouterStatus = RouterStatus.HEALTHY) {
    const service = buildService()
    const lastSeenAt = secondsAgo === null ? null : new Date(Date.now() - secondsAgo * 1000)
    return (service as any).resolveRouterLiveState(
      {
        status,
        lastSeenAt,
        lastProvisionedAt: null,
        lastRadiusSignalAt: null,
        lastAccountingSignalAt: null,
        lastAuthSignalAt: null,
        healthChecks: [],
      },
      0,
    )
  }

  it('reports LIVE within the effective anti-flap live window', () => {
    expect(resolve(5).liveState).toBe('LIVE')
    expect(resolve(59).liveState).toBe('LIVE')
  })

  it('reports STALE between the effective 60s live and 300s offline windows', () => {
    expect(resolve(61).liveState).toBe('STALE')
    expect(resolve(299).liveState).toBe('STALE')
  })

  it('reports OFFLINE only after the five-minute confirmation window', () => {
    expect(resolve(301).liveState).toBe('OFFLINE')
    expect(resolve(600).liveState).toBe('OFFLINE')
  })

  it('reports PENDING for a router with no signal at all that has never been verified', () => {
    expect(resolve(null, RouterStatus.PENDING).liveState).toBe('PENDING')
  })

  it('reports OFFLINE for a non-pending router with no signal at all', () => {
    expect(resolve(null, RouterStatus.HEALTHY).liveState).toBe('OFFLINE')
  })
})

describe('RoutersService heartbeat publishes realtime events', () => {
  it('publishes router.heartbeat on every beat and router.online after a confirmed signal gap', async () => {
    const router = {
      id: 'router-1',
      tenantId: 'tenant-1',
      status: RouterStatus.DEGRADED,
      onboardingStatus: 'WAITING_FOR_RADIUS',
      radiusNasIpAddress: '203.0.113.10',
      lastSeenAt: new Date(Date.now() - 120_000),
    }
    const prisma = {
      router: {
        findUnique: jest.fn().mockResolvedValue(router),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    const realtimeEvents = { publish: jest.fn() }
    const service = new RoutersService(prisma as never, {} as never, {} as never, {} as never, realtimeEvents as never, {} as never, {} as never, { sendText: jest.fn() } as never)

    await service.recordRouterHeartbeatByKey('reg-key', '203.0.113.10')

    const publishedTypes = realtimeEvents.publish.mock.calls.map((call) => call[0])
    expect(publishedTypes).toContain('router.heartbeat')
    expect(publishedTypes).toContain('router.online')
  })

  it('does not republish router.online for a beat that arrives within the live window', async () => {
    const router = {
      id: 'router-1',
      tenantId: 'tenant-1',
      status: RouterStatus.HEALTHY,
      onboardingStatus: 'WAITING_FOR_RADIUS',
      radiusNasIpAddress: '203.0.113.10',
      lastSeenAt: new Date(Date.now() - 5_000),
    }
    const prisma = {
      router: {
        findUnique: jest.fn().mockResolvedValue(router),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    const realtimeEvents = { publish: jest.fn() }
    const service = new RoutersService(prisma as never, {} as never, {} as never, {} as never, realtimeEvents as never, {} as never, {} as never, { sendText: jest.fn() } as never)

    await service.recordRouterHeartbeatByKey('reg-key', '203.0.113.10')

    const publishedTypes = realtimeEvents.publish.mock.calls.map((call) => call[0])
    expect(publishedTypes).toContain('router.heartbeat')
    expect(publishedTypes).not.toContain('router.online')
  })
})
