export type PortalContextResponse = {
  tenant: {
    id: string
    name: string
    domain?: string | null
    logoUrl?: string | null
    brandColor?: string | null
    portalTemplate?: string | null
    supportPhone?: string | null
    supportEmail?: string | null
    platformSupportPhone?: string | null
    platformSupportEmail?: string | null
  }
  packages: PortalPackage[]
  paymentNetworks?: Array<'MTN' | 'AIRTEL'>
  activeActivation?: PortalActivation | null
  latestPayment?: PortalPayment | null
  session?: PortalCustomerSession | null
  returningDevice?: {
    existingActiveAccess: boolean
    reason?: string
    message?: string
    activation?: PortalActivation | null
    reconnect?: {
      loginUrl?: string | null
      username?: string | null
      password?: string | null
      method: string
    } | null
  }
}

export type PortalPackage = {
  id: string
  name: string
  code: string
  description?: string | null
  durationMinutes: number
  isTrialEnabled?: boolean
  dataLimitMb?: number | null
  deviceLimit?: number | null
  downloadSpeedKbps?: number | null
  uploadSpeedKbps?: number | null
  isFeatured: boolean
  amountUgx: number
}

export type PortalActivation = {
  id: string
  status: string
  source?: string
  customerReference?: string | null
  accessPhoneNumber?: string | null
  startedAt: string
  endsAt: string
  package: {
    id: string
    name: string
    code: string
  }
  hotspot?: {
    id: string
    name: string
  } | null
}

export type PortalPayment = {
  id: string
  status: string
  provider: string
  method: string
  network: string
  amountUgx: number
  phoneNumber: string
  customerReference?: string | null
  externalReference: string
  providerReference?: string | null
  providerStatus?: string | null
  statusMessage?: string | null
  statusToken?: string | null
  checkoutUrl?: string | null
  responsePayload?: Record<string, unknown> | null
  createdAt: string
  completedAt?: string | null
  package: {
    id: string
    name: string
    code: string
    durationMinutes: number
  }
  activation?: PortalActivation | null
  companionVoucherCodes?: string[]
  billingTransaction?: {
    id: string
    grossAmountUgx: number
    feeAmountUgx: number
    netAmountUgx: number
  } | null
  reconnect?: {
    method?: string
    loginUrl?: string | null
    username?: string | null
    password?: string | null
    routerId?: string | null
    hotspotServerName?: string | null
    expiresAt?: string | null
    fallbackMessage?: string | null
  } | null
}

export type PortalUsageSession = {
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
  router?: {
    id: string
    name: string
    status: string
  } | null
  hotspot?: {
    id: string
    name: string
  } | null
  activation?: PortalActivation | null
  voucherRedemption?: {
    id: string
    voucher: {
      id: string
      code: string
    }
  } | null
}

export type PortalVoucherRedemption = {
  id: string
  tenantId: string
  customerReference?: string | null
  createdAt: string
  voucher: {
    id: string
    code: string
    status: string
  }
  package: {
    id: string
    name: string
    code: string
  }
  hotspot?: {
    id: string
    name: string
  } | null
  activation?: PortalActivation | null
}

export type PortalCustomerSession = {
  authenticatedAt: string
  tokenExpiresAt?: string | null
  tenant: {
    id: string
    name: string
    domain?: string | null
    logoUrl?: string | null
    brandColor?: string | null
    supportPhone?: string | null
    supportEmail?: string | null
  }
  customer: {
    phoneNumber: string
    customerReference?: string | null
  }
  summary: {
    hasActiveAccess: boolean
    activeMinutesRemaining: number
    recentSessionCount: number
    pendingPayments: number
    completedPayments: number
    totalDataUsedMb: number
  }
  activeActivation?: PortalActivation | null
  recentActivations: PortalActivation[]
  activeSession?: PortalUsageSession | null
  recentSessions: PortalUsageSession[]
  recentPayments: PortalPayment[]
  recentVoucherRedemptions: PortalVoucherRedemption[]
}

export type PortalLoginResponse = {
  accessToken: string
  session: PortalCustomerSession
}

export type PortalRedeemVoucherResponse = {
  voucher: {
    id: string
    code: string
    status: string
    tenantId: string
  }
  redemption: {
    id: string
    tenantId: string
    customerReference?: string | null
    createdAt: string
    package: {
      id: string
      name: string
      code: string
    }
    hotspot?: {
      id: string
      name: string
    } | null
    voucher: {
      id: string
      code: string
    }
  }
  activation?: PortalActivation | null
  companionVoucherCodes?: string[]
  accessToken?: string | null
  session?: PortalCustomerSession | null
  reconnect?: {
    loginUrl?: string | null
    username?: string | null
    password?: string | null
    method: string
  } | null
}
