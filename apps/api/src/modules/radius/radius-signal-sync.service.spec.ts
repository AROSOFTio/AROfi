import { SessionStatus } from '@prisma/client'
import { RadiusSignalSyncService } from './radius-signal-sync.service'

function buildAcctRow(overrides: Record<string, unknown> = {}) {
  const startedAt = new Date(Date.now() - 5 * 60 * 1000)
  return {
    radacctid: BigInt(101),
    acctsessionid: 'sess-101',
    acctuniqueid: 'uniq-101',
    username: 'arofi-user',
    nasipaddress: '203.0.113.10',
    callingstationid: 'aa-bb-cc-dd-ee-ff',
    framedipaddress: '10.55.0.20',
    acctstarttime: startedAt,
    acctupdatetime: new Date(),
    acctstoptime: null,
    acctsessiontime: 300,
    acctinputoctets: BigInt(1024),
    acctoutputoctets: BigInt(4096),
    ...overrides,
  }
}

function buildHarness(options: {
  existingSession?: Record<string, unknown> | null
  existingEvent?: Record<string, unknown> | null
} = {}) {
  const router = {
    id: 'router-1',
    tenantId: 'tenant-1',
    radiusNasIpAddress: '203.0.113.10',
    lastAccountingSignalAt: new Date(Date.now() - 60 * 60 * 1000),
    verifiedAt: new Date(),
  }
  const prisma = {
    radAcct: { findUnique: jest.fn() },
    radPostAuth: { findUnique: jest.fn() },
    router: {
      findFirst: jest.fn().mockResolvedValue(router),
      findUnique: jest.fn().mockResolvedValue(router),
      update: jest.fn().mockResolvedValue(router),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    packageActivation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'activation-1', voucherRedemptionId: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    networkSession: {
      findUnique: jest.fn().mockResolvedValue(options.existingSession ?? null),
      upsert: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _sum: { inputOctets: BigInt(1024), outputOctets: BigInt(4096) } }),
    },
    radiusEvent: {
      findFirst: jest.fn().mockResolvedValue(options.existingEvent ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
    radiusCredential: {
      findFirst: jest.fn().mockResolvedValue({ username: 'arofi-user', tenantId: 'tenant-1', routerId: 'router-1' }),
    },
  }
  const realtimeEvents = { publish: jest.fn() }
  const service = new RadiusSignalSyncService(prisma as never, realtimeEvents as never)
  return { service, prisma, realtimeEvents, router }
}

describe('RadiusSignalSyncService (FreeRADIUS → API bridge)', () => {
  it('turns a new accounting row into an ACTIVE session and a session.started event', async () => {
    const { service, prisma, realtimeEvents } = buildHarness({ existingSession: null })

    await service.processAcctRow(buildAcctRow() as never)

    expect(prisma.networkSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_radiusSessionId: { tenantId: 'tenant-1', radiusSessionId: 'sess-101' },
        },
        create: expect.objectContaining({
          status: SessionStatus.ACTIVE,
          username: 'arofi-user',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          activationId: 'activation-1',
        }),
      }),
    )
    const publishedTypes = realtimeEvents.publish.mock.calls.map((call) => call[0])
    expect(publishedTypes).toContain('session.started')
    // Observability event row is written too.
    expect(prisma.radiusEvent.create).toHaveBeenCalled()
    // usedBytes aggregate refreshed for quota enforcement.
    expect(prisma.packageActivation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { usedBytes: BigInt(5120) } }),
    )
  })

  it('publishes session.stopped when a stop row closes an active session', async () => {
    const { service, realtimeEvents } = buildHarness({
      existingSession: {
        id: 'session-1',
        status: SessionStatus.ACTIVE,
        inputOctets: BigInt(0),
        outputOctets: BigInt(0),
        lastAccountingAt: new Date(Date.now() - 60_000),
        endedAt: null,
      },
    })

    await service.processAcctRow(
      buildAcctRow({ acctstoptime: new Date(), acctupdatetime: new Date() }) as never,
    )

    const publishedTypes = realtimeEvents.publish.mock.calls.map((call) => call[0])
    expect(publishedTypes).toContain('session.stopped')
  })

  it('does not rewrite or republish an unchanged row (polling sweep idempotency)', async () => {
    const lastAccountingAt = new Date()
    const row = buildAcctRow({ acctupdatetime: lastAccountingAt })
    const { service, prisma, realtimeEvents } = buildHarness({
      existingSession: {
        id: 'session-1',
        status: SessionStatus.ACTIVE,
        inputOctets: BigInt(1024),
        outputOctets: BigInt(4096),
        lastAccountingAt,
        endedAt: null,
      },
      existingEvent: { id: 'event-1' },
    })

    await service.processAcctRow(row as never)

    expect(prisma.networkSession.upsert).not.toHaveBeenCalled()
    const publishedTypes = realtimeEvents.publish.mock.calls.map((call) => call[0])
    expect(publishedTypes).not.toContain('session.started')
    expect(publishedTypes).not.toContain('session.updated')
    expect(publishedTypes).not.toContain('session.stopped')
  })

  it('never bumps router liveness with "now" for old rows — uses the row timestamps', async () => {
    const oldSignal = new Date(Date.now() - 30 * 60 * 1000)
    const { service, prisma } = buildHarness({
      existingSession: null,
    })
    // Router already has a NEWER accounting signal than this stale row.
    prisma.router.findFirst.mockResolvedValue({
      id: 'router-1',
      tenantId: 'tenant-1',
      radiusNasIpAddress: '203.0.113.10',
      lastAccountingSignalAt: new Date(),
      verifiedAt: new Date(),
    })

    await service.processAcctRow(
      buildAcctRow({ acctstarttime: oldSignal, acctupdatetime: oldSignal }) as never,
    )

    expect(prisma.router.update).not.toHaveBeenCalled()
  })

  it('turns a radpostauth accept into a radius.auth event and fresh auth signal', async () => {
    const { service, prisma, realtimeEvents } = buildHarness()

    await service.processPostAuthRow({
      id: 55,
      username: 'arofi-user',
      pass: null,
      reply: 'Access-Accept',
      authdate: new Date(),
      class: null,
    } as never)

    expect(prisma.radiusEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: 'arofi-user', responseCode: '2' }),
      }),
    )
    expect(realtimeEvents.publish).toHaveBeenCalledWith(
      'radius.auth',
      expect.objectContaining({
        tenantId: 'tenant-1',
        data: expect.objectContaining({ accepted: true }),
      }),
    )
    expect(prisma.router.updateMany).toHaveBeenCalled()
  })
})
