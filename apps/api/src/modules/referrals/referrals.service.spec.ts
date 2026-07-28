import { ReferralCommissionStatus, ReferralRelationshipStatus, SubscriptionPlanTier } from '@prisma/client'
import { ReferralsService } from './referrals.service'

describe('ReferralsService commission qualification', () => {
  it('credits an available referral commission once after a confirmed Pro payment', async () => {
    const prisma = {
      platformSetting: {
        upsert: jest.fn().mockResolvedValue({
          referralProgramEnabled: true,
          referralCommissionBps: 3000,
          referralCommissionBasis: 'PRO_SUBSCRIPTION_PAYMENT',
          referralHoldingPeriodDays: 0,
        }),
      },
      referralRelationship: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rel-1',
          referrerProfileId: 'profile-1',
          status: ReferralRelationshipStatus.PENDING,
          referrerProfile: {
            tenantId: 'referrer-business',
            user: { id: 'referrer-user' },
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      referralCommission: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'commission-1', status: ReferralCommissionStatus.AVAILABLE }),
      },
      referralProfile: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ pendingBalanceUgx: 0, availableBalanceUgx: 5000 }),
        update: jest.fn().mockResolvedValue({}),
      },
      referralWalletTransaction: {
        create: jest.fn().mockResolvedValue({}),
      },
      notification: {
        create: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    }

    const service = new ReferralsService(prisma as never)

    await expect(
      service.recordQualifiedSubscriptionPayment({
        tenantId: 'referred-business',
        subscriptionPaymentId: 'sub-pay-1',
        plan: SubscriptionPlanTier.PRO,
        amountUgx: 20000,
        paidAt: new Date('2026-07-26T12:00:00Z'),
      }),
    ).resolves.toMatchObject({ id: 'commission-1' })

    expect(prisma.referralCommission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountUgx: 6000,
          rateBps: 3000,
          status: ReferralCommissionStatus.AVAILABLE,
          subscriptionPaymentId: 'sub-pay-1',
        }),
      }),
    )
    expect(prisma.referralProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-1' },
        data: { availableBalanceUgx: { increment: 6000 } },
      }),
    )
  })

  it('does not create a duplicate commission for the same subscription payment', async () => {
    const prisma = {
      platformSetting: {
        upsert: jest.fn().mockResolvedValue({
          referralProgramEnabled: true,
          referralCommissionBps: 3000,
          referralCommissionBasis: 'PRO_SUBSCRIPTION_PAYMENT',
          referralHoldingPeriodDays: 0,
        }),
      },
      referralRelationship: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rel-1',
          referrerProfileId: 'profile-1',
          status: ReferralRelationshipStatus.QUALIFIED,
          referrerProfile: { tenantId: 'referrer-business', user: { id: 'referrer-user' } },
        }),
      },
      referralCommission: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing-commission' }),
        create: jest.fn(),
      },
    }

    const service = new ReferralsService(prisma as never)

    await expect(
      service.recordQualifiedSubscriptionPayment({
        tenantId: 'referred-business',
        subscriptionPaymentId: 'sub-pay-1',
        plan: SubscriptionPlanTier.PRO,
        amountUgx: 20000,
        paidAt: new Date('2026-07-26T12:00:00Z'),
      }),
    ).resolves.toEqual({ id: 'existing-commission' })

    expect(prisma.referralCommission.create).not.toHaveBeenCalled()
  })

  it('does not credit referral commission for non-Pro subscription payments', async () => {
    const prisma = {
      platformSetting: {
        upsert: jest.fn(),
      },
      referralCommission: {
        create: jest.fn(),
      },
    }

    const service = new ReferralsService(prisma as never)

    await expect(
      service.recordQualifiedSubscriptionPayment({
        tenantId: 'referred-business',
        subscriptionPaymentId: 'sub-pay-free',
        plan: SubscriptionPlanTier.FREE,
        amountUgx: 20000,
        paidAt: new Date('2026-07-26T12:00:00Z'),
      }),
    ).resolves.toBeNull()

    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled()
    expect(prisma.referralCommission.create).not.toHaveBeenCalled()
  })
})
