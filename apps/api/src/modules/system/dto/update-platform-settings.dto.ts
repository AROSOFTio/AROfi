import { PaymentNetwork, PaymentProvider, PlatformPaymentGateway } from '@prisma/client'
import { IsOptional, IsNumber, IsBoolean, IsString, IsArray, IsEnum, IsPhoneNumber } from 'class-validator'
import { Type } from 'class-transformer'

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mobileMoneyFeePercent?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  voucherFeePercent?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proMobileMoneyFeePercent?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proVoucherFeePercent?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proSubscriptionPriceUgx?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proSubscriptionDurationDays?: number

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  proPlanEnabled?: boolean

  @IsOptional()
  @IsString()
  proRenewalRule?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proGracePeriodDays?: number

  @IsOptional()
  @IsString()
  subscriptionExpiryNotificationDays?: string

  @IsOptional()
  @IsString()
  freePlanDescription?: string

  @IsOptional()
  @IsString()
  proPlanDescription?: string

  @IsOptional()
  @IsString()
  freePlanBenefits?: string

  @IsOptional()
  @IsString()
  proPlanBenefits?: string

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  referralProgramEnabled?: boolean

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  resellerRegistrationEnabled?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referralCommissionPercent?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referralHoldingPeriodDays?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  enterpriseMobileMoneyFeePercent?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  enterpriseVoucherFeePercent?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  freeRouterLimit?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proRouterLimit?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  enterpriseRouterLimit?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  freeAnalyticsHistoryDays?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proAnalyticsHistoryDays?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  enterpriseAnalyticsHistoryDays?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minimumWithdrawalUgx?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  withdrawalFeePercent?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  withdrawalFlatFeeUgx?: number

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireWithdrawalApproval?: boolean

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  instantWithdrawalsEnabled?: boolean

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireApprovalForFirstWithdrawal?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  requireApprovalAboveAmountUgx?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  failedSecretAttemptsBeforeLock?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  withdrawalLockMinutes?: number

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  payoutNumberChangeRequiresApproval?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPayoutNumbers?: number

  @IsOptional()
  @IsArray()
  @IsEnum(PaymentNetwork, { each: true })
  allowedPaymentNetworks?: PaymentNetwork[]

  @IsOptional()
  @IsEnum(PlatformPaymentGateway)
  paymentGateway?: PlatformPaymentGateway

  // Deprecated per-network fields remain temporarily accepted for backwards
  // compatibility with older clients. The admin console now writes only the
  // single paymentGateway field.
  @IsOptional()
  @IsEnum(PaymentProvider)
  mtnCollectionProvider?: PaymentProvider

  @IsOptional()
  @IsEnum(PaymentProvider)
  airtelCollectionProvider?: PaymentProvider

  @IsOptional()
  @IsEnum(PaymentProvider)
  mtnDisbursementProvider?: PaymentProvider

  @IsOptional()
  @IsEnum(PaymentProvider)
  airtelDisbursementProvider?: PaymentProvider

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  routerAutoConnectEnabled?: boolean

  @IsOptional()
  @IsString()
  captivePortalFallbackMessage?: string

  @IsOptional()
  @IsString()
  @IsPhoneNumber()
  supportPhone?: string

  @IsOptional()
  @IsString()
  supportEmail?: string

  @IsOptional()
  @IsString()
  supportUrl?: string

  @IsOptional()
  @IsString()
  publicDefaultAccentTheme?: string

  @IsOptional()
  @IsString()
  voucherTemplateDefaultStyle?: string

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  auditLoggingEnabled?: boolean
}
