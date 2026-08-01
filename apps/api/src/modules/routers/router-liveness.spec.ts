import { RouterStatus } from '@prisma/client'
import { RoutersService } from './routers.service'

// resolveRouterLiveState is private; exercised via `as any` the same way the
// existing routers.service.spec.ts does for other private methods.
function buildService() {
  return new RoutersService({} as never, {} as never, {} as never, {} as never, { publish: jest.fn() } as never, {} as never, {} as never)
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
    if (previousStale !== undefined) process.env.ROUTER_STALE_WINDOW_SECONDS = previousStale
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

  it('reports LIVE within the live window (~2 missed 5s heartbeats)', () => {
    expect(resolve(5).liveState).toBe('LIVE')
    expect(resolve(11).liveState).toBe('LIVE')
  })

  it('reports STALE (suspected offline) between the live and stale windows', () => {
    expect(resolve(15).liveState).toBe('STALE')
    expect(resolve(29).liveState).toBe('STALE')
  })

  it('reports OFFLINE (confirmed) beyond the stale window', () => {
    expect(resolve(31).liveState).toBe('OFFLINE')
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
  it('publishes router.heartbeat on every beat and router.online after a gap', async () => {
    const router = {
      id: 'router-1',
      tenantId: 'tenant-1',
      status: RouterStatus.DEGRADED,
      onboardingStatus: 'WAITING_FOR_RADIUS',
      radiusNasIpAddress: '203.0.113.10',
      lastSeenAt: new Date(Date.now() - 60_000), // stale beyond live window
    }
    const prisma = {
      router: {
        findUnique: jest.fn().mockResolvedValue(router),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    const realtimeEvents = { publish: jest.fn() }
    const service = new RoutersService(prisma as never, {} as never, {} as never, {} as never, realtimeEvents as never, {} as never, {} as never)

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
      lastSeenAt: new Date(Date.now() - 5_000), // fresh, within live window
    }
    const prisma = {
      router: {
        findUnique: jest.fn().mockResolvedValue(router),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    const realtimeEvents = { publish: jest.fn() }
    const service = new RoutersService(prisma as never, {} as never, {} as never, {} as never, realtimeEvents as never, {} as never, {} as never)

    await service.recordRouterHeartbeatByKey('reg-key', '203.0.113.10')

    const publishedTypes = realtimeEvents.publish.mock.calls.map((call) => call[0])
    expect(publishedTypes).toContain('router.heartbeat')
    expect(publishedTypes).not.toContain('router.online')
  })
})
