export type TenantSummary = {
  id: string
  name: string
}

export type KycDocumentItem = {
  id: string
  documentType: 'BUSINESS_REGISTRATION' | 'OWNER_ID' | 'PROOF_OF_ADDRESS' | 'OTHER'
  fileName: string
  mimeType: string
  fileSize: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewNotes?: string | null
  reviewedAt?: string | null
  createdAt: string
  tenant: TenantSummary
}

export type VoucherTenantSummary = TenantSummary & {
  domain?: string | null
  hotspotDomain?: string | null
  supportPhone?: string | null
  supportEmail?: string | null
}

export type AdminSessionResponse = {
  user: {
    id: string
    email: string
    role: string
    permissions: string[]
    tenantId?: string | null
    tenantName?: string | null
    displayName: string
  }
}

export type TenantRegistrationResponse = {
  // Session is delivered as HttpOnly cookies set by the API — no token in
  // the body.
  user: AdminSessionResponse['user']
  tenant: {
    id: string
    name: string
    domain?: string | null
    brandColor?: string | null
    portalTemplate?: string | null
    supportPhone?: string | null
    supportEmail?: string | null
  }
  starterWorkspace: {
    wallet: {
      id: string
      balanceUgx: number
      currency: string
    }
    primaryRouterGroup: {
      id: string
      name: string
      code: string
    }
    primaryHotspot: {
      id: string
      name: string
      secret?: string | null
    }
  }
  onboarding: {
    checklist: Array<{
      title: string
      description: string
      path: string
    }>
  }
}

export type TenantOverviewResponse = {
  summary: {
    totalTenants: number
    withDomain: number
    totalHotspots: number
    totalRouters: number
  }
  items: TenantItem[]
}

export type UsersOverviewResponse = {
  roles: Array<{
    id: string
    name: string
    permissions: string[]
  }>
  users: Array<{
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
    tenant?: TenantSummary | null
    role: {
      id: string
      name: string
      permissions: string[]
    }
  }>
}

export type TenantItem = {
  id: string
  name: string
  domain?: string | null
  logoUrl?: string | null
  brandColor?: string | null
  portalTemplate?: string | null
  supportPhone?: string | null
  supportEmail?: string | null
  createdAt: string
  updatedAt: string
  wallet?: {
    id: string
    balanceUgx: number
    currency: string
  } | null
  status?: {
    accountActive: boolean
    fraudHold: boolean
    kycCompleted: boolean
  }
  earnings?: {
    grossSalesUgx: number
    platformFeesUgx: number
    netEarningsUgx: number
    pendingWithdrawalUgx: number
    completedWithdrawalUgx: number
    failedWithdrawalCount: number
    pendingWithdrawalCount: number
  }
  payoutNumbers?: Array<{
    id: string
    network: string
    phone: string
    normalizedPhone: string
    label?: string | null
    ownerName?: string | null
    isPrimary: boolean
    status: string
    verifiedAt?: string | null
    createdAt: string
  }>
  payoutNumberChangeRequests?: Array<{
    id: string
    requestedNetwork: string
    requestedPhone: string
    requestedNormalizedPhone: string
    reason: string
    status: string
    createdAt: string
  }>
  counts: {
    users: number
    hotspots: number
    routers: number
    packages: number
  }
}

export type PlatformWithdrawalsResponse = {
  summary: {
    totalWithdrawals: number
    pendingReview: number
    failed: number
    completedAmountUgx: number
    pendingPayoutNumbers: number
    pendingNumberChanges: number
  }
  items: Array<{
    id: string
    reference: string
    status: string
    network?: string | null
    provider?: string | null
    amountUgx: number
    destinationReference?: string | null
    providerReference?: string | null
    notes?: string | null
    createdAt: string
    completedAt?: string | null
    tenant: TenantSummary & { domain?: string | null }
    billingTransaction?: {
      id: string
      grossAmountUgx: number
      feeAmountUgx: number
      netAmountUgx: number
      status: string
    } | null
  }>
  pendingPayoutNumbers: Array<{
    id: string
    network: string
    phone: string
    normalizedPhone: string
    label?: string | null
    ownerName?: string | null
    isPrimary: boolean
    status: string
    createdAt: string
    tenant: TenantSummary & { domain?: string | null }
  }>
  pendingNumberChanges: Array<{
    id: string
    existingPayoutNumberId?: string | null
    requestedNetwork: string
    requestedPhone: string
    requestedNormalizedPhone: string
    reason: string
    status: string
    createdAt: string
    tenant: TenantSummary & { domain?: string | null }
  }>
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
    isTrialEnabled: boolean
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
    tenant: VoucherTenantSummary
    package: {
      id: string
      name: string
      code: string
      durationMinutes: number
    }
    agent?: {
      id: string
      code: string
      name: string
      phoneNumber: string
    } | null
    generatedCount: number
    soldCount: number
    redeemedCount: number
    remainingCount: number
    previewVouchers: Array<{
      id: string
      code: string
      status: string
    }>
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
    networkSessions?: Array<{
      id: string
      status: string
      ipAddress?: string | null
    }>
  }>
}

export type VoucherTemplatesResponse = {
  summary: {
    totalTemplates: number
    activeTemplates: number
    defaultTemplates: number
  }
  items: Array<{
    id: string
    tenantId: string
    packageId?: string | null
    name: string
    code: string
    prefix: string
    defaultQuantity: number
    faceValueUgx?: number | null
    expiresAfterDays?: number | null
    isDefault: boolean
    isActive: boolean
    notes?: string | null
    createdAt: string
    updatedAt: string
    tenant: TenantSummary
    package?: {
      id: string
      name: string
      code: string
    } | null
    _count?: {
      batches: number
    }
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

export type BillingSalesByTenantResponse = {
  rows: Array<{
    tenantId: string
    tenantName: string
    subscriptionPlan: 'FREE' | 'PRO' | 'ENTERPRISE'
    salesCount: number
    grossSalesUgx: number
    platformFeesUgx: number
    netEarningsUgx: number
  }>
  summary: {
    tenantCount: number
    totalSalesCount: number
    totalGrossSalesUgx: number
    totalPlatformFeesUgx: number
    totalNetEarningsUgx: number
  }
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
    grossSalesUgx?: number
    mobileMoneyGrossUgx: number
    mobileMoneyFeesUgx?: number
    mobileMoneyNetUgx?: number
    voucherGrossUgx: number
    voucherFeesUgx?: number
    voucherNetUgx?: number
    platformFeesUgx: number
    netEarningsUgx?: number
    vendorNetUgx: number
    todayGrossSalesUgx?: number
    todayNetEarningsUgx?: number
    monthGrossSalesUgx?: number
    monthNetEarningsUgx?: number
    walletBalanceUgx: number
    withdrawableBalanceUgx?: number
    pendingWithdrawalUgx?: number
    completedWithdrawalUgx?: number
    failedWithdrawalUgx?: number
    activeUsers?: number
    onlineRouters?: number
    dataUsedMb?: number
  }
  wallets: Array<{
    id: string
    balanceUgx: number
    currency: string
    tenant: TenantSummary
  }>
  recentTransactions: BillingTransactionItem[]
  chart?: Array<{
    date: string
    grossSalesUgx: number
    platformFeesUgx: number
    netEarningsUgx: number
    mobileMoneyGrossUgx: number
    voucherGrossUgx: number
  }>
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
  payment?: {
    id: string
    phoneNumber: string
    normalizedPhone?: string | null
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
  voucherSalesUgx?: number
  voucherAgentPayUgx?: number
  cashToCollectUgx?: number
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
    voucherSalesUgx?: number
    voucherAgentPayUgx?: number
    cashToCollectUgx?: number
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
    } | null
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
    agent?: {
      id: string
      code: string
      name: string
      phoneNumber: string
    } | null
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

export type HotspotOverviewResponse = {
  summary: {
    totalHotspots: number
    configuredNas: number
    linkedRouters: number
    activeSessions: number
    activeActivations: number
    voucherRedemptions: number
  }
  items: HotspotItem[]
}

export type HotspotItem = {
  id: string
  name: string
  nasIpAddress?: string | null
  secretHint?: string | null
  tenant: TenantSummary
  routerCount: number
  activeSessions: number
  activationCount: number
  activeActivations: number
  voucherRedemptions: number
  lastActivityAt?: string | null
  createdAt: string
  updatedAt: string
  routers: Array<{
    id: string
    name: string
    status: string
    host: string
    identity: string
    siteLabel?: string | null
  }>
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
  locationText?: string | null
  ispName?: string | null
  managerName?: string | null
  managerPhone?: string | null
  model?: string | null
  serialNumber?: string | null
  routerOsVersion?: string | null
  onboardingStatus?: string
  verificationStatus?: string
  registrationKey?: string
  scriptGeneratedAt?: string | null
  lastProvisionedAt?: string | null
  lastRadiusSignalAt?: string | null
  lastAccountingSignalAt?: string | null
  lastAuthSignalAt?: string | null
  provisioningCallbackReceived?: boolean
  radiusAuthSeen?: boolean
  accountingSeen?: boolean
  managementApiReachable?: boolean
  managementApiMessage?: string | null
  liveState?: 'LIVE' | 'STALE' | 'OFFLINE' | 'PENDING'
  isLiveNow?: boolean
  lastSignalAt?: string | null
  lastSignalSource?: string | null
  secondsSinceLastSignal?: number | null
  routerOnlineWindowSeconds?: number
  hotspotServerName?: string | null
  portalWalledGardenHosts?: string[]
  ttlAntiTetheringEnabled?: boolean
  remotePort?: number | null
  isRemotePortOpen?: boolean
  remoteSstpIp?: string | null
  remoteToken?: string | null
  remoteClientName?: string | null
  remoteAccessEnabled?: boolean
  status: string
  healthMessage?: string | null
  lastSeenAt?: string | null
  lastHealthCheckAt?: string | null
  lastLatencyMs?: number | null
  lastOfflineAt?: string | null
  lastReconnectedAt?: string | null
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
  nasClient?: {
    id: number
    nasname: string
    shortname: string
    type: string
    enabled: boolean
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
    liveRouters?: number
    degradedRouters: number
    staleRouters?: number
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
  oneRunCommand?: string
  onboardingChecklist: string[]
  provisioningScript: string
  setupDiagnostics?: Array<{
    code: string
    label: string
    ok: boolean
    checkedAt?: string | null
  }>
  radiusClient?: {
    id: string
    shortName: string
    ipAddress: string
    status: string
    sharedSecretHint: string
    sharedSecret: string
  } | null
  nasClient?: {
    id: number
    nasname: string
    shortname: string
    type: string
    enabled: boolean
  } | null
}

export type RouterCompensationOverview = {
  settings: {
    autoCompensateRouterOutages: boolean
  }
  outages: Array<{
    id: string
    offlineAt: string
    restoredAt?: string | null
    durationSeconds?: number | null
    status: string
    affectedActivations: number
    totalSecondsCredited: number
  }>
  compensations: Array<{
    id: string
    secondsCredited: number
    previousEndsAt: string
    newEndsAt: string
    accessPhoneNumber?: string | null
    customerReference?: string | null
    createdAt: string
    activation: {
      package: {
        name: string
      }
    }
  }>
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
  deviceLabel?: string | null
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

export type BlogPostStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type BlogPostSummary = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  status: BlogPostStatus
  metaTitle: string | null
  metaDescription: string | null
  tags: string[]
  coverImageId: string | null
  viewCount: number
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type BlogPostDetail = BlogPostSummary & {
  contentHtml: string
}

export type BlogPostListResponse = {
  items: BlogPostSummary[]
  total: number
  page: number
  pageSize: number
}
