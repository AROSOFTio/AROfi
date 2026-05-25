export class UpdateTenantSettingsDto {
  tenantMobileMoneyFeePercent?: number | null
  tenantVoucherFeePercent?: number | null
  businessName?: string
  supportPhone?: string
  supportEmail?: string
  logoUrl?: string
  brandColor?: string
  portalTemplate?: string
  routerAutoConnectEnabled?: boolean | null
  routerOnboardingPreferences?: Record<string, unknown>
  voucherPrintDefaultTemplate?: string
  termsAccepted?: boolean
  kycCompleted?: boolean
  accountActive?: boolean
  fraudHold?: boolean
  redeemableWhenGenerated?: boolean
  allowDeviceReset?: boolean
  maxResetsPerActivation?: number
  allowUnboundCaptiveAccess?: boolean
  antiTetheringRuleEnabled?: boolean
  supportText?: string
}
