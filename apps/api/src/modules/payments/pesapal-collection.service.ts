import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentMethod, PaymentProvider } from '@prisma/client'
import {
  CollectPaymentInput,
  PaymentCollectionProvider,
  PaymentProviderResult,
  ProviderWebhookResult,
} from './payment-provider.interface'

@Injectable()
export class PesapalCollectionService implements PaymentCollectionProvider {
  readonly provider = PaymentProvider.PESAPAL
  private token?: { value: string; expiresAt: number }

  constructor(private readonly configService: ConfigService) {}

  async createAccessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.value
    }

    const response = await fetch(`${this.baseUrl()}/api/Auth/RequestToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        consumer_key: this.required('PESAPAL_CONSUMER_KEY'),
        consumer_secret: this.required('PESAPAL_CONSUMER_SECRET'),
      }),
    })

    const text = await response.text()
    const body = this.parseJson(text)
    if (!response.ok) {
      throw new ServiceUnavailableException(
        this.sanitizeErrorMessage(this.readError(body) ?? text, response.status),
      )
    }

    const token = this.readString(body, ['token', 'access_token'])
    if (!token) {
      throw new ServiceUnavailableException('Pesapal auth response did not contain an access token')
    }

    const expiresIn = Number(this.readString(body, ['expires_in']) ?? 300)
    this.token = { value: token, expiresAt: Date.now() + expiresIn * 1000 }
    return token
  }

  async collectPayment(input: CollectPaymentInput): Promise<PaymentProviderResult> {
    const token = await this.createAccessToken()
    const isCard = input.method === PaymentMethod.CARD
    const emailAddress = input.emailAddress?.trim().toLowerCase()

    if (isCard && !emailAddress) {
      throw new ServiceUnavailableException('Customer email is required for Pesapal card checkout')
    }

    const payload = {
      id: input.externalReference,
      currency: input.currency || 'UGX',
      amount: input.amountUgx,
      description: input.narrative,
      callback_url: input.returnUrl ?? this.returnUrl(input.externalReference),
      notification_id: this.required('PESAPAL_IPN_ID'),
      billing_address: {
        phone_number: input.phoneNumber,
        country_code: 'UG',
        email_address: emailAddress || `${input.externalReference.toLowerCase()}@payments.arofi.net`,
        first_name: input.payerName || input.customerReference || 'AROFi',
        last_name: 'Customer',
      },
    }

    const response = await fetch(`${this.baseUrl()}/api/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    const text = await response.text()
    const body = this.parseJson(text)
    if (!response.ok) {
      throw new ServiceUnavailableException(
        this.sanitizeErrorMessage(this.readError(body) ?? text, response.status),
      )
    }

    const orderTrackingId = this.readString(body, ['order_tracking_id', 'orderTrackingId'])
    const checkoutUrl = this.readString(body, ['redirect_url', 'checkout_url', 'checkoutUrl'])
    const merchantReference =
      this.readString(body, ['merchant_reference', 'merchantReference']) ?? input.externalReference

    return {
      status: 'OK',
      statusCode: 1,
      transactionStatus: 'PENDING',
      transactionReference: orderTrackingId,
      checkoutUrl,
      orderTrackingId,
      merchantReference,
      statusMessage: isCard
        ? 'Pesapal checkout ready. Choose Visa or Mastercard on the secure payment page.'
        : 'Pesapal checkout ready. Complete payment to activate internet.',
      amount: input.amountUgx.toString(),
      currencyCode: input.currency || 'UGX',
      rawRequest: JSON.stringify(payload),
      rawResponse: text,
    }
  }

  async getPaymentStatus(referenceId: string): Promise<PaymentProviderResult> {
    const token = await this.createAccessToken()
    const query = new URLSearchParams({ orderTrackingId: referenceId })
    const url = `${this.baseUrl()}/api/Transactions/GetTransactionStatus?${query.toString()}`
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    const text = await response.text()
    const body = this.parseJson(text)
    if (!response.ok) {
      throw new ServiceUnavailableException(
        this.sanitizeErrorMessage(this.readError(body) ?? text, response.status),
      )
    }

    const rawStatus = (
      this.readString(body, ['payment_status_description', 'payment_status', 'status']) ?? 'PENDING'
    ).toUpperCase()
    const transactionStatus =
      rawStatus === 'COMPLETED' || rawStatus === 'PAID'
        ? 'SUCCESSFUL'
        : rawStatus === 'FAILED' || rawStatus === 'INVALID'
          ? 'FAILED'
          : rawStatus

    return {
      status: 'OK',
      statusCode: transactionStatus === 'SUCCESSFUL' ? 0 : 1,
      transactionStatus,
      transactionReference: referenceId,
      orderTrackingId: referenceId,
      statusMessage:
        this.readString(body, ['description', 'message']) ?? `Pesapal status ${rawStatus}`,
      amount: this.readString(body, ['amount']),
      currencyCode: this.readString(body, ['currency', 'currency_code']),
      rawRequest: url,
      rawResponse: text,
    }
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<ProviderWebhookResult> {
    const providerReference = this.readString(payload, [
      'order_tracking_id',
      'OrderTrackingId',
      'transactionReference',
    ])
    const externalReference = this.readString(payload, [
      'merchant_reference',
      'MerchantReference',
      'externalReference',
    ])
    return {
      externalReference,
      providerReference,
      result: {
        status: 'OK',
        statusCode: 1,
        transactionStatus:
          this.readString(payload, ['payment_status_description', 'status']) ?? 'PENDING',
        transactionReference: providerReference,
        orderTrackingId: providerReference,
        rawRequest: '',
        rawResponse: JSON.stringify(payload),
      },
    }
  }

  private baseUrl() {
    const configured = this.configService.get<string>('PESAPAL_BASE_URL')?.trim()
    if (configured) {
      return configured.replace(/\/api\/Auth\/RequestToken\/?$/i, '').replace(/\/$/, '')
    }

    return 'https://cybqa.pesapal.com/pesapalv3'
  }

  private returnUrl(externalReference: string) {
    const configured = this.configService.get<string>('PESAPAL_CALLBACK_URL')?.trim()
    if (!configured) {
      return this.configService.get<string>('PORTAL_BASE_URL') ?? 'https://arofi.net/portal'
    }

    try {
      const url = new URL(configured)
      url.searchParams.set('externalReference', externalReference)
      return url.toString()
    } catch {
      return configured
    }
  }

  private required(key: string) {
    const value = this.configService.get<string>(key)?.trim()
    if (!value || value.startsWith('CHANGE_ME') || value.startsWith('replace_with')) {
      throw new ServiceUnavailableException(`${key} is not configured`)
    }
    return value
  }

  private parseJson(text: string) {
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  private readString(source: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = source[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
      if (typeof value === 'number') {
        return value.toString()
      }
    }
    return undefined
  }

  private sanitizeErrorMessage(raw: string, httpStatus?: number): string {
    if (httpStatus === 401)
      return 'Payment gateway authentication failed. Check PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET.'
    if (httpStatus === 403)
      return 'Payment gateway access denied. The Pesapal account may lack required permissions.'
    if (httpStatus === 429)
      return 'Payment gateway rate limit exceeded. Please try again in a moment.'
    if (httpStatus && httpStatus >= 500)
      return 'Payment gateway is temporarily unavailable. Please try again.'
    const stripped = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return stripped.length > 200
      ? `${stripped.slice(0, 200)}…`
      : stripped || 'Payment gateway error'
  }

  private readError(source: Record<string, unknown>) {
    return this.readString(source, ['message', 'errorMessage', 'error'])
  }
}
