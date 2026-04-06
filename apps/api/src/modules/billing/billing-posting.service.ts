import { Injectable } from '@nestjs/common'
import { BillingChannel, LedgerDirection, LedgerTransactionType } from '@prisma/client'
import { LEDGER_ACCOUNTS } from './billing.constants'
import { FeeEngineService } from './fee-engine.service'

type SalePostingInput = {
  tenantId: string
  walletId: string
  channel: BillingChannel
  grossAmountUgx: number
  description: string
}

type WalletAdjustmentPostingInput = {
  tenantId: string
  walletId: string
  amountUgx: number
  description: string
}

@Injectable()
export class BillingPostingService {
  constructor(private readonly feeEngineService: FeeEngineService) {}

  buildSalePosting(input: SalePostingInput) {
    const breakdown = this.feeEngineService.calculateBreakdown(input.channel, input.grossAmountUgx)

    return {
      ledgerType: LedgerTransactionType.SALE,
      description: input.description,
      channel: input.channel,
      walletDeltaUgx: breakdown.netAmountUgx,
      ...breakdown,
      entries: [
        {
          tenantId: input.tenantId,
          walletId: input.walletId,
          accountCode: LEDGER_ACCOUNTS.salesClearing,
          direction: LedgerDirection.DEBIT,
          amountUgx: breakdown.grossAmountUgx,
          memo: 'Gross sale value',
        },
        {
          tenantId: input.tenantId,
          accountCode: LEDGER_ACCOUNTS.platformRevenue,
          direction: LedgerDirection.CREDIT,
          amountUgx: breakdown.feeAmountUgx,
          memo: 'Platform fee recognised',
        },
        {
          tenantId: input.tenantId,
          walletId: input.walletId,
          accountCode: LEDGER_ACCOUNTS.tenantWallet,
          direction: LedgerDirection.CREDIT,
          amountUgx: breakdown.netAmountUgx,
          memo: 'Vendor net proceeds',
        },
      ],
    }
  }

  buildWalletAdjustmentPosting(input: WalletAdjustmentPostingInput) {
    const absoluteAmountUgx = Math.abs(input.amountUgx)
    const walletDirection = input.amountUgx >= 0 ? LedgerDirection.CREDIT : LedgerDirection.DEBIT
    const clearingDirection = walletDirection === LedgerDirection.CREDIT ? LedgerDirection.DEBIT : LedgerDirection.CREDIT

    return {
      ledgerType: LedgerTransactionType.WALLET_ADJUSTMENT,
      description: input.description,
      channel: BillingChannel.WALLET_ADJUSTMENT,
      grossAmountUgx: absoluteAmountUgx,
      feeAmountUgx: 0,
      netAmountUgx: input.amountUgx,
      walletDeltaUgx: input.amountUgx,
      entries: [
        {
          tenantId: input.tenantId,
          walletId: input.walletId,
          accountCode: LEDGER_ACCOUNTS.tenantWallet,
          direction: walletDirection,
          amountUgx: absoluteAmountUgx,
          memo: input.description,
        },
        {
          tenantId: input.tenantId,
          accountCode: LEDGER_ACCOUNTS.adjustmentClearing,
          direction: clearingDirection,
          amountUgx: absoluteAmountUgx,
          memo: input.description,
        },
      ],
    }
  }
}
