import { BillingChannel } from '@prisma/client'
import { FeeEngineService } from './fee-engine.service'

describe('FeeEngineService', () => {
  let service: FeeEngineService

  beforeEach(() => {
    service = new FeeEngineService()
  })

  it('calculates 8 percent fee for mobile money collections', () => {
    expect(service.calculateBreakdown(BillingChannel.MOBILE_MONEY, 5000)).toEqual({
      grossAmountUgx: 5000,
      feeAmountUgx: 400,
      netAmountUgx: 4600,
      basisPoints: 800,
    })
  })

  it('calculates 2 percent fee for voucher sales', () => {
    expect(service.calculateBreakdown(BillingChannel.VOUCHER, 1000)).toEqual({
      grossAmountUgx: 1000,
      feeAmountUgx: 20,
      netAmountUgx: 980,
      basisPoints: 200,
    })
  })

  it('does not charge fees for wallet adjustments', () => {
    expect(service.calculateBreakdown(BillingChannel.WALLET_ADJUSTMENT, 15000)).toEqual({
      grossAmountUgx: 15000,
      feeAmountUgx: 0,
      netAmountUgx: 15000,
      basisPoints: 0,
    })
  })
})
