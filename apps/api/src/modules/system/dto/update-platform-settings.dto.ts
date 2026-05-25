import { PaymentNetwork, PaymentProvider } from '@prisma/client'

export class UpdatePlatformSettingsDto {
  mobileMoneyFeePercent?: number
  voucherFeePercent?: number
  minimumWithdrawalUgx?: number
  withdrawalFeePercent?: number
  withdrawalFlatFeeUgx?: number
  requireWithdrawalApproval?: boolean
  instantWithdrawalsEnabled?: boolean
  requireApprovalForFirstWithdrawal?: boolean
  requireApprovalAboveAmountUgx?: number | null
  failedSecretAttemptsBeforeLock?: number
  withdrawalLockMinutes?: number
  payoutNumberChangeRequiresApproval?: boolean
  maxPayoutNumbers?: number
  allowedPaymentNetworks?: PaymentNetwork[]
  mtnCollectionProvider?: PaymentProvider
  airtelCollectionProvider?: PaymentProvider
  mtnDisbursementProvider?: PaymentProvider
  airtelDisbursementProvider?: PaymentProvider
  routerAutoConnectEnabled?: boolean
  captivePortalFallbackMessage?: string
  supportPhone?: string
  supportEmail?: string
  supportUrl?: string
  voucherTemplateDefaultStyle?: string
  auditLoggingEnabled?: boolean
}
