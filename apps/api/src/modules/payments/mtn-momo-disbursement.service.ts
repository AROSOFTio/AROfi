import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentProvider } from '@prisma/client'
import { randomUUID } from 'crypto'
import {
  PaymentDisbursementProvider,
  PaymentProviderResult,
  ProviderWebhookResult,
  SendMoneyInput,
} from './payment-provider.interface'

@Injectable()
export class MtnMomoDisbursementService implements PaymentDisbursementProvider {
  readonly provider = PaymentProvider.MTN_MOMO_DIRECT
  private token?: { value: string; expiresAt: number }

  constructor(private readonly configService: ConfigService) {}

  async createAccessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value
    const response = await fetch(`${this.baseUrl()}/disbursement/token/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.required('MTN_MOMO_DISBURSEMENT_API_USER')}:${this.required('MTN_MOMO_DISBURSEMENT_API_KEY')}`).toString('base64')}`,
        'Ocp-Apim-Subscription-Key': this.required('MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY'),
      },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || typeof body.access_token !== 'string') {
      throw new ServiceUnavailableException('MTN MoMo disbursement token request failed')
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 }
    return body.access_token
  }

  async sendMoney(input: SendMoneyInput): Promise<PaymentProviderResult> {
    const referenceId = randomUUID()
    const token = await this.createAccessToken()
    const body = {
      amount: input.amountUgx.toString(),
      currency: input.currency,
      externalId: input.externalReference,
      payee: { partyIdType: 'MSISDN', partyId: input.phoneNumber },
      payerMessage: input.narrative,
      payeeNote: 'AROfi payout',
    }
    const response = await fetch(`${this.baseUrl()}/disbursement/v1_0/transfer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': this.targetEnvironment(),
        'Ocp-Apim-Subscription-Key': this.required('MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    if (response.status !== 202) {
      throw new ServiceUnavailableException(`MTN MoMo disbursement request failed: ${text}`)
    }
    return { status: 'OK', statusCode: 1, transactionStatus: 'PENDING', transactionReference: referenceId, rawRequest: JSON.stringify(body), rawResponse: text || '{}' }
  }

  async getDisbursementStatus(referenceId: string): Promise<PaymentProviderResult> {
    const token = await this.createAccessToken()
    const response = await fetch(`${this.baseUrl()}/disbursement/v1_0/transfer/${referenceId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': this.targetEnvironment(),
        'Ocp-Apim-Subscription-Key': this.required('MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY'),
      },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new ServiceUnavailableException('MTN MoMo disbursement status check failed')
    return { status: 'OK', statusCode: body.status === 'SUCCESSFUL' ? 0 : 1, transactionStatus: body.status ?? 'PENDING', transactionReference: referenceId, rawRequest: referenceId, rawResponse: JSON.stringify(body) }
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<ProviderWebhookResult> {
    const providerReference = String(payload.referenceId ?? payload.financialTransactionId ?? '')
    return { providerReference, result: { status: 'OK', statusCode: 1, transactionStatus: String(payload.status ?? 'PENDING'), transactionReference: providerReference, rawRequest: '', rawResponse: JSON.stringify(payload) } }
  }

  private baseUrl() {
    return this.configService.get<string>('MTN_MOMO_DISBURSEMENT_BASE_URL') ?? 'https://sandbox.momodeveloper.mtn.com'
  }

  private targetEnvironment() {
    return this.configService.get<string>('MTN_MOMO_TARGET_ENVIRONMENT') ?? 'sandbox'
  }

  private required(key: string) {
    const value = this.configService.get<string>(key)
    if (!value) throw new ServiceUnavailableException(`${key} is not configured`)
    return value
  }
}
