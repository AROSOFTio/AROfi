import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentNetwork } from '@prisma/client'
import { randomUUID } from 'crypto'

type YoCollectionRequest = {
  amountUgx: number
  phoneNumber: string
  narrative: string
  externalReference: string
  internalReference?: string
  providerReferenceText?: string
  instantNotificationUrl?: string
  failureNotificationUrl?: string
  network?: PaymentNetwork
}

type YoStatusRequest = {
  transactionReference?: string | null
  externalReference?: string | null
}

export type YoGatewayResponse = {
  status: string
  statusCode: number
  transactionStatus?: string
  transactionReference?: string
  mnoTransactionReferenceId?: string
  issuedReceiptNumber?: string
  statusMessage?: string
  errorMessageCode?: string
  errorMessage?: string
  amount?: string
  currencyCode?: string
  transactionInitiationDate?: string
  transactionCompletionDate?: string
  rawRequest: string
  rawResponse: string
}

@Injectable()
export class YoUgandaGatewayService {
  private readonly logger = new Logger(YoUgandaGatewayService.name)

  constructor(private readonly configService: ConfigService) {}

  async initiateCollection(request: YoCollectionRequest): Promise<YoGatewayResponse> {
    if (this.isMockMode()) {
      return this.mockCollectionResponse(request)
    }

    const xml = this.buildCollectionRequestXml(request)
    const rawResponse = await this.submitXml(xml)

    return {
      ...this.parseXmlResponse(rawResponse),
      rawRequest: xml,
      rawResponse,
    }
  }

  async checkTransactionStatus(request: YoStatusRequest): Promise<YoGatewayResponse> {
    if (this.isMockMode()) {
      return this.mockStatusResponse(request)
    }

    const xml = this.buildStatusCheckRequestXml(request)
    const rawResponse = await this.submitXml(xml)

    return {
      ...this.parseXmlResponse(rawResponse),
      rawRequest: xml,
      rawResponse,
    }
  }

  private isMockMode() {
    return (this.configService.get<string>('YO_API_MODE') ?? 'live').toLowerCase() === 'mock'
  }

  private buildCollectionRequestXml(request: YoCollectionRequest) {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<AutoCreate>',
      '<Request>',
      this.tag('APIUsername', this.getRequiredConfig('YO_API_USERNAME')),
      this.tag('APIPassword', this.getRequiredConfig('YO_API_PASSWORD')),
      this.tag('Method', 'acdepositfunds'),
      this.tag('NonBlocking', 'TRUE'),
      this.tag('Amount', request.amountUgx.toString()),
      this.tag('Account', request.phoneNumber),
      this.tag('Narrative', request.narrative),
      this.optionalTag('ExternalReference', request.externalReference),
      this.optionalTag('InternalReference', request.internalReference),
      this.optionalTag('ProviderReferenceText', request.providerReferenceText),
      this.optionalTag('InstantNotificationUrl', request.instantNotificationUrl),
      this.optionalTag('FailureNotificationUrl', request.failureNotificationUrl),
      '</Request>',
      '</AutoCreate>',
    ].join('')
  }

  private buildStatusCheckRequestXml(request: YoStatusRequest) {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<AutoCreate>',
      '<Request>',
      this.tag('APIUsername', this.getRequiredConfig('YO_API_USERNAME')),
      this.tag('APIPassword', this.getRequiredConfig('YO_API_PASSWORD')),
      this.tag('Method', 'actransactioncheckstatus'),
      this.optionalTag('TransactionReference', request.transactionReference ?? undefined),
      this.optionalTag('PrivateTransactionReference', request.externalReference ?? undefined),
      '</Request>',
      '</AutoCreate>',
    ].join('')
  }

  private async submitXml(xml: string) {
    const urls = [
      this.configService.get<string>('YO_API_BASE_URL') ?? 'https://paymentsapi1.yo.co.ug/ybs/task.php',
      this.configService.get<string>('YO_API_FALLBACK_URL') ?? 'https://paymentsapi2.yo.co.ug/ybs/task.php',
    ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index) as string[]

    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8',
    }

    let lastError: unknown

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: xml,
        })

        const body = await response.text()

        if (!response.ok) {
          throw new Error(`Yo Uganda returned HTTP ${response.status}: ${body}`)
        }

        return body
      } catch (error) {
        lastError = error
        this.logger.warn(`Yo Uganda request failed against ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    throw new ServiceUnavailableException(
      `Unable to reach Yo Uganda gateway${lastError instanceof Error ? `: ${lastError.message}` : ''}`,
    )
  }

  private parseXmlResponse(rawResponse: string): Omit<YoGatewayResponse, 'rawRequest' | 'rawResponse'> {
    const parseInteger = (value?: string) => {
      if (!value) {
        return 0
      }

      const parsed = Number.parseInt(value, 10)
      return Number.isNaN(parsed) ? 0 : parsed
    }

    return {
      status: this.getTagValue(rawResponse, 'Status') ?? 'ERROR',
      statusCode: parseInteger(this.getTagValue(rawResponse, 'StatusCode')),
      transactionStatus: this.getTagValue(rawResponse, 'TransactionStatus') ?? undefined,
      transactionReference: this.getTagValue(rawResponse, 'TransactionReference') ?? undefined,
      mnoTransactionReferenceId: this.getTagValue(rawResponse, 'MNOTransactionReferenceId') ?? undefined,
      issuedReceiptNumber: this.getTagValue(rawResponse, 'IssuedReceiptNumber') ?? undefined,
      statusMessage: this.getTagValue(rawResponse, 'StatusMessage') ?? undefined,
      errorMessageCode: this.getTagValue(rawResponse, 'ErrorMessageCode') ?? undefined,
      errorMessage: this.getTagValue(rawResponse, 'ErrorMessage') ?? undefined,
      amount: this.getTagValue(rawResponse, 'Amount') ?? undefined,
      currencyCode: this.getTagValue(rawResponse, 'CurrencyCode') ?? undefined,
      transactionInitiationDate: this.getTagValue(rawResponse, 'TransactionInitiationDate') ?? undefined,
      transactionCompletionDate: this.getTagValue(rawResponse, 'TransactionCompletionDate') ?? undefined,
    }
  }

  private getTagValue(xml: string, tagName: string) {
    const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i'))
    return match?.[1]?.trim()
  }

  private tag(name: string, value: string) {
    return `<${name}>${this.escapeXml(value)}</${name}>`
  }

  private optionalTag(name: string, value?: string) {
    return value ? this.tag(name, value) : ''
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  private getRequiredConfig(key: string) {
    const value = this.configService.get<string>(key)

    if (!value) {
      throw new ServiceUnavailableException(`${key} is not configured`)
    }

    return value
  }

  private mockCollectionResponse(request: YoCollectionRequest): YoGatewayResponse {
    const transactionReference = `YO-MOCK-${randomUUID().slice(0, 12).toUpperCase()}`
    const isPending = !request.phoneNumber.endsWith('000')

    return {
      status: 'OK',
      statusCode: isPending ? 1 : 0,
      transactionStatus: isPending ? 'PENDING' : 'SUCCEEDED',
      transactionReference,
      mnoTransactionReferenceId: `MNO-${randomUUID().slice(0, 10).toUpperCase()}`,
      statusMessage: isPending ? 'Mock payment request queued for approval' : 'Mock payment completed',
      rawRequest: JSON.stringify(request),
      rawResponse: '<mock-response />',
    }
  }

  private mockStatusResponse(request: YoStatusRequest): YoGatewayResponse {
    return {
      status: 'OK',
      statusCode: 0,
      transactionStatus: 'SUCCEEDED',
      transactionReference: request.transactionReference ?? `YO-MOCK-${randomUUID().slice(0, 12).toUpperCase()}`,
      mnoTransactionReferenceId: `MNO-${randomUUID().slice(0, 10).toUpperCase()}`,
      statusMessage: 'Mock status check resolved successfully',
      rawRequest: JSON.stringify(request),
      rawResponse: '<mock-response />',
    }
  }
}
