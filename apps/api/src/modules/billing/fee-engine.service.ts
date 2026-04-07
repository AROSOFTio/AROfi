import { Injectable } from '@nestjs/common'
import { BillingChannel } from '@prisma/client'
import { BILLING_FEE_BASIS_POINTS } from './billing.constants'

@Injectable()
export class FeeEngineService {
  calculateBasisPointAmount(basisPoints: number, amountUgx: number) {
    return Math.round((amountUgx * basisPoints) / 10000)
  }

  calculateFeeAmount(channel: BillingChannel, grossAmountUgx: number) {
    const basisPoints = BILLING_FEE_BASIS_POINTS[channel] ?? 0
    return this.calculateBasisPointAmount(basisPoints, grossAmountUgx)
  }

  calculateBreakdown(channel: BillingChannel, grossAmountUgx: number) {
    const feeAmountUgx = this.calculateFeeAmount(channel, grossAmountUgx)
    const netAmountUgx = grossAmountUgx - feeAmountUgx

    return {
      grossAmountUgx,
      feeAmountUgx,
      netAmountUgx,
      basisPoints: BILLING_FEE_BASIS_POINTS[channel] ?? 0,
    }
  }
}
