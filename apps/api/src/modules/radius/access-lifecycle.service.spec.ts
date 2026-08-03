import {
  DisconnectionStatus,
  PackageActivationStatus,
  RadiusCredentialStatus,
} from '@prisma/client'
import { AccessLifecycleService } from './access-lifecycle.service'

function buildHarness() {
  const activation = {
    id: 'activation-1',
    tenantId: 'tenant-1',
    routerId: 'router-1',
    endsAt: new Date(Date.now() - 60_000),
    status: PackageActivationStatus.ACTIVE,
  }
  const session = {
    id: 'session-1',
    tenantId: 'tenant-1',
    routerId: 'router-1',
    username: 'arofi-user',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    radiusSessionId: 'radius-session-1',
    activation: { radiusCredential: null },
  }

  const tx = {
    packageActivation: {
      update: jest.fn().mockResolvedValue(activation),
    },
    networkSession: {
      findMany: jest.fn().mockResolvedValue([session]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    disconnectionAttempt: {
      create: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  }

  const prisma = {
    networkSession: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    router: {
      findUnique: jest.fn().mockResolvedValue({
        host: '198.51.100.10',
        apiPort: 8728,
        connectionMode: 'ROUTEROS_API',
        username: 'admin',
        passwordCiphertext: 'ciphertext',
        remoteSstpIp: '10.8.0.2',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    packageActivation: {
      findMany: jest.fn().mockResolvedValue([activation]),
    },
    disconnectionAttempt: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
  }

  const radiusCredentialService = {
    disableForActivation: jest.fn().mockResolvedValue({}),
  }
  const mailService = {
    sendOperationalAlertEmail: jest.fn().mockResolvedValue(true),
    sendWithdrawalStatusEmail: jest.fn().mockResolvedValue(true),
  }
  const realtimeEvents = { publish: jest.fn() }
  const signalSync = { syncRecent: jest.fn().mockResolvedValue(undefined) }
  const mikrotikService = {
    removeHotspotActiveSession: jest.fn().mockResolvedValue({ removed: 1 }),
  }
  const routerCredentialsService = {
    decrypt: jest.fn().mockReturnValue('router-password'),
  }

  const service = new AccessLifecycleService(
    prisma as never,
    radiusCredentialService as never,
    {} as never,
    mailService as never,
    signalSync as never,
    realtimeEvents as never,
    mikrotikService as never,
    routerCredentialsService as never,
  )

  return { service, prisma, tx, radiusCredentialService, mailService, realtimeEvents, activation, session, mikrotikService, routerCredentialsService }
}

describe('AccessLifecycleService bundle expiry', () => {
  const previousDisconnectEnabled = process.env.RADIUS_DISCONNECT_ENABLED

  beforeEach(() => {
    process.env.RADIUS_DISCONNECT_ENABLED = 'true'
  })

  afterAll(() => {
    process.env.RADIUS_DISCONNECT_ENABLED = previousDisconnectEnabled
  })

  it('expires the activation, removes RADIUS access, queues a disconnect and publishes events', async () => {
    const { service, tx, radiusCredentialService, realtimeEvents } = buildHarness()
    const processSpy = jest
      .spyOn(service as never as { processPendingDisconnects: () => Promise<void> }, 'processPendingDisconnects')
      .mockResolvedValue(undefined)

    await (service as never as { expireActivations: () => Promise<void> }).expireActivations()

    // Activation flipped to EXPIRED.
    expect(tx.packageActivation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: PackageActivationStatus.EXPIRED } }),
    )
    // RADIUS credential removed (radcheck/radreply rows are deleted inside).
    expect(radiusCredentialService.disableForActivation).toHaveBeenCalledWith(
      tx,
      'activation-1',
      RadiusCredentialStatus.EXPIRED,
    )
    // A CoA Disconnect-Request was queued for the live session.
    expect(tx.disconnectionAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DisconnectionStatus.REQUESTED,
          username: 'arofi-user',
          radiusSessionId: 'radius-session-1',
        }),
      }),
    )
    // Live sessions were closed out.
    expect(tx.networkSession.updateMany).toHaveBeenCalled()
    // Dashboard events for expiry + disconnect request.
    const publishedTypes = realtimeEvents.publish.mock.calls.map((call) => call[0])
    expect(publishedTypes).toContain('activation.expired')
    expect(publishedTypes).toContain('disconnect.requested')
    // Disconnects are pushed out in the SAME worker cycle, not the next one.
    expect(processSpy).toHaveBeenCalled()
  })
})

describe('AccessLifecycleService disconnect retries and alerts', () => {
  const attempt = {
    id: 'attempt-1',
    tenantId: 'tenant-1',
    routerId: 'router-1',
    activationId: 'activation-1',
    username: 'arofi-user',
    retryCount: 0,
  }

  it('schedules a backoff retry when a disconnect fails and budget remains', async () => {
    const { service, prisma, realtimeEvents, mailService } = buildHarness()

    await (
      service as never as {
        handleDisconnectFailure: (a: typeof attempt, e: unknown) => Promise<void>
      }
    ).handleDisconnectFailure(attempt, new Error('router unreachable'))

    expect(prisma.disconnectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({
          retryCount: 1,
          nextRetryAt: expect.any(Date),
        }),
      }),
    )
    // Not final yet: no FAILED status, no alert.
    const updateData = prisma.disconnectionAttempt.update.mock.calls[0][0].data
    expect(updateData.status).toBeUndefined()
    expect(realtimeEvents.publish).not.toHaveBeenCalled()
    expect(mailService.sendOperationalAlertEmail).not.toHaveBeenCalled()
  })

  it('marks FAILED, audits CRITICAL, alerts the operator and publishes events after the retry budget', async () => {
    const { service, prisma, realtimeEvents, mailService } = buildHarness()

    await (
      service as never as {
        handleDisconnectFailure: (a: typeof attempt, e: unknown) => Promise<void>
      }
    ).handleDisconnectFailure({ ...attempt, retryCount: 4 }, new Error('router unreachable'))

    expect(prisma.disconnectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DisconnectionStatus.FAILED }),
      }),
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'radius.disconnect_failed',
          severity: 'CRITICAL',
        }),
      }),
    )
    const publishedTypes = realtimeEvents.publish.mock.calls.map((call) => call[0])
    expect(publishedTypes).toContain('disconnect.failed')
    expect(publishedTypes).toContain('alert')
    expect(mailService.sendOperationalAlertEmail).toHaveBeenCalled()
  })

  it('can remove a live MikroTik HotSpot session through RouterOS API fallback', async () => {
    const { service, prisma, mikrotikService, routerCredentialsService } = buildHarness()

    const removed = await (
      service as never as {
        logoutHotspotActiveSession: (attempt: {
          routerId: string
          username: string
          macAddress: string
        }) => Promise<number>
      }
    ).logoutHotspotActiveSession({
      routerId: 'router-1',
      username: 'arofi-user',
      macAddress: 'AA:BB:CC:DD:EE:FF',
    })

    expect(removed).toBe(1)
    expect(prisma.router.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'router-1' } }),
    )
    expect(routerCredentialsService.decrypt).toHaveBeenCalledWith('ciphertext')
    expect(mikrotikService.removeHotspotActiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '10.8.0.2',
        port: 8728,
        username: 'admin',
        password: 'router-password',
        hotspotUsername: 'arofi-user',
        macAddress: 'AA:BB:CC:DD:EE:FF',
      }),
    )
  })
})

describe('AccessLifecycleService stale session cleanup', () => {
  it('marks stale active sessions stale, updates router count and publishes realtime events', async () => {
    const { service, prisma, realtimeEvents } = buildHarness()
    const staleSession = {
      id: 'session-stale',
      tenantId: 'tenant-1',
      routerId: 'router-1',
      radiusSessionId: 'radius-session-stale',
      username: 'arofi-user',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      lastAccountingAt: new Date(Date.now() - 10 * 60 * 1000),
    }
    prisma.networkSession.findMany.mockResolvedValue([staleSession])
    prisma.networkSession.count.mockResolvedValue(0)

    await (service as never as { cleanStaleSessions: () => Promise<void> }).cleanStaleSessions()

    expect(prisma.networkSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['session-stale'] } },
        data: expect.objectContaining({ status: 'STALE', endedAt: expect.any(Date) }),
      }),
    )
    expect(prisma.router.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'router-1' }, data: { activeSessionCount: 0 } }),
    )
    expect(realtimeEvents.publish).toHaveBeenCalledWith(
      'session.stopped',
      expect.objectContaining({
        tenantId: 'tenant-1',
        routerId: 'router-1',
        data: expect.objectContaining({ sessionId: 'session-stale', stale: true }),
      }),
    )
  })

  it('does not touch fresh active sessions during stale cleanup', async () => {
    const { service, prisma, realtimeEvents } = buildHarness()
    prisma.networkSession.findMany.mockResolvedValue([])

    await (service as never as { cleanStaleSessions: () => Promise<void> }).cleanStaleSessions()

    expect(prisma.networkSession.updateMany).not.toHaveBeenCalled()
    expect(prisma.router.update).not.toHaveBeenCalled()
    expect(realtimeEvents.publish).not.toHaveBeenCalled()
  })

  it('keeps active sessions alive during a short accounting gap', async () => {
    const { service, prisma, realtimeEvents } = buildHarness()
    const shortGapSession = {
      id: 'session-short-gap',
      tenantId: 'tenant-1',
      routerId: 'router-1',
      radiusSessionId: 'radius-session-short-gap',
      username: 'arofi-user',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      lastAccountingAt: new Date(Date.now() - 10 * 60 * 1000),
    }
    prisma.networkSession.findMany.mockResolvedValue([shortGapSession])
    prisma.networkSession.count.mockResolvedValue(0)

    await (service as never as { cleanStaleSessions: () => Promise<void> }).cleanStaleSessions()

    expect(prisma.networkSession.updateMany).not.toHaveBeenCalled()
    expect(prisma.router.update).not.toHaveBeenCalled()
    expect(realtimeEvents.publish).not.toHaveBeenCalled()
  })
})
describe('AccessLifecycleService signal sync delegation', () => {
  it('delegates the polling fallback to RadiusSignalSyncService.syncRecent', async () => {
    const { service } = buildHarness()
    const signalSync = (service as never as { signalSync: { syncRecent: jest.Mock } }).signalSync

    await (service as never as { syncRadiusSqlSignals: () => Promise<void> }).syncRadiusSqlSignals()

    expect(signalSync.syncRecent).toHaveBeenCalled()
  })
})
