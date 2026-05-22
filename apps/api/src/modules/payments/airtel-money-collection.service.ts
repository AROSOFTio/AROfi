import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentProvider } from '@prisma/client'
import {
  CollectPaymentInput,
  PaymentCollectionProvider,
  PaymentProviderResult,
  ProviderWebhookResult,
} from './payment-provider.interface'

@Injectable()
export class AirtelMoneyCollectionService implements PaymentCollectionProvider {
  readonly provider = PaymentProvider.AIRTEL_MONEY_DIRECT

  constructor(private readonly configService: ConfigService) {}

  async createAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payments are temporarily unavailable. Please try MTN or contact support.')
    }

    // TODO: Wire the official Airtel Uganda token endpoint once live/sandbox endpoint details are supplied.
    throw new ServiceUnavailableException('Airtel Money collection endpoint details are not configured')
  }

  async collectPayment(_input: CollectPaymentInput): Promise<PaymentProviderResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payments are temporarily unavailable. Please try MTN or contact support.')
    }

    // TODO: Implement Airtel Money collection API call using AIRTEL_MONEY_COLLECTION_BASE_URL.
    throw new ServiceUnavailableException('Airtel Money collection endpoint details are not configured')
  }

  async getPaymentStatus(referenceId: string): Promise<PaymentProviderResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payments are temporarily unavailable. Please try MTN or contact support.')
    }

    // TODO: Implement Airtel Money transaction status lookup once endpoints are confirmed.
    return {
      status: 'OK',
      statusCode: 1,
      transactionStatus: 'PENDING',
      transactionReference: referenceId,
      rawRequest: referenceId,
      rawResponse: '{}',
    }
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<ProviderWebhookResult> {
    const providerReference = String(payload.referenceId ?? payload.transactionId ?? payload.id ?? '')
    const status = String(payload.status ?? payload.transactionStatus ?? 'PENDING')
    return {
      providerReference,
      result: {
        status: 'OK',
        statusCode: status.toUpperCase() === 'SUCCESS' ? 0 : 1,
        transactionStatus: status,
        transactionReference: providerReference,
        rawRequest: '',
        rawResponse: JSON.stringify(payload),
      },
    }
  }

  private isConfigured() {
    return Boolean(
      this.configService.get<string>('AIRTEL_MONEY_COLLECTION_BASE_URL') &&
        this.configService.get<string>('AIRTEL_MONEY_CLIENT_ID') &&
        this.configService.get<string>('AIRTEL_MONEY_CLIENT_SECRET'),
    )
  }
}
