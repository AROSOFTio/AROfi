export type TenantSummary = {
  id: string
  name: string
}

export type PackageCatalogResponse = {
  summary: {
    totalPackages: number
    activePackages: number
    featuredPackages: number
    averagePriceUgx: number
  }
  items: Array<{
    id: string
    tenant: TenantSummary
    name: string
    code: string
    description?: string | null
    durationMinutes: number
    dataLimitMb?: number | null
    deviceLimit?: number | null
    downloadSpeedKbps?: number | null
    uploadSpeedKbps?: number | null
    isFeatured: boolean
    status: string
    activePriceUgx: number
    priceHistoryCount: number
    voucherBatchCount: number
    voucherCount: number
    updatedAt: string
  }>
}

export type VouchersOverviewResponse = {
  summary: {
    totalBatches: number
    totalGenerated: number
    activeUnused: number
    sold: number
    redeemed: number
    totalVoucherSalesUgx: number
    totalVoucherFeesUgx: number
  }
  batches: Array<{
    id: string
    batchNumber: string
    prefix: string
    quantity: number
    faceValueUgx: number
    status: string
    tenant: TenantSummary
    package: {
      id: string
      name: string
      code: string
    }
    generatedCount: number
    soldCount: number
    redeemedCount: number
    remainingCount: number
    createdAt: string
  }>
  recentSales: Array<{
    id: string
    tenant: TenantSummary
    package?: {
      id: string
      name: string
      code: string
    } | null
    voucher?: {
      id: string
      code: string
    } | null
    grossAmountUgx: number
    feeAmountUgx: number
    netAmountUgx: number
    customerReference?: string | null
    createdAt: string
  }>
  recentRedemptions: Array<{
    id: string
    tenant: TenantSummary
    package: {
      id: string
      name: string
      code: string
    }
    voucher: {
      id: string
      code: string
    }
    hotspot?: {
      id: string
      name: string
    } | null
    customerReference?: string | null
    createdAt: string
  }>
}

export type BillingSalesResponse = {
  summary: {
    count: number
    totalGrossUgx: number
    totalFeesUgx: number
    totalNetUgx: number
    mobileMoneyGrossUgx: number
    voucherGrossUgx: number
  }
  items: BillingTransactionItem[]
}

export type BillingTransactionsResponse = {
  summary: {
    totalTransactions: number
    completed: number
    pending: number
    reversed: number
    totalGrossUgx: number
    totalFeesUgx: number
    totalNetUgx: number
    walletBalanceUgx: number
  }
  items: BillingTransactionItem[]
}

export type BillingOverviewResponse = {
  summary: {
    totalTransactions: number
    completedTransactions: number
    pendingTransactions: number
    totalSalesUgx: number
    mobileMoneyGrossUgx: number
    voucherGrossUgx: number
    platformFeesUgx: number
    vendorNetUgx: number
    walletBalanceUgx: number
  }
  wallets: Array<{
    id: string
    balanceUgx: number
    currency: string
    tenant: TenantSummary
  }>
  recentTransactions: BillingTransactionItem[]
  recentLedgerEntries: Array<{
    id: string
    accountCode: string
    direction: string
    amountUgx: number
    memo?: string | null
    createdAt: string
    tenant?: TenantSummary | null
    wallet?: {
      id: string
      balanceUgx: number
    } | null
    ledgerTransaction: {
      reference: string
      description: string
      channel: string
      type: string
    }
  }>
}

export type BillingTransactionItem = {
  id: string
  channel: string
  type: string
  status: string
  grossAmountUgx: number
  feeAmountUgx: number
  netAmountUgx: number
  customerReference?: string | null
  externalReference?: string | null
  paymentProvider?: string | null
  createdAt: string
  tenant: TenantSummary
  wallet?: {
    id: string
    balanceUgx: number
    currency: string
  } | null
  package?: {
    id: string
    name: string
    code: string
  } | null
  voucher?: {
    id: string
    code: string
    status: string
  } | null
  ledgerTransaction?: {
    id: string
    reference: string
    description: string
  } | null
}
