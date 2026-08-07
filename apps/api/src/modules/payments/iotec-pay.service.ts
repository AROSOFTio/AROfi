import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentMethod, PaymentProvider } from '@prisma/client'
import {
  CollectPaymentInput,
  PaymentCollectionProvider,
  PaymentDisbursementProvider,
  PaymentProviderResult,
  ProviderWebhookResult,
  SendMoneyInput,
} from './payment-provider.interface'

type IotecTokenResponse = {
  access_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

type IotecTransaction = {
  id?: string
  status?: string
  statusCode?: string | null
  statusMessage?: string | null
  externalId?: string | null
  vendorTransactionId?: string | null
  amount?: number
  currency?: string
  payer?: string | null
  payerName?: string | null
  payee?: string | null
  payeeName?: string | null
  createdAt?: string
  processedAt?: string | null
  cardRedirectUrl?: string | null
  redirectUrl?: string | null
  message?: string | null
  code?: string | null
  [key: string]: unknown
}

@Injectable()
export class IotecPayService implements PaymentCollectionProvider, PaymentDisbursementProvider {
  readonly provider = PaymentProvider.IOTEC_PAY
  private readonly logger = new Logger(IotecPayService.name)
  private tokenCache?: { token: string; expiresAt: number }

  constructor(private readonly configService: ConfigService) {}

  async createAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 15_000) {
      return this.tokenCache.token
    }

    const body = new URLSearchParams({
      client_id: this.required('IOTEC_CLIENT_ID'),
      client_secret: this.required('IOTEC_CLIENT_SECRET'),
      grant_type: 'client_credentials',
    })

    const response = await fetch(`${this.identityBaseUrl()}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const raw = await response.text()
    const parsed = this.parseJson<IotecTokenResponse>(raw)

    if (!response.ok || !parsed.access_token) {
      throw new ServiceUnavailableException(
        parsed.error_description || parsed.error || `ioTec authorization failed with HTTP ${response.status}`,
      )
    }

    const expiresIn = Math.max(30, Number(parsed.expires_in ?? 300))
    this.tokenCache = {
      token: parsed.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    }
    return parsed.access_token
  }

  async collectPayment(input: CollectPaymentInput): Promise<PaymentProviderResult> {
    const method = input.method ?? PaymentMethod.MOBILE_MONEY
    const isCard = method === PaymentMethod.CARD

    if (isCard && !input.emailAddress?.trim()) {
      throw new BadRequestException('Customer email is required for ioTec card payment')
    }
    if (isCard && input.amountUgx < 500) {
      throw new BadRequestException('ioTec card payments must be at least UGX 500')
    }

    const request = {
      category: 'MobileMoney',
      currency: 'UGX',
      walletId: this.required('IOTEC_WALLET_ID'),
      externalId: input.externalReference,
      payer: isCard ? input.emailAddress!.trim().toLowerCase() : this.normalizePhone(input.phoneNumber),
      payerName: input.payerName || input.customerReference || undefined,
      payerNote: input.narrative,
      amount: input.amountUgx,
      payeeNote: input.narrative,
      channel: 'AROFI',
      transactionChargesCategory: 'ChargeWallet',
      redirectUrl: input.returnUrl,
    }

    return this.requestTransaction(
      isCard ? '/api/collections/collect/card' : '/api/collections/collect',
      request,
      input.externalReference,
      isCard
        ? 'Card checkout created. Continue to the secure Visa/Mastercard page.'
        : 'Payment request sent. Enter your Mobile Money PIN to approve.',
    )
  }

  async getPaymentStatus(referenceId: string): Promise<PaymentProviderResult> {
    return this.getTransaction(`/api/collections/status/${encodeURIComponent(referenceId)}`, referenceId)
  }

  async sendMoney(input: SendMoneyInput): Promise<PaymentProviderResult> {
    if (input.amountUgx < 500) {
      throw new BadRequestException('ioTec disbursements must be at least UGX 500')
    }

    const request = {
      category: 'MobileMoney',
      currency: 'UGX',
      walletId: this.required('IOTEC_WALLET_ID'),
      externalId: input.externalReference,
      payee: this.normalizePhone(input.phoneNumber),
      amount: input.amountUgx,
      payerNote: input.narrative,
      payeeNote: input.narrative,
      channel: 'AROFI',
    }

    return this.requestTransaction(
      '/api/disbursements/disburse',
      request,
      input.externalReference,
      'Disbursement request submitted to ioTec Pay.',
    )
  }

  async getDisbursementStatus(referenceId: string): Promise<PaymentProviderResult> {
    return this.getTransaction(`/api/disbursements/external-id/${encodeURIComponent(referenceId)}`, referenceId)
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<ProviderWebhookResult> {
    const transaction = payload as IotecTransaction
    const externalReference = this.stringValue(transaction.externalId)
    const providerReference = this.stringValue(transaction.id || transaction.vendorTransactionId)

    return {
      externalReference: externalReference || undefined,
      providerReference: providerReference || undefined,
      result: this.mapResult(transaction, '', JSON.stringify(payload)),
    }
  }

  private async requestTransaction(
    path: string,
    request: Record<string, unknown>,
    externalReference: string,
    pendingMessage: string,
  ) {
    try {
      const token = await this.createAccessToken()
      const rawRequest = JSON.stringify(request)
      const response = await fetch(`${this.payBaseUrl()}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: rawRequest,
      })
      const rawResponse = await response.text()
      const transaction = this.parseJson<IotecTransaction>(rawResponse)

      if (!response.ok) {
        throw new ServiceUnavailableException(
          transaction.statusMessage ||
            transaction.message ||
            transaction.code ||
            `ioTec Pay request failed with HTTP ${response.status}`,
        )
      }

      const result = this.mapResult(transaction, rawRequest, rawResponse)
      return {
        ...result,
        transactionReference: result.transactionReference || transaction.id || externalReference,
        merchantReference: transaction.externalId || externalReference,
        statusMessage: result.statusMessage || pendingMessage,
      }
    } catch (error) {
      this.logger.error(
        `ioTec Pay request failed for ${externalReference}`,
        error instanceof Error ? error.stack : undefined,
      )
      throw error instanceof BadRequestException || error instanceof ServiceUnavailableException
        ? error
        : new ServiceUnavailableException(
            error instanceof Error ? error.message : 'Unable to contact ioTec Pay',
          )
    }
  }

  private async getTransaction(path: string, referenceId: string) {
    try {
      const token = await this.createAccessToken()
      const response = await fetch(`${this.payBaseUrl()}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const rawResponse = await response.text()
      const transaction = this.parseJson<IotecTransaction>(rawResponse)
      if (!response.ok) {
        throw new ServiceUnavailableException(
          transaction.statusMessage ||
            transaction.message ||
            transaction.code ||
            `ioTec Pay status request failed with HTTP ${response.status}`,
        )
      }
      return this.mapResult(transaction, referenceId, rawResponse)
    } catch (error) {
      this.logger.error(
        `ioTec Pay status request failed for ${referenceId}`,
        error instanceof Error ? error.stack : undefined,
      )
      throw error instanceof ServiceUnavailableException
        ? error
        : new ServiceUnavailableException(
            error instanceof Error ? error.message : 'Unable to check ioTec Pay transaction status',
          )
    }
  }

  private mapResult(
    transaction: IotecTransaction,
    rawRequest: string,
    rawResponse: string,
  ): PaymentProviderResult {
    const transactionStatus = this.mapStatus(transaction.status)
    return {
      status: transactionStatus === 'FAILED' ? 'FAILED' : 'OK',
      statusCode: transactionStatus === 'COMPLETED' ? 0 : transactionStatus === 'FAILED' ? -1 : 1,
      transactionStatus,
      transactionReference:
        this.stringValue(transaction.id || transaction.vendorTransactionId) || undefined,
      merchantReference: this.stringValue(transaction.externalId) || undefined,
      mnoTransactionReferenceId: this.stringValue(transaction.vendorTransactionId) || undefined,
      statusMessage:
        this.stringValue(transaction.statusMessage || transaction.message || transaction.status) || undefined,
      errorMessageCode:
        transactionStatus === 'FAILED'
          ? this.stringValue(transaction.statusCode || transaction.code) || undefined
          : undefined,
      errorMessage:
        transactionStatus === 'FAILED'
          ? this.stringValue(transaction.statusMessage || transaction.message) || undefined
          : undefined,
      amount: transaction.amount == null ? undefined : String(transaction.amount),
      currencyCode: this.stringValue(transaction.currency) || undefined,
      transactionInitiationDate: this.stringValue(transaction.createdAt) || undefined,
      transactionCompletionDate: this.stringValue(transaction.processedAt) || undefined,
      payerName: this.stringValue(transaction.payerName || transaction.payeeName) || undefined,
      checkoutUrl:
        this.stringValue(transaction.cardRedirectUrl || transaction.redirectUrl) || undefined,
      rawRequest,
      rawResponse,
    }
  }

  private mapStatus(status?: string) {
    switch ((status ?? '').trim().toUpperCase()) {
      case 'SUCCESS':
      case 'SUCCESSFUL':
      case 'COMPLETED':
        return 'COMPLETED'
      case 'FAILED':
      case 'ROLLEDBACK':
      case 'CANCELLED':
      case 'REJECTED':
      case 'DECLINED':
        return 'FAILED'
      default:
        return 'PENDING'
    }
  }

  private normalizePhone(value: string) {
    return value.replace(/[^0-9]/g, '').replace(/^256/, '0')
  }

  private identityBaseUrl() {
    return (this.configService.get<string>('IOTEC_IDENTITY_BASE_URL') || 'https://id.iotec.io').replace(
      /\/$/,
      '',
    )
  }

  private payBaseUrl() {
    return (this.configService.get<string>('IOTEC_PAY_BASE_URL') || 'https://pay.iotec.io').replace(
      /\/$/,
      '',
    )
  }

  private required(key: string) {
    const value = this.configService.get<string>(key)?.trim()
    if (!value || value.startsWith('CHANGE_ME') || value.startsWith('replace_with')) {
      throw new ServiceUnavailableException(`ioTec Pay configuration ${key} is missing`)
    }
    return value
  }

  private parseJson<T>(value: string): T {
    try {
      return (value ? JSON.parse(value) : {}) as T
    } catch {
      throw new ServiceUnavailableException('ioTec Pay returned an invalid response')
    }
  }

  private stringValue(value: unknown) {
    return value == null ? '' : String(value).trim()
  }
}
