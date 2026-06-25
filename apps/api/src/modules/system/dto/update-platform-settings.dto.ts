import { PaymentNetwork, PaymentProvider } from '@prisma/client'
import { IsOptional, IsNumber, IsBoolean, IsString, IsArray, IsEnum } from 'class-validator'
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
  supportPhone?: string

  @IsOptional()
  @IsString()
  supportEmail?: string

  @IsOptional()
  @IsString()
  supportUrl?: string

  @IsOptional()
  @IsString()
  voucherTemplateDefaultStyle?: string

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  auditLoggingEnabled?: boolean
}
