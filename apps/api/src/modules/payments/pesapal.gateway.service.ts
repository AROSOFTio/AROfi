import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentMethod, PaymentNetwork } from '@prisma/client'
import { randomUUID } from 'crypto'

type PesapalCheckoutRequest = {
  amountUgx: number
  phoneNumber: string
  externalReference: string
  narrative: string
  customerReference?: string
  method?: PaymentMethod
  network?: PaymentNetwork
  callbackUrl?: string
}

type PesapalStatusRequest = {
  orderTrackingId?: string | null
  externalReference?: string | null
}

export type PesapalGatewayResponse = {
  status: string
  statusCode: number
  transactionStatus?: string
  transactionReference?: string
  statusMessage?: string
  errorMessage?: string
  paymentMethod?: string
  amount?: string
  currencyCode?: string
  checkoutUrl?: string
  orderTrackingId?: string
  merchantReference?: string
  rawRequest: string
  rawResponse: string
}

@Injectable()
export class PesapalGatewayService {
  private readonly logger = new Logger(PesapalGatewayService.name)

  constructor(private readonly configService: ConfigService) {}

  async initiateCheckout(request: PesapalCheckoutRequest): Promise<PesapalGatewayResponse> {
    if (this.isMockMode()) {
      return this.mockCheckoutResponse(request)
    }

    const token = await this.requestToken()
    const callbackUrl = this.resolveCallbackUrl(request.externalReference)
    const payload = {
      id: request.externalReference,
      currency: 'UGX',
      amount: request.amountUgx,
      description: request.narrative,
      callback_url: request.callbackUrl ?? callbackUrl,
      notification_id: this.configService.get<string>('PESAPAL_IPN_ID') ?? undefined,
      billing_address: {
        email_address: this.resolveEmailHint(request.customerReference),
        phone_number: request.phoneNumber,
        country_code: 'UG',
        first_name: request.customerReference ?? 'Portal',
        last_name: 'Customer',
      },
      payment_method: request.method === PaymentMethod.CARD ? 'CARD' : 'MOBILE_MONEY',
      mobile_money_network:
        request.network && request.network !== PaymentNetwork.UNKNOWN ? request.network : undefined,
    }

    const url = `${this.getBaseUrl()}/api/Transactions/SubmitOrderRequest`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    const body = this.parseJsonObject(text)

    if (!response.ok) {
      const message = (body?.error?.message as string) ?? (body?.message as string) ?? text
      throw new ServiceUnavailableException(`Pesapal checkout request failed: ${message}`)
    }

    const statusCode = this.readNumber(body, ['status_code', 'statusCode']) ?? 200
    const checkoutUrl = this.readString(body, ['redirect_url', 'checkout_url'])
    const orderTrackingId = this.readString(body, ['order_tracking_id', 'orderTrackingId'])
    const merchantReference = this.readString(body, ['merchant_reference', 'merchantReference']) ?? request.externalReference

    return {
      status: statusCode < 400 ? 'OK' : 'ERROR',
      statusCode,
      transactionStatus: 'PENDING',
      transactionReference: orderTrackingId,
      statusMessage: this.readString(body, ['message']) ?? 'Pesapal checkout initialized',
      checkoutUrl,
      orderTrackingId,
      merchantReference,
      rawRequest: JSON.stringify(payload),
      rawResponse: text,
    }
  }

  async checkTransactionStatus(request: PesapalStatusRequest): Promise<PesapalGatewayResponse> {
    if (this.isMockMode()) {
      return this.mockStatusResponse(request)
    }

    const trackingId = request.orderTrackingId
    if (!trackingId) {
      throw new ServiceUnavailableException('Pesapal order tracking id is required for status checks')
    }

    const token = await this.requestToken()
    const query = new URLSearchParams({
      orderTrackingId: trackingId,
    })
    if (request.externalReference) {
      query.set('merchantReference', request.externalReference)
    }

    const url = `${this.getBaseUrl()}/api/Transactions/GetTransactionStatus?${query.toString()}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    const text = await response.text()
    const body = this.parseJsonObject(text)

    if (!response.ok) {
      const message = (body?.error?.message as string) ?? (body?.message as string) ?? text
      throw new ServiceUnavailableException(`Pesapal status check failed: ${message}`)
    }

    const statusCode = this.readNumber(body, ['status_code', 'statusCode']) ?? 200
    const paymentStatus = (
      this.readString(body, ['payment_status_description', 'payment_status', 'status']) ?? 'PENDING'
    ).toUpperCase()
    const mappedStatus =
      paymentStatus === 'COMPLETED' || paymentStatus === 'PAID'
        ? 'SUCCEEDED'
        : paymentStatus === 'FAILED' || paymentStatus === 'INVALID'
          ? 'FAILED'
          : 'PENDING'

    return {
      status: statusCode < 400 ? 'OK' : 'ERROR',
      statusCode,
      transactionStatus: mappedStatus,
      transactionReference: trackingId,
      statusMessage: this.readString(body, ['description', 'message']) ?? `Pesapal status ${paymentStatus}`,
      paymentMethod: this.readString(body, ['payment_method', 'paymentMethod']),
      amount: this.readString(body, ['amount']),
      currencyCode: this.readString(body, ['currency']),
      orderTrackingId: trackingId,
      rawRequest: url,
      rawResponse: text,
    }
  }

  private isMockMode() {
    return (this.configService.get<string>('PESAPAL_MODE') ?? 'live').toLowerCase() === 'mock'
  }

  private getBaseUrl() {
    const explicit = this.configService.get<string>('PESAPAL_BASE_URL')
    if (explicit) {
      return explicit
    }

    const mode = (this.configService.get<string>('PESAPAL_MODE') ?? 'live').toLowerCase()
    if (mode === 'sandbox') {
      return 'https://cybqa.pesapal.com/pesapalv3'
    }

    return 'https://pay.pesapal.com/v3'
  }

  private async requestToken() {
    const consumerKey = this.configService.get<string>('PESAPAL_CONSUMER_KEY')
    const consumerSecret = this.configService.get<string>('PESAPAL_CONSUMER_SECRET')

    if (!consumerKey || !consumerSecret) {
      throw new ServiceUnavailableException('PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET must be configured')
    }

    const url = `${this.getBaseUrl()}/api/Auth/RequestToken`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
    })

    const text = await response.text()
    const body = this.parseJsonObject(text)

    if (!response.ok) {
      const message = (body?.error?.message as string) ?? text
      throw new ServiceUnavailableException(`Pesapal auth failed: ${message}`)
    }

    const token = this.readString(body, ['token', 'access_token'])
    if (!token) {
      throw new ServiceUnavailableException('Pesapal auth response did not contain an access token')
    }

    return token
  }

  private resolveCallbackUrl(externalReference: string) {
    const configured = this.configService.get<string>('PESAPAL_CALLBACK_URL')
    if (!configured) {
      return undefined
    }

    try {
      const url = new URL(configured)
      url.searchParams.set('externalReference', externalReference)
      return url.toString()
    } catch {
      return undefined
    }
  }

  private resolveEmailHint(customerReference?: string) {
    const normalized = (customerReference ?? 'portal-customer').trim().toLowerCase().replace(/[^a-z0-9]+/g, '.')
    return `${normalized.slice(0, 24) || 'portal'}.customer@arofi.local`
  }

  private parseJsonObject(value: string) {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      this.logger.warn('Unable to parse Pesapal JSON response body')
      return undefined
    }
  }

  private readString(source: Record<string, unknown> | undefined, keys: string[]) {
    if (!source) {
      return undefined
    }

    for (const key of keys) {
      const value = source[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim()
      }
    }

    return undefined
  }

  private readNumber(source: Record<string, unknown> | undefined, keys: string[]) {
    if (!source) {
      return undefined
    }

    for (const key of keys) {
      const value = source[key]
      if (typeof value === 'number') {
        return value
      }

      if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10)
        if (!Number.isNaN(parsed)) {
          return parsed
        }
      }
    }

    return undefined
  }

  private mockCheckoutResponse(request: PesapalCheckoutRequest): PesapalGatewayResponse {
    const trackingId = `PES-MOCK-${randomUUID().slice(0, 10).toUpperCase()}`
    return {
      status: 'OK',
      statusCode: 200,
      transactionStatus: 'PENDING',
      transactionReference: trackingId,
      statusMessage: 'Mock Pesapal checkout initialized',
      checkoutUrl: `https://mock.pesapal.local/checkout/${trackingId}`,
      orderTrackingId: trackingId,
      merchantReference: request.externalReference,
      rawRequest: JSON.stringify(request),
      rawResponse: '{"mock":true}',
    }
  }

  private mockStatusResponse(request: PesapalStatusRequest): PesapalGatewayResponse {
    const trackingId = request.orderTrackingId ?? `PES-MOCK-${randomUUID().slice(0, 10).toUpperCase()}`
    return {
      status: 'OK',
      statusCode: 200,
      transactionStatus: 'SUCCEEDED',
      transactionReference: trackingId,
      statusMessage: 'Mock Pesapal payment completed',
      orderTrackingId: trackingId,
      rawRequest: JSON.stringify(request),
      rawResponse: '{"mock":true}',
    }
  }
}
