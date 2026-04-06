import { BillingChannel, LedgerDirection } from '@prisma/client'
import { BillingPostingService } from './billing-posting.service'
import { FeeEngineService } from './fee-engine.service'

describe('BillingPostingService', () => {
  let service: BillingPostingService

  beforeEach(() => {
    service = new BillingPostingService(new FeeEngineService())
  })

  it('creates balanced ledger entries for voucher sales', () => {
    const posting = service.buildSalePosting({
      tenantId: 'tenant-1',
      walletId: 'wallet-1',
      channel: BillingChannel.VOUCHER,
      grossAmountUgx: 1000,
      description: 'Voucher sale',
    })

    const totalDebits = posting.entries
      .filter((entry) => entry.direction === LedgerDirection.DEBIT)
      .reduce((total, entry) => total + entry.amountUgx, 0)
    const totalCredits = posting.entries
      .filter((entry) => entry.direction === LedgerDirection.CREDIT)
      .reduce((total, entry) => total + entry.amountUgx, 0)

    expect(posting.feeAmountUgx).toBe(20)
    expect(posting.netAmountUgx).toBe(980)
    expect(posting.walletDeltaUgx).toBe(980)
    expect(totalDebits).toBe(totalCredits)
  })

  it('creates a debit adjustment when wallet balance is reduced', () => {
    const posting = service.buildWalletAdjustmentPosting({
      tenantId: 'tenant-1',
      walletId: 'wallet-1',
      amountUgx: -5000,
      description: 'Manual correction',
    })

    expect(posting.grossAmountUgx).toBe(5000)
    expect(posting.netAmountUgx).toBe(-5000)
    expect(posting.walletDeltaUgx).toBe(-5000)
    expect(posting.entries[0].direction).toBe(LedgerDirection.DEBIT)
    expect(posting.entries[1].direction).toBe(LedgerDirection.CREDIT)
  })
})
