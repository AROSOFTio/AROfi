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

    throw new ServiceUnavailableException('Airtel Direct payouts are not configured. Use an approved payout route.')
  }

  async sendMoney(_input: SendMoneyInput): Promise<PaymentProviderResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payouts are temporarily unavailable until Airtel credentials are configured')
    }

    throw new ServiceUnavailableException('Airtel Direct payouts are not configured. Use an approved payout route.')
  }

  async getDisbursementStatus(_referenceId: string): Promise<PaymentProviderResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Airtel payouts are temporarily unavailable until Airtel credentials are configured')
    }

    throw new ServiceUnavailableException('Airtel Direct payouts are not configured. Use an approved payout route.')
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
