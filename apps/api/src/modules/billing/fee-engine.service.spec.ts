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
          mobileMoneyFeeBps: 700,
          voucherFeeBps: 200,
        }),
      },
      tenantSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    }
    service = new FeeEngineService(prisma as never)
  })

  it('calculates 7 percent fee for mobile money collections by default', async () => {
    await expect(service.calculateBreakdown(BillingChannel.MOBILE_MONEY, 10000, 'tenant-1')).resolves.toEqual({
      grossAmountUgx: 10000,
      feeAmountUgx: 700,
      netAmountUgx: 9300,
      feeBasisPoints: 700,
      feeSource: 'GLOBAL_DEFAULT',
      basisPoints: 700,
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
