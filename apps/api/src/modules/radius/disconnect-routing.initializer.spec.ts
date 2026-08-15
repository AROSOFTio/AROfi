import { DisconnectionStatus } from '@prisma/client'
import { DisconnectRoutingInitializer } from './disconnect-routing.initializer'

type RouterFixture = {
  id: string
  tenantId: string
  name: string
  identity: string
  siteLabel: string | null
  serialNumber: string | null
  radiusNasIpAddress: string
  host: string
  remoteSstpIp: string
  lastSeenAt: Date
  lastProvisionedAt: Date
  apiPort: number
  connectionMode: string
  username: string
  passwordCiphertext: string
}

const attempt = {
  id: 'attempt-1',
  tenantId: 'tenant-1',
  routerId: 'router-old',
  activationId: 'activation-1',
  username: 'bundle-user-1',
  macAddress: 'AA:BB:CC:DD:EE:FF',
  radiusSessionId: 'radius-session-1',
  retryCount: 0,
}

function router(id: string, options: Partial<RouterFixture> = {}): RouterFixture {
  return {
    id,
    tenantId: 'tenant-1',
    name: 'Main Hotspot',
    identity: 'Main Hotspot',
    siteLabel: 'Main Hotspot',
    serialNumber: null,
    radiusNasIpAddress: '192.168.1.2',
    host: '192.168.1.2',
    remoteSstpIp: id === 'router-live' ? '10.8.0.18' : '10.8.0.4',
    lastSeenAt: new Date(Date.now() - 10 * 60 * 1000),
    lastProvisionedAt: new Date(Date.now() - 60 * 60 * 1000),
    apiPort: 8728,
    connectionMode: 'ROUTEROS_API',
    username: 'admin',
    passwordCiphertext: 'ciphertext',
    ...options,
  }
}

function buildHarness() {
  const lifecycle = {
    processPendingDisconnects: jest.fn(),
    handleDisconnectFailure: jest.fn().mockResolvedValue(undefined),
    logoutHotspotActiveSession: jest.fn(),
  }
  const prisma = {
    disconnectionAttempt: {
      findMany: jest.fn().mockResolvedValue([attempt]),
      update: jest.fn().mockResolvedValue({}),
    },
    router: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  }
  const realtimeEvents = { publish: jest.fn() }
  const mikrotikService = {
    removeHotspotActiveSession: jest.fn().mockResolvedValue({ removed: 1 }),
  }
  const routerCredentialsService = {
    decrypt: jest.fn().mockReturnValue('router-password'),
  }

  const initializer = new DisconnectRoutingInitializer(
    lifecycle as never,
    prisma as never,
    realtimeEvents as never,
    mikrotikService as never,
    routerCredentialsService as never,
  )

  return {
    initializer,
    lifecycle,
    prisma,
    realtimeEvents,
    mikrotikService,
    routerCredentialsService,
  }
}

describe('DisconnectRoutingInitializer', () => {
  const previousEnabled = process.env.RADIUS_DISCONNECT_ENABLED
  const previousSecret = process.env.RADIUS_SHARED_SECRET
  const previousForcedHost = process.env.RADIUS_DISCONNECT_HOST

  beforeEach(() => {
    process.env.RADIUS_DISCONNECT_ENABLED = 'true'
    process.env.RADIUS_SHARED_SECRET = 'test-radius-secret'
    delete process.env.RADIUS_DISCONNECT_HOST
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env.RADIUS_DISCONNECT_ENABLED = previousEnabled
    process.env.RADIUS_SHARED_SECRET = previousSecret
    if (previousForcedHost === undefined) delete process.env.RADIUS_DISCONNECT_HOST
    else process.env.RADIUS_DISCONNECT_HOST = previousForcedHost
  })

  it('routes an old activation to the one current live re-onboarded router record', async () => {
    const { initializer, lifecycle, prisma, realtimeEvents } = buildHarness()
    const oldRouter = router('router-old')
    const liveRouter = router('router-live', {
      lastSeenAt: new Date(),
      lastProvisionedAt: new Date(),
    })
    prisma.router.findUnique.mockResolvedValue(oldRouter)
    prisma.router.findMany.mockResolvedValue([liveRouter])

    const coa = jest
      .spyOn(initializer as never as { runRadclientDisconnect: (...args: unknown[]) => Promise<void> }, 'runRadclientDisconnect')
      .mockResolvedValue(undefined)

    await lifecycle.processPendingDisconnects()

    expect(coa).toHaveBeenCalledWith(
      '10.8.0.18',
      '3799',
      'test-radius-secret',
      expect.stringContaining('User-Name = bundle-user-1'),
    )
    expect(prisma.disconnectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({
          status: DisconnectionStatus.SUCCESS,
          message: expect.stringContaining('using current router router-live'),
        }),
      }),
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'radius.disconnect_router_remapped',
          details: expect.objectContaining({
            originalRouterId: 'router-old',
            resolvedRouterId: 'router-live',
          }),
        }),
      }),
    )
    expect(realtimeEvents.publish).toHaveBeenCalledWith(
      'disconnect.succeeded',
      expect.objectContaining({
        data: expect.objectContaining({ resolvedRouterId: 'router-live', remappedRouter: true }),
      }),
    )
  })

  it('keeps using the linked router when its current heartbeat proves it is live', async () => {
    const { initializer, lifecycle, prisma } = buildHarness()
    const currentRouter = router('router-old', {
      lastSeenAt: new Date(),
      remoteSstpIp: '10.8.0.7',
    })
    prisma.router.findUnique.mockResolvedValue(currentRouter)

    const coa = jest
      .spyOn(initializer as never as { runRadclientDisconnect: (...args: unknown[]) => Promise<void> }, 'runRadclientDisconnect')
      .mockResolvedValue(undefined)

    await lifecycle.processPendingDisconnects()

    expect(prisma.router.findMany).not.toHaveBeenCalled()
    expect(coa).toHaveBeenCalledWith(
      '10.8.0.7',
      '3799',
      'test-radius-secret',
      expect.any(String),
    )
  })

  it('refuses to guess when more than one live record could be the successor', async () => {
    const { initializer, prisma } = buildHarness()
    const oldRouter = router('router-old')
    prisma.router.findUnique.mockResolvedValue(oldRouter)
    prisma.router.findMany.mockResolvedValue([
      router('router-live-a', { lastSeenAt: new Date(), lastProvisionedAt: new Date() }),
      router('router-live-b', { lastSeenAt: new Date(), lastProvisionedAt: new Date() }),
    ])

    const route = await (
      initializer as never as {
        resolveDisconnectRoute: (value: typeof attempt) => Promise<{ router: { id: string } | null; remapped: boolean; note: string }>
      }
    ).resolveDisconnectRoute(attempt)

    expect(route.remapped).toBe(false)
    expect(route.router?.id).toBe('router-old')
    expect(route.note).toContain('refusing to guess')
  })

  it('treats an already-absent RouterOS session as a successful final state', async () => {
    const { initializer, lifecycle, prisma, mikrotikService } = buildHarness()
    const currentRouter = router('router-old', { lastSeenAt: new Date() })
    prisma.router.findUnique.mockResolvedValue(currentRouter)
    mikrotikService.removeHotspotActiveSession.mockResolvedValue({ removed: 0 })

    jest
      .spyOn(initializer as never as { runRadclientDisconnect: (...args: unknown[]) => Promise<void> }, 'runRadclientDisconnect')
      .mockRejectedValue(new Error('RADIUS Disconnect-Request timed out waiting for Disconnect-ACK'))

    await lifecycle.processPendingDisconnects()

    expect(prisma.disconnectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DisconnectionStatus.SUCCESS,
          message: expect.stringContaining('already absent'),
        }),
      }),
    )
    expect(lifecycle.handleDisconnectFailure).not.toHaveBeenCalled()
  })
})
