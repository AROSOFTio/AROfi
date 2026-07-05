import { IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString } from 'class-validator'

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsNumber()
  tenantMobileMoneyFeePercent?: number | null

  @IsOptional()
  @IsNumber()
  tenantVoucherFeePercent?: number | null

  @IsOptional()
  @IsString()
  businessName?: string

  @IsOptional()
  @IsString()
  supportPhone?: string

  @IsOptional()
  @IsString()
  supportEmail?: string

  @IsOptional()
  @IsString()
  logoUrl?: string

  @IsOptional()
  @IsString()
  brandColor?: string

  @IsOptional()
  @IsString()
  portalTemplate?: string

  @IsOptional()
  @IsBoolean()
  routerAutoConnectEnabled?: boolean | null

  @IsOptional()
  @IsObject()
  routerOnboardingPreferences?: Record<string, unknown>

  @IsOptional()
  @IsString()
  voucherPrintDefaultTemplate?: string

  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean

  @IsOptional()
  @IsBoolean()
  kycCompleted?: boolean

  @IsOptional()
  @IsBoolean()
  accountActive?: boolean

  @IsOptional()
  @IsBoolean()
  fraudHold?: boolean

  @IsOptional()
  @IsBoolean()
  redeemableWhenGenerated?: boolean

  @IsOptional()
  @IsBoolean()
  allowDeviceReset?: boolean

  @IsOptional()
  @IsInt()
  maxResetsPerActivation?: number

  @IsOptional()
  @IsBoolean()
  allowUnboundCaptiveAccess?: boolean

  @IsOptional()
  @IsBoolean()
  antiTetheringRuleEnabled?: boolean

  @IsOptional()
  @IsString()
  supportText?: string
}
