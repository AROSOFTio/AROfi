import { PaymentNetwork, PaymentProvider, PaymentStatus } from '@prisma/client'

export type PaymentProviderResult = {
  status: string
  statusCode: number
  transactionStatus?: string
  transactionReference?: string
  checkoutUrl?: string
  orderTrackingId?: string
  merchantReference?: string
  mnoTransactionReferenceId?: string
  issuedReceiptNumber?: string
  statusMessage?: string
  errorMessageCode?: string
  errorMessage?: string
  amount?: string
  currencyCode?: string
  transactionInitiationDate?: string
  transactionCompletionDate?: string
  payerName?: string
  rawRequest: string
  rawResponse: string
}

export type CollectPaymentInput = {
  amountUgx: number
  currency: string
  phoneNumber: string
  externalReference: string
  customerReference?: string
  narrative: string
  network: PaymentNetwork
  returnUrl?: string
}

export type SendMoneyInput = {
  amountUgx: number
  currency: string
  phoneNumber: string
  externalReference: string
  narrative: string
  network: PaymentNetwork
}

export type ProviderWebhookResult = {
  externalReference?: string
  providerReference?: string
  result: PaymentProviderResult
}

export interface PaymentCollectionProvider {
  readonly provider: PaymentProvider
  createAccessToken(): Promise<string>
  collectPayment(input: CollectPaymentInput): Promise<PaymentProviderResult>
  getPaymentStatus(referenceId: string): Promise<PaymentProviderResult>
  handleWebhook(payload: Record<string, unknown>): Promise<ProviderWebhookResult>
}

export interface PaymentDisbursementProvider {
  readonly provider: PaymentProvider
  createAccessToken(): Promise<string>
  sendMoney(input: SendMoneyInput): Promise<PaymentProviderResult>
  getDisbursementStatus(referenceId: string): Promise<PaymentProviderResult>
  handleWebhook(payload: Record<string, unknown>): Promise<ProviderWebhookResult>
}

export function mapRawStatusToPaymentStatus(status?: string) {
  const normalized = (status ?? '').toUpperCase()
  if (['SUCCESSFUL', 'SUCCEEDED', 'PAID', 'COMPLETED', 'SUCCESS'].includes(normalized)) {
    return PaymentStatus.COMPLETED
  }
  if (['FAILED', 'REJECTED', 'TIMEOUT', 'DECLINED'].includes(normalized)) {
    return PaymentStatus.FAILED
  }
  if (['CANCELLED', 'CANCELED'].includes(normalized)) {
    return PaymentStatus.CANCELLED
  }
  if (normalized === 'EXPIRED') {
    return PaymentStatus.EXPIRED
  }
  if (['PENDING', 'PROCESSING', 'INITIATED'].includes(normalized)) {
    return PaymentStatus.PENDING
  }
  return PaymentStatus.PENDING
}
