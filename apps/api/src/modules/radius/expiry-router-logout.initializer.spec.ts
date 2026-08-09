import { DisconnectionStatus } from '@prisma/client'
import { AccessLifecycleService } from './access-lifecycle.service'
import { ExpiryRouterLogoutInitializer } from './expiry-router-logout.initializer'

function buildHarness(logoutResult: 'removed' | 'absent' | 'failed' = 'removed') {
  const lifecycle = {
    expireActivations: jest.fn().mockResolvedValue(undefined),
    logoutHotspotActiveSession: jest.fn(async () => {
      if (logoutResult === 'absent') {
        throw new Error('RouterOS logout fallback found no matching active HotSpot session')
      }
      if (logoutResult === 'failed') {
        throw new Error('router unreachable')
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

  it('retries a temporarily unreachable router instead of claiming logout succeeded', async () => {
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
})
