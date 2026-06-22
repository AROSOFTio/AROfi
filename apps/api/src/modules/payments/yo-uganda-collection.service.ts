import { Injectable, ServiceUnavailableException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentProvider } from '@prisma/client'
import {
  CollectPaymentInput,
  PaymentCollectionProvider,
  PaymentProviderResult,
  ProviderWebhookResult,
} from './payment-provider.interface'

@Injectable()
export class YoUgandaCollectionService implements PaymentCollectionProvider {
  readonly provider = PaymentProvider.AGGREGATOR
  private readonly logger = new Logger(YoUgandaCollectionService.name)

  constructor(private readonly configService: ConfigService) {}

  async createAccessToken(): Promise<string> {
    // Yo Uganda uses Basic Auth credentials directly on each XML-RPC request.
    // No explicit OAuth access token flow is required.
    return 'basic_auth'
  }

  async collectPayment(input: CollectPaymentInput): Promise<PaymentProviderResult> {
    const username = this.required('YO_UGANDA_USERNAME')
    const password = this.required('YO_UGANDA_PASSWORD')
    const baseUrl = this.baseUrl()

    // Ensure phone number starts with 256 and has no '+'
    const cleanPhone = input.phoneNumber.replace(/^\+/, '')

    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<methodCall>
  <methodName>ac_deposit_non_blocking</methodName>
  <params>
    <param>
      <value>
        <struct>
          <member>
            <name>username</name>
            <value><string>${this.escapeXml(username)}</string></value>
          </member>
          <member>
            <name>password</name>
            <value><string>${this.escapeXml(password)}</string></value>
          </member>
          <member>
            <name>amount</name>
            <value><double>${input.amountUgx}</double></value>
          </member>
          <member>
            <name>phone</name>
            <value><string>${this.escapeXml(cleanPhone)}</string></value>
          </member>
          <member>
            <name>narrative</name>
            <value><string>${this.escapeXml(input.narrative || 'AROFi Hotspot')}</string></value>
          </member>
          <member>
            <name>reference</name>
            <value><string>${this.escapeXml(input.externalReference)}</string></value>
          </member>
        </struct>
      </value>
    </param>
  </params>
</methodCall>`

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'XML-RPC': 'true',
        },
        body: xmlPayload,
      })

      const responseXml = await response.text()
      if (!response.ok) {
        throw new ServiceUnavailableException(`Yo Uganda request failed with HTTP ${response.status}: ${responseXml}`)
      }

      const status = this.getXmlValue(responseXml, 'status')
      const transactionReference = this.getXmlValue(responseXml, 'transaction_reference')
      const statusMessage = this.getXmlValue(responseXml, 'status_message') || 'Payment request initiated.'

      if (status.toUpperCase() !== 'OK') {
        const faultString = this.getXmlValue(responseXml, 'faultString')
        const errorMessage = this.getXmlValue(responseXml, 'error_message') || this.getXmlValue(responseXml, 'status_message') || faultString || 'Unknown error'
        this.logger.error(`Yo Uganda API Error. Raw XML: ${responseXml}`)
        throw new ServiceUnavailableException(`Yo Uganda API error: ${errorMessage}`)
      }

      return {
        status: 'OK',
        statusCode: 1,
        transactionStatus: 'PENDING',
        transactionReference,
        statusMessage: 'Payment request sent. Enter your Mobile Money PIN on your phone to approve.',
        amount: input.amountUgx.toString(),
        currencyCode: input.currency,
        rawRequest: xmlPayload,
        rawResponse: responseXml,
      }
    } catch (error) {
      this.logger.error(`Failed to collect payment via Yo Uganda for ref ${input.externalReference}`, error instanceof Error ? error.stack : undefined)
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Unable to contact Yo Uganda payments gateway')
    }
  }

  async getPaymentStatus(referenceId: string): Promise<PaymentProviderResult> {
    const username = this.required('YO_UGANDA_USERNAME')
    const password = this.required('YO_UGANDA_PASSWORD')
    const baseUrl = this.baseUrl()

    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<methodCall>
  <methodName>ac_transaction_status</methodName>
  <params>
    <param>
      <value>
        <struct>
          <member>
            <name>username</name>
            <value><string>${this.escapeXml(username)}</string></value>
          </member>
          <member>
            <name>password</name>
            <value><string>${this.escapeXml(password)}</string></value>
          </member>
          <member>
            <name>transaction_reference</name>
            <value><string>${this.escapeXml(referenceId)}</string></value>
          </member>
        </struct>
      </value>
    </param>
  </params>
</methodCall>`

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'XML-RPC': 'true',
        },
        body: xmlPayload,
      })

      const responseXml = await response.text()
      if (!response.ok) {
        throw new ServiceUnavailableException(`Yo Uganda status check failed with HTTP ${response.status}`)
      }

      const status = this.getXmlValue(responseXml, 'status')
      const transactionStatus = this.getXmlValue(responseXml, 'transaction_status')
      const amount = this.getXmlValue(responseXml, 'amount')
      const statusMessage = this.getXmlValue(responseXml, 'status_message') || transactionStatus
      const payerName = this.getXmlValue(responseXml, 'payer_names') || this.getXmlValue(responseXml, 'payer_name')

      if (status.toUpperCase() !== 'OK') {
        const faultString = this.getXmlValue(responseXml, 'faultString')
        const errorMessage = this.getXmlValue(responseXml, 'error_message') || this.getXmlValue(responseXml, 'status_message') || faultString || 'Unknown error'
        this.logger.error(`Yo Uganda status check API Error. Raw XML: ${responseXml}`)
        throw new ServiceUnavailableException(`Yo Uganda status check API error: ${errorMessage}`)
      }

      return {
        status: 'OK',
        statusCode: transactionStatus.toUpperCase() === 'SUCCEEDED' ? 0 : 1,
        transactionStatus: this.mapYoStatus(transactionStatus),
        transactionReference: referenceId,
        statusMessage,
        amount,
        payerName: payerName || undefined,
        rawRequest: referenceId,
        rawResponse: responseXml,
      }
    } catch (error) {
      this.logger.error(`Yo Uganda status check failed for reference ${referenceId}`, error instanceof Error ? error.stack : undefined)
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Unable to check Yo Uganda transaction status')
    }
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<ProviderWebhookResult> {
    const externalReference = String(payload.external_ref ?? payload.reference ?? '')
    const providerReference = String(payload.transaction_reference ?? payload.yopayment_reference ?? '')
    const status = String(payload.status ?? payload.transaction_status ?? 'PENDING')
    const payerNames = String(payload.payer_names ?? payload.payer_name ?? payload.names ?? '')

    return {
      externalReference,
      providerReference,
      result: {
        status: 'OK',
        statusCode: status.toUpperCase() === 'SUCCEEDED' ? 0 : 1,
        transactionStatus: this.mapYoStatus(status),
        transactionReference: providerReference,
        payerName: payerNames || undefined,
        rawRequest: '',
        rawResponse: JSON.stringify(payload),
      },
    }
  }

  private mapYoStatus(status: string): string {
    const upper = status.toUpperCase()
    if (upper === 'SUCCEEDED' || upper === 'SUCCESSFUL') return 'COMPLETED'
    if (upper === 'FAILED' || upper === 'FAILED_UNKNOWN') return 'FAILED'
    if (upper === 'CANCELLED' || upper === 'CANCELED') return 'CANCELLED'
    return 'PENDING'
  }

  private baseUrl() {
    return this.configService.get<string>('YO_UGANDA_BASE_URL') ?? 'https://paymentsapi1.yo.co.ug/ybs/task.php'
  }

  private required(key: string) {
    const value = this.configService.get<string>(key)
    if (!value) {
      throw new ServiceUnavailableException(`Yo Uganda configuration ${key} is missing`)
    }
    return value
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  private getXmlValue(xml: string, name: string): string {
    // Try standard XML-RPC struct format first
    const regex = new RegExp(`<member>\\s*<name>${name}</name>\\s*<value>\\s*<[^>]+>([^<]+)</[^>]+>\\s*</value>\\s*</member>`, 'i')
    const match = xml.match(regex)
    if (match) return match[1].trim()

    // Try direct XML tags (e.g., <StatusMessage>...)
    const fallbackRegex = new RegExp(`<${name}>([^<]+)</${name}>`, 'i')
    const fallbackMatch = xml.match(fallbackRegex)
    return fallbackMatch ? fallbackMatch[1].trim() : ''
  }
}
