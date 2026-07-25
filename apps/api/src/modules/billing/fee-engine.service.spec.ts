import { BillingChannel } from '@prisma/client'
import { FeeEngineService } from './fee-engine.service'

describe('FeeEngineService', () => {
  let service: FeeEngineService
  let prisma: {
    platformSetting: { upsert: jest.Mock }
    tenantSetting: { findUnique: jest.Mock }
  }

  beforeEach(() => {
    prisma = {
      platformSetting: {
        upsert: jest.fn().mockResolvedValue({
          mobileMoneyFeeBps: 800,
          voucherFeeBps: 200,
          proMobileMoneyFeeBps: 300,
          proVoucherFeeBps: 0,
          enterpriseMobileMoneyFeeBps: 160,
          enterpriseVoucherFeeBps: 0,
        }),
      },
      tenantSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    }
    service = new FeeEngineService(prisma as never)
  })

  it('calculates 8 percent fee for Free mobile money collections by default', async () => {
    await expect(service.calculateBreakdown(BillingChannel.MOBILE_MONEY, 10000, 'tenant-1')).resolves.toEqual({
      grossAmountUgx: 10000,
      feeAmountUgx: 800,
      netAmountUgx: 9200,
      feeBasisPoints: 800,
      feeSource: 'GLOBAL_DEFAULT',
      basisPoints: 800,
    })
  })

  it('calculates 2 percent fee for voucher sales', async () => {
    await expect(service.calculateBreakdown(BillingChannel.VOUCHER, 10000, 'tenant-1')).resolves.toEqual({
      grossAmountUgx: 10000,
      feeAmountUgx: 200,
      netAmountUgx: 9800,
      feeBasisPoints: 200,
      feeSource: 'GLOBAL_DEFAULT',
      basisPoints: 200,
    })
  })

  it('uses tenant overrides when configured', async () => {
    prisma.tenantSetting.findUnique.mockResolvedValue({
      tenantMobileMoneyFeeBps: 500,
      tenantVoucherFeeBps: 150,
    })

    await expect(service.calculateBreakdown(BillingChannel.MOBILE_MONEY, 10000, 'tenant-1')).resolves.toEqual({
      grossAmountUgx: 10000,
      feeAmountUgx: 500,
      netAmountUgx: 9500,
      feeBasisPoints: 500,
      feeSource: 'TENANT_OVERRIDE',
      basisPoints: 500,
    })
  })

  it('uses the DevAdmin-configured Pro rate for a tenant on an active Pro plan', async () => {
    prisma.tenantSetting.findUnique.mockResolvedValue({
      tenantMobileMoneyFeeBps: null,
      tenantVoucherFeeBps: null,
      subscriptionPlan: 'PRO',
      subscriptionPlanExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    await expect(service.calculateBreakdown(BillingChannel.MOBILE_MONEY, 10000, 'tenant-1')).resolves.toEqual({
      grossAmountUgx: 10000,
      feeAmountUgx: 300,
      netAmountUgx: 9700,
      feeBasisPoints: 300,
      feeSource: 'PLAN_TIER',
      basisPoints: 300,
    })
  })

  it('uses the DevAdmin-configured Enterprise voucher rate for a tenant on an active Enterprise plan', async () => {
    prisma.tenantSetting.findUnique.mockResolvedValue({
      tenantMobileMoneyFeeBps: null,
      tenantVoucherFeeBps: null,
      subscriptionPlan: 'ENTERPRISE',
      subscriptionPlanExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    await expect(service.calculateBreakdown(BillingChannel.VOUCHER, 10000, 'tenant-1')).resolves.toEqual({
      grossAmountUgx: 10000,
      feeAmountUgx: 0,
      netAmountUgx: 10000,
      feeBasisPoints: 0,
      feeSource: 'PLAN_TIER',
      basisPoints: 0,
    })
  })

  it('falls back to the Free/global rate once a paid plan has expired without renewal', async () => {
    prisma.tenantSetting.findUnique.mockResolvedValue({
      tenantMobileMoneyFeeBps: null,
      tenantVoucherFeeBps: null,
      subscriptionPlan: 'PRO',
      subscriptionPlanExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })

    await expect(service.calculateBreakdown(BillingChannel.MOBILE_MONEY, 10000, 'tenant-1')).resolves.toEqual({
      grossAmountUgx: 10000,
      feeAmountUgx: 800,
      netAmountUgx: 9200,
      feeBasisPoints: 800,
      feeSource: 'GLOBAL_DEFAULT',
      basisPoints: 800,
    })
  })

  it('does not charge fees for wallet adjustments', async () => {
    await expect(service.calculateBreakdown(BillingChannel.WALLET_ADJUSTMENT, 15000)).resolves.toEqual({
      grossAmountUgx: 15000,
      feeAmountUgx: 0,
      netAmountUgx: 15000,
      feeBasisPoints: 0,
      feeSource: 'GLOBAL_DEFAULT',
      basisPoints: 0,
    })
  })
})
