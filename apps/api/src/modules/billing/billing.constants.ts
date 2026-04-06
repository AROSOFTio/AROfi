import { BillingChannel } from '@prisma/client'

export const BILLING_FEE_BASIS_POINTS: Record<BillingChannel, number> = {
  [BillingChannel.MOBILE_MONEY]: 800,
  [BillingChannel.VOUCHER]: 200,
  [BillingChannel.WALLET_ADJUSTMENT]: 0,
  [BillingChannel.SYSTEM]: 0,
}

export const LEDGER_ACCOUNTS = {
  salesClearing: 'sales_clearing',
  tenantWallet: 'tenant_wallet',
  platformRevenue: 'platform_revenue',
  adjustmentClearing: 'adjustment_clearing',
} as const
