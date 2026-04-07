import { BillingChannel } from '@prisma/client'

export const BILLING_FEE_BASIS_POINTS: Record<BillingChannel, number> = {
  [BillingChannel.MOBILE_MONEY]: 800,
  [BillingChannel.VOUCHER]: 200,
  [BillingChannel.WALLET_ADJUSTMENT]: 0,
  [BillingChannel.FLOAT_TRANSFER]: 0,
  [BillingChannel.COMMISSION]: 0,
  [BillingChannel.DISBURSEMENT]: 0,
  [BillingChannel.SYSTEM]: 0,
}

export const LEDGER_ACCOUNTS = {
  salesClearing: 'sales_clearing',
  tenantWallet: 'tenant_wallet',
  agentWallet: 'agent_wallet',
  platformRevenue: 'platform_revenue',
  commissionExpense: 'commission_expense',
  adjustmentClearing: 'adjustment_clearing',
  disbursementClearing: 'disbursement_clearing',
} as const
