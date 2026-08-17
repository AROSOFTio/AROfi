import { NotFoundException, UnauthorizedException } from '@nestjs/common'
import { PortalService } from './portal.service'

function buildActivation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'activation-1',
    tenantId: 'tenant-1',
    routerId: 'router-1',
    status: 'ACTIVE',
    source: 'MOBILE_MONEY',
    customerReference: '256772000000',
    accessPhoneNumber: '256772000000',
    boundMacAddress: 'AA:BB:CC:DD:EE:FF',
    firstSeenIp: '10.55.0.10',
    startedAt: new Date(Date.now() - 30 * 60 * 1000),
    endsAt: new Date(Date.now() + 30 * 60 * 1000),
    radiusUsername: 'arofi-user',
    radiusPassword: 'secret-pass',
    radiusCredential: { username: 'arofi-user', password: 'secret-pass' },
    package: { id: 'pkg-1', name: '1 Hour', code: 'H1' },
    hotspot: null,
    ...overrides,
  }
}

function buildReconnectHarness(activation: ReturnType<typeof buildActivation> | null) {
  const prisma = {
    packageActivation: {
      findFirst: jest.fn().mockResolvedValue(activation),
      findUnique: jest.fn().mockResolvedValue(activation),
    },
    networkSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    radReply: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reconnectionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    router: {
      findUnique: jest.fn().mockResolvedValue({
        // Deliberately looks dead from the backend's point of view — the
        // reconnect decision must NOT consult this.
        status: 'OFFLINE',
        lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
      }),
    },
  }

  const service = new PortalService(
    prisma as never,
    { get: jest.fn(() => 'portal-secret') } as never,
    {} as never,
    {} as never,
    { publish: jest.fn() } as never,
  )

  return { service, prisma }
}

describe('PortalService', () => {
  const service = new PortalService(
    {} as never,
    {
      get: jest.fn((key: string) => {
        if (key === 'PORTAL_TOKEN_SECRET') {
          return 'portal-secret'
        }

        if (key === 'JWT_SECRET') {
          return 'jwt-fallback'
        }

        return undefined
      }),
    } as never,
    {} as never,
    {} as never,
    { publish: jest.fn() } as never,
  )

  it('normalizes Uganda customer phone numbers', () => {
    expect((service as any).normalizePhoneNumber('0772000000')).toBe('256772000000')
    expect((service as any).normalizePhoneNumber('+256 772 000000')).toBe('256772000000')
    expect((service as any).normalizePhoneNumber('772000000')).toBe('256772000000')
  })

  it('creates and verifies signed portal access tokens', () => {
    const token = (service as any).createAccessToken({
      tenantId: 'tenant-1',
      phoneNumber: '256772000000',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    })

    expect((service as any).verifyAccessToken(token)).toMatchObject({
      tenantId: 'tenant-1',
      phoneNumber: '256772000000',
    })
  })

  it('rejects tampered portal access tokens', () => {
    const token = (service as any).createAccessToken({
      tenantId: 'tenant-1',
      phoneNumber: '256772000000',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    })

    const [payload] = token.split('.')

    expect(() => (service as any).verifyAccessToken(`${payload}.broken-signature`)).toThrow(
      UnauthorizedException,
    )
  })
})

describe('PortalService returning-device auto-reconnect', () => {
  it('reconnects a returning active user even when the router heartbeat is stale/offline', async () => {
    const activation = buildActivation()
    const { service, prisma } = buildReconnectHarness(activation)

    const result = await (service as any).detectReturningDevice('tenant-1', {
      macAddress: 'AA:BB:CC:DD:EE:FF',
      routerId: 'router-1',
      ipAddress: '10.55.0.10',
      loginUrl: 'http://10.55.0.1/login',
    })

    expect(result.existingActiveAccess).toBe(true)
    expect(result.reconnect).toMatchObject({
      loginUrl: 'http://10.55.0.1/login',
      username: 'arofi-user',
      password: 'secret-pass',
    })
    // The router's backend liveness must never gate reconnect — the customer
    // is physically on the router if they can load the portal through it.
    expect(prisma.router.findUnique).not.toHaveBeenCalled()
    // Session-Timeout is refreshed to the real remaining seconds.
    expect(prisma.radReply.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: 'arofi-user', attribute: 'Session-Timeout' },
      }),
    )
  })

  it('recognizes a returning device across access points that share the same hotspot network name', async () => {
    const activation = buildActivation({ routerId: null, hotspotServerName: 'AroFi-Lobby' })
    const { service, prisma } = buildReconnectHarness(activation)

    const result = await (service as any).detectReturningDevice('tenant-1', {
      macAddress: 'AA:BB:CC:DD:EE:FF',
      routerId: 'router-new-ap',
      hotspotServerName: 'AroFi-Lobby',
      ipAddress: '10.55.0.44',
      loginUrl: 'http://10.55.0.1/login',
    })

    expect(result.existingActiveAccess).toBe(true)
    expect(result.reconnect).toMatchObject({
      username: 'arofi-user',
      password: 'secret-pass',
    })
    expect(prisma.packageActivation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          boundMacAddress: 'AA:BB:CC:DD:EE:FF',
          status: 'ACTIVE',
        }),
      }),
    )
  })

  it('reports no access for a device without an active (non-expired) activation', async () => {
    const { service } = buildReconnectHarness(null)

    const result = await (service as any).detectReturningDevice('tenant-1', {
      macAddress: 'AA:BB:CC:DD:EE:FF',
      routerId: 'router-1',
    })

    expect(result.existingActiveAccess).toBe(false)
  })

  it('reconnect() rejects an expired/unknown device with 404', async () => {
    const { service } = buildReconnectHarness(null)
    ;(service as any).resolveHotspotContext = jest.fn().mockResolvedValue({ routerId: 'router-1' })

    await expect(
      service.reconnect({ macAddress: 'AA:BB:CC:DD:EE:FF', routerId: 'router-1' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('always issues a usable login URL fallback in reconnect payloads', () => {
    const { service } = buildReconnectHarness(buildActivation())

    const payload = (service as any).issueReconnectLoginPayload(buildActivation(), undefined)

    expect(payload.loginUrl).toBeTruthy()
    expect(payload.username).toBe('arofi-user')
    expect(payload.password).toBe('secret-pass')
  })
})

// A missing device MAC / router identity used to hard-reject voucher
// redemption (BadRequestException) here. That broke real customers reaching
// the portal via a path that can't supply those params (e.g. a QR-code scan
// opening the portal directly). Redemption now proceeds without
// device-binding in that case; see portal.service.ts.
