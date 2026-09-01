import { DisconnectionMethod, DisconnectionStatus } from '@prisma/client'
import { AccessLifecycleService } from './access-lifecycle.service'
import { ExpiryRouterLogoutInitializer } from './expiry-router-logout.initializer'

type LogoutResult = 'removed' | 'absent' | 'failed' | 'mac-mismatch'

function buildHarness(
  logoutResult: LogoutResult = 'removed',
  method: DisconnectionMethod = DisconnectionMethod.AUTH_DISABLE_ONLY,
) {
  const lifecycle = {
    expireActivations: jest.fn().mockResolvedValue(undefined),
    logoutHotspotActiveSession: jest.fn(async (attempt: { macAddress?: string | null }) => {
      if (logoutResult === 'absent') {
        throw new Error('RouterOS logout fallback found no matching active HotSpot session')
      }
      if (logoutResult === 'failed') {
        throw new Error('router unreachable')
      }
      if (logoutResult === 'mac-mismatch' && attempt.macAddress) {
        throw new Error('RouterOS logout fallback found no matching active HotSpot session')
      }
      return 1
    }),
  }
  const prisma = {
    disconnectionAttempt: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'disconnect-1',
          routerId: 'router-1',
          username: 'expired-user',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          retryCount: 0,
          method,
          status: method === DisconnectionMethod.RADIUS_DISCONNECT
            ? DisconnectionStatus.REQUESTED
            : DisconnectionStatus.NOT_SUPPORTED,
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
  }

  const initializer = new ExpiryRouterLogoutInitializer(
    lifecycle as unknown as AccessLifecycleService,
    prisma as never,
  )
  initializer.onModuleInit()

  return { lifecycle, prisma }
}

describe('ExpiryRouterLogoutInitializer', () => {
  it('removes the exact expired RouterOS HotSpot session even when CoA is disabled', async () => {
    const { lifecycle, prisma } = buildHarness('removed')

    await lifecycle.expireActivations()

    expect(lifecycle.logoutHotspotActiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        routerId: 'router-1',
        username: 'expired-user',
        macAddress: 'AA:BB:CC:DD:EE:FF',
      }),
    )
    expect(prisma.disconnectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'disconnect-1' },
        data: expect.objectContaining({
          status: DisconnectionStatus.SUCCESS,
          message: expect.stringContaining('active session removed after expiry'),
        }),
      }),
    )
  })

  it('treats an already-absent session as a successful expired state', async () => {
    const { lifecycle, prisma } = buildHarness('absent')

    await lifecycle.expireActivations()

    expect(prisma.disconnectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DisconnectionStatus.SUCCESS,
          message: expect.stringContaining('already absent'),
        }),
      }),
    )
  })

  it('retries a temporarily unreachable router instead of claiming logout succeeded when CoA is disabled', async () => {
    const { lifecycle, prisma } = buildHarness('failed')

    await lifecycle.expireActivations()

    expect(prisma.disconnectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DisconnectionStatus.NOT_SUPPORTED,
          retryCount: 1,
          nextRetryAt: expect.any(Date),
          message: expect.stringContaining('router unreachable'),
        }),
      }),
    )
  })

  it('uses RouterOS API during a failed CoA backoff and marks the disconnect successful', async () => {
    const { lifecycle, prisma } = buildHarness(
      'removed',
      DisconnectionMethod.RADIUS_DISCONNECT,
    )

    await lifecycle.expireActivations()

    expect(lifecycle.logoutHotspotActiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        routerId: 'router-1',
        username: 'expired-user',
      }),
    )
    expect(prisma.disconnectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'disconnect-1' },
        data: expect.objectContaining({
          status: DisconnectionStatus.SUCCESS,
          nextRetryAt: null,
          message: expect.stringContaining('after CoA failure'),
        }),
      }),
    )
  })

  it('retries a failed exact MAC lookup by RADIUS username so an expired user cannot remain online', async () => {
    const { lifecycle, prisma } = buildHarness(
      'mac-mismatch',
      DisconnectionMethod.RADIUS_DISCONNECT,
    )

    await lifecycle.expireActivations()

    expect(lifecycle.logoutHotspotActiveSession).toHaveBeenCalledTimes(2)
    expect(lifecycle.logoutHotspotActiveSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        username: 'expired-user',
        macAddress: null,
      }),
    )
    expect(prisma.disconnectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DisconnectionStatus.SUCCESS,
        }),
      }),
    )
  })

  it('leaves the normal RADIUS retry queued when RouterOS API recovery is temporarily unreachable', async () => {
    const { lifecycle, prisma } = buildHarness(
      'failed',
      DisconnectionMethod.RADIUS_DISCONNECT,
    )

    await lifecycle.expireActivations()

    expect(prisma.disconnectionAttempt.update).not.toHaveBeenCalled()
  })
})
