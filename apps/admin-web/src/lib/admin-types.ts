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
  agent?: {
    id: string
    code: string
    name: string
    phoneNumber: string
    type: string
    status: string
  } | null
  ledgerTransaction?: {
    id: string
    reference: string
    description: string
  } | null
}

export type AgentItem = {
  id: string
  code: string
  name: string
  phoneNumber: string
  email?: string | null
  type: string
  status: string
  territory?: string | null
  commissionRateBps: number
  floatLimitUgx: number
  notes?: string | null
  createdAt: string
  tenant: TenantSummary
  wallet?: {
    id: string
    balanceUgx: number
    currency: string
  } | null
  walletBalanceUgx: number
  availableFloatUgx: number
  accruedCommissionUgx: number
  settledCommissionUgx: number
  lifetimeSalesUgx: number
  lifetimeCommissionUgx: number
  totalDisbursedUgx: number
}

export type AgentsOverviewResponse = {
  summary: {
    totalAgents: number
    activeAgents: number
    resellers: number
    totalFloatUgx: number
    accruedCommissionUgx: number
    totalDisbursedUgx: number
  }
  agents: AgentItem[]
  recentCommissions: Array<{
    id: string
    status: string
    amountUgx: number
    createdAt: string
    tenant: TenantSummary
    agent: {
      id: string
      code: string
      name: string
    }
    sourceTransaction?: {
      id: string
      type: string
      grossAmountUgx: number
      createdAt: string
    } | null
  }>
  recentDisbursements: Array<{
    id: string
    reference: string
    method: string
    status: string
    amountUgx: number
    destinationReference?: string | null
    providerReference?: string | null
    createdAt: string
    completedAt?: string | null
    tenant: TenantSummary
    agent: {
      id: string
      code: string
      name: string
    }
    settlement?: {
      id: string
      reference: string
    } | null
  }>
}

export type FloatOverviewResponse = {
  summary: {
    tenantWalletBalanceUgx: number
    totalAgentWalletBalanceUgx: number
    reservedCommissionUgx: number
    workingFloatUgx: number
    activeAgents: number
  }
  tenantWallets: Array<{
    id: string
    balanceUgx: number
    currency: string
    tenant: TenantSummary
  }>
  agents: AgentItem[]
  movements: BillingTransactionItem[]
}

export type DisbursementOverviewResponse = {
  summary: {
    totalSettlements: number
    readySettlements: number
    processingSettlements: number
    totalPayableUgx: number
    totalDisbursedUgx: number
    pendingDisbursementUgx: number
  }
  settlements: Array<{
    id: string
    reference: string
    status: string
    periodStart: string
    periodEnd: string
    openingFloatUgx: number
    closingFloatUgx: number
    grossSalesUgx: number
    commissionsUgx: number
    payableAmountUgx: number
    notes?: string | null
    createdAt: string
    updatedAt: string
    tenant: TenantSummary
    agent: {
      id: string
      code: string
      name: string
      phoneNumber: string
    }
    disbursedAmountUgx: number
  }>
  disbursements: Array<{
    id: string
    reference: string
    method: string
    status: string
    amountUgx: number
    destinationReference?: string | null
    providerReference?: string | null
    notes?: string | null
    createdAt: string
    completedAt?: string | null
    tenant: TenantSummary
    agent: {
      id: string
      code: string
      name: string
      phoneNumber: string
    }
    settlement?: {
      id: string
      reference: string
      payableAmountUgx: number
    } | null
    billingTransaction?: {
      id: string
      externalReference: string
      status: string
    } | null
  }>
}

export type PaymentOverviewResponse = {
  summary: {
    totalPayments: number
    pendingPayments: number
    completedPayments: number
    failedPayments: number
    grossCollectionsUgx: number
    activeActivations: number
    mobileMoneyRequests: number
  }
  payments: PaymentItem[]
  recentLogs: PaymentLogItem[]
}

export type PaymentItem = {
  id: string
  provider: string
  method: string
  network: string
  status: string
  amountUgx: number
  currency: string
  phoneNumber: string
  customerReference?: string | null
  externalReference: string
  providerReference?: string | null
  providerStatus?: string | null
  statusMessage?: string | null
  initiatedAt: string
  completedAt?: string | null
  failedAt?: string | null
  createdAt: string
  tenant: TenantSummary & {
    domain?: string | null
  }
  package: {
    id: string
    name: string
    code: string
    durationMinutes: number
    dataLimitMb?: number | null
    deviceLimit?: number | null
    downloadSpeedKbps?: number | null
    uploadSpeedKbps?: number | null
  }
  billingTransaction?: {
    id: string
    status: string
    externalReference?: string | null
    grossAmountUgx: number
    feeAmountUgx: number
    netAmountUgx: number
    createdAt: string
  } | null
  activation?: {
    id: string
    status: string
    startedAt: string
    endsAt: string
    accessPhoneNumber?: string | null
    package: {
      id: string
      name: string
      code: string
    }
    hotspot?: {
      id: string
      name: string
    } | null
  } | null
}

export type PaymentLogItem = {
  id: string
  eventType: string
  externalReference?: string | null
  providerReference?: string | null
  verificationStatus?: string | null
  notes?: string | null
  isProcessed: boolean
  processedAt?: string | null
  createdAt: string
  tenant?: TenantSummary | null
  payment?: {
    id: string
    externalReference: string
    status: string
  } | null
}

export type RouterItem = {
  id: string
  name: string
  identity: string
  vendor: string
  host: string
  apiPort: number
  connectionMode: string
  siteLabel?: string | null
  model?: string | null
  serialNumber?: string | null
  routerOsVersion?: string | null
  status: string
  healthMessage?: string | null
  lastSeenAt?: string | null
  lastHealthCheckAt?: string | null
  lastLatencyMs?: number | null
  activeSessions: number
  tags: string[]
  tenant: TenantSummary & {
    domain?: string | null
  }
  group?: {
    id: string
    name: string
    code: string
  } | null
  hotspot?: {
    id: string
    name: string
    nasIpAddress?: string | null
  } | null
  radiusClient?: {
    id: string
    shortName: string
    ipAddress: string
    status: string
    sharedSecretHint?: string | null
  } | null
  latestHealthCheck?: {
    id: string
    status: string
    latencyMs?: number | null
    message?: string | null
    checkedAt: string
  } | null
}

export type RouterOverviewResponse = {
  summary: {
    totalRouters: number
    healthyRouters: number
    degradedRouters: number
    offlineRouters: number
    pendingRouters: number
    routerGroups: number
    activeSessions: number
    averageLatencyMs: number
  }
  groups: Array<{
    id: string
    name: string
    code: string
    description?: string | null
    region?: string | null
    tenant: TenantSummary
    routerCount: number
    healthyCount: number
    degradedCount: number
    offlineCount: number
  }>
  routers: RouterItem[]
  recentHealthChecks: Array<{
    id: string
    status: string
    latencyMs?: number | null
    message?: string | null
    checkedAt: string
    tenant: TenantSummary
    router: {
      id: string
      name: string
    }
  }>
  radiusFoundation: {
    serverHost: string
    authPort: number
    accountingPort: number
    sharedSecretHint: string
    clientsConfigured: number
    authEventsToday: number
    accountingEventsToday: number
  }
}

export type RouterSetupResponse = {
  router: RouterItem
  radiusServer: {
    host: string
    authPort: number
    accountingPort: number
    sharedSecret: string
  }
  onboardingChecklist: string[]
  provisioningScript: string
  radiusClient?: {
    id: string
    shortName: string
    ipAddress: string
    status: string
    sharedSecretHint: string
    sharedSecret: string
  } | null
}

export type SessionItem = {
  id: string
  radiusSessionId: string
  status: string
  username: string
  customerReference?: string | null
  phoneNumber?: string | null
  macAddress?: string | null
  ipAddress?: string | null
  nasIpAddress?: string | null
  packageName: string
  startedAt: string
  endedAt?: string | null
  sessionTimeSeconds: number
  dataUsedMb: number
  inputMb: number
  outputMb: number
  lastAccountingAt?: string | null
  tenant: TenantSummary
  router?: {
    id: string
    name: string
    status: string
  } | null
  hotspot?: {
    id: string
    name: string
  } | null
  activation?: {
    id: string
    status: string
    endsAt: string
    package: {
      id: string
      name: string
      code: string
    }
  } | null
  voucherRedemption?: {
    id: string
    voucher: {
      id: string
      code: string
    }
  } | null
}

export type SessionOverviewResponse = {
  summary: {
    activeSessions: number
    totalSessionsToday: number
    dataUsedTodayMb: number
    averageSessionMinutes: number
    acceptedAuthToday: number
    rejectedAuthToday: number
  }
  activeSessions: SessionItem[]
  recentSessions: SessionItem[]
  recentEvents: Array<{
    id: string
    eventType: string
    username?: string | null
    customerReference?: string | null
    phoneNumber?: string | null
    macAddress?: string | null
    ipAddress?: string | null
    nasIpAddress?: string | null
    authMethod?: string | null
    responseCode?: string | null
    message?: string | null
    createdAt: string
    tenant: TenantSummary
    router?: {
      id: string
      name: string
    } | null
    hotspot?: {
      id: string
      name: string
    } | null
    session?: {
      id: string
      radiusSessionId: string
      status: string
    } | null
  }>
  usageByRouter: Array<{
    id: string
    name: string
    tenant?: TenantSummary | null
    activeSessions: number
    totalSessions: number
    totalDataMb: number
  }>
}

export type SystemOverviewResponse = {
  summary: {
    auditEntries: number
    criticalAudits: number
    warningOrExceededLimits: number
    openSupportTickets: number
    inProgressSupportTickets: number
  }
  audit: AuditLogResponse
  featureLimits: FeatureLimitResponse
  support: SupportTicketResponse
}

export type AuditLogResponse = {
  summary: {
    totalEntries: number
    info: number
    warning: number
    error: number
    critical: number
  }
  items: Array<{
    id: string
    action: string
    entity: string
    entityId?: string | null
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
    actorName?: string | null
    actorEmail?: string | null
    userId?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    createdAt: string
    tenant?: TenantSummary | null
    details?: Record<string, unknown> | null
  }>
}

export type FeatureLimitResponse = {
  summary: {
    totalLimits: number
    enabled: number
    warning: number
    exceeded: number
  }
  items: Array<{
    id: string
    tenantId?: string | null
    code: string
    name: string
    category: string
    description?: string | null
    unit?: string | null
    isEnabled: boolean
    limitValue?: number | null
    warningThresholdPct: number
    hardLimit: boolean
    notes?: string | null
    createdAt: string
    updatedAt: string
    currentUsage: number
    usagePercentage?: number | null
    remaining?: number | null
    health: 'disabled' | 'unlimited' | 'healthy' | 'warning' | 'exceeded' | 'blocked'
    tenant?: TenantSummary | null
  }>
}

export type SupportTicketResponse = {
  summary: {
    totalTickets: number
    open: number
    inProgress: number
    pendingCustomer: number
    resolved: number
    critical: number
  }
  items: Array<{
    id: string
    tenantId: string
    reference: string
    subject: string
    category: string
    priority: string
    status: string
    channel: string
    customerReference?: string | null
    phoneNumber?: string | null
    email?: string | null
    openedBy?: string | null
    assignedTo?: string | null
    latestResponseAt?: string | null
    resolvedAt?: string | null
    createdAt: string
    updatedAt: string
    tenant?: TenantSummary | null
    _count: {
      messages: number
    }
    messages: Array<{
      id: string
      authorName: string
      authorRole: string
      body: string
      isInternal: boolean
      createdAt: string
    }>
  }>
}
