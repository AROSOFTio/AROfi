export type PortalContextResponse = {
  tenant: {
    id: string
    name: string
    domain?: string | null
  }
  packages: PortalPackage[]
  activeActivation?: PortalActivation | null
  latestPayment?: PortalPayment | null
}

export type PortalPackage = {
  id: string
  name: string
  code: string
  description?: string | null
  durationMinutes: number
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
  network: string
  amountUgx: number
  phoneNumber: string
  customerReference?: string | null
  externalReference: string
  providerReference?: string | null
  providerStatus?: string | null
  statusMessage?: string | null
  createdAt: string
  completedAt?: string | null
  package: {
    id: string
    name: string
    code: string
    durationMinutes: number
  }
  activation?: PortalActivation | null
}

export type VoucherRedemptionResponse = {
  voucher: {
    id: string
    code: string
    status: string
  }
  redemption: {
    id: string
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
  }
}
