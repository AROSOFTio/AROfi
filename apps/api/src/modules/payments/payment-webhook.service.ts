import { Injectable } from '@nestjs/common'
import { PaymentNetwork, PaymentProvider } from '@prisma/client'
import { PaymentsService } from './payments.service'

@Injectable()
export class PaymentWebhookService {
  constructor(private readonly paymentsService: PaymentsService) {}

  handleCollectionWebhook(
    provider: PaymentProvider,
    network: PaymentNetwork,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleProviderWebhook(provider, network, payload, headers, 'collection')
  }

  handleDisbursementWebhook(
    provider: PaymentProvider,
    network: PaymentNetwork,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleProviderWebhook(provider, network, payload, headers, 'disbursement')
  }
}
