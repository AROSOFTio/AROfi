import { SubscriptionService } from './subscription.service'

describe('SubscriptionService plan selection', () => {
  const paymentRouterService = {} as never
  const phoneNumberService = {} as never
  const mailService = {} as never
  const realtimeEvents = {} as never

  function createService(initialPreferences: Record<string, unknown> = {}) {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          tenantSettings: {
            routerOnboardingPreferences: initialPreferences,
          },
        }),
      },
      tenantSetting: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    }

    return {
      prisma,
      service: new SubscriptionService(prisma as never, paymentRouterService, phoneNumberService, mailService, realtimeEvents),
    }
  }

  it('does not treat the default Free plan as an explicit onboarding selection', async () => {
    const { service } = createService({
      selectedPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    })

    await expect(service.getStatus('tenant-1')).resolves.toMatchObject({
      selectedPlan: 'FREE',
      planSelectionConfirmed: false,
      subscriptionStatus: 'ACTIVE',
    })
  })

  it('marks Free as explicitly selected and persists the authoritative plan columns', async () => {
    const { prisma, service } = createService()

    await expect(service.selectPlan('tenant-1', 'FREE')).resolves.toMatchObject({
      selectedPlan: 'FREE',
      planSelectionConfirmed: true,
      subscriptionStatus: 'ACTIVE',
    })

    expect(prisma.tenantSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          subscriptionPlan: 'FREE',
          subscriptionPlanExpiresAt: null,
        }),
      }),
    )
    expect(prisma.tenantSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          routerOnboardingPreferences: expect.objectContaining({
            selectedPlan: 'FREE',
            planSelectionConfirmed: true,
            subscriptionStatus: 'ACTIVE',
          }),
        }),
      }),
    )
  })
})
