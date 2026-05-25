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

    throw new ServiceUnavailableException('Airtel Direct is not configured. Route Airtel through the active aggregator provider.')
  }

  async collectPayment(_input: CollectPaymentInput): Promise<PaymentProviderResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payments are temporarily unavailable. Please try MTN or contact support.')
    }

    throw new ServiceUnavailableException('Airtel Direct is not configured. Route Airtel through the active aggregator provider.')
  }

  async getPaymentStatus(_referenceId: string): Promise<PaymentProviderResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payments are temporarily unavailable. Please try MTN or contact support.')
    }

    throw new ServiceUnavailableException('Airtel Direct is not configured. Route Airtel through the active aggregator provider.')
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
