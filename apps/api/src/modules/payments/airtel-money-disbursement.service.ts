import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentProvider } from '@prisma/client'
import {
  PaymentDisbursementProvider,
  PaymentProviderResult,
  ProviderWebhookResult,
  SendMoneyInput,
} from './payment-provider.interface'

@Injectable()
export class AirtelMoneyDisbursementService implements PaymentDisbursementProvider {
  readonly provider = PaymentProvider.AIRTEL_MONEY_DIRECT

  constructor(private readonly configService: ConfigService) {}

  async createAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payouts are temporarily unavailable until Airtel credentials are configured')
    }

    // TODO: Wire the official Airtel Uganda disbursement token endpoint once endpoint details are supplied.
    throw new ServiceUnavailableException('Airtel Money disbursement endpoint details are not configured')
  }

  async sendMoney(_input: SendMoneyInput): Promise<PaymentProviderResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payouts are temporarily unavailable until Airtel credentials are configured')
    }

    // TODO: Implement Airtel Money disbursement API call using AIRTEL_MONEY_DISBURSEMENT_BASE_URL.
    throw new ServiceUnavailableException('Airtel Money disbursement endpoint details are not configured')
  }

  async getDisbursementStatus(referenceId: string): Promise<PaymentProviderResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payouts are temporarily unavailable until Airtel credentials are configured')
    }

    // TODO: Implement Airtel Money payout status lookup once endpoints are confirmed.
    return { status: 'OK', statusCode: 1, transactionStatus: 'PENDING', transactionReference: referenceId, rawRequest: referenceId, rawResponse: '{}' }
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<ProviderWebhookResult> {
    const providerReference = String(payload.referenceId ?? payload.transactionId ?? payload.id ?? '')
    const status = String(payload.status ?? payload.transactionStatus ?? 'PENDING')
    return { providerReference, result: { status: 'OK', statusCode: status.toUpperCase() === 'SUCCESS' ? 0 : 1, transactionStatus: status, transactionReference: providerReference, rawRequest: '', rawResponse: JSON.stringify(payload) } }
  }

  private isConfigured() {
    return Boolean(
      this.configService.get<string>('AIRTEL_MONEY_DISBURSEMENT_BASE_URL') &&
        this.configService.get<string>('AIRTEL_MONEY_CLIENT_ID') &&
        this.configService.get<string>('AIRTEL_MONEY_CLIENT_SECRET'),
    )
  }
}
