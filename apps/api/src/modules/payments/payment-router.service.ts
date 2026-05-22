import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentNetwork, PaymentProvider } from '@prisma/client'
import { AirtelMoneyCollectionService } from './airtel-money-collection.service'
import { AirtelMoneyDisbursementService } from './airtel-money-disbursement.service'
import { MtnMomoCollectionService } from './mtn-momo-collection.service'
import { MtnMomoDisbursementService } from './mtn-momo-disbursement.service'
import { PaymentCollectionProvider, PaymentDisbursementProvider } from './payment-provider.interface'
import { PesapalCollectionService } from './pesapal-collection.service'

@Injectable()
export class PaymentRouterService {
  constructor(
    private readonly configService: ConfigService,
    private readonly mtnCollection: MtnMomoCollectionService,
    private readonly airtelCollection: AirtelMoneyCollectionService,
    private readonly pesapalCollection: PesapalCollectionService,
    private readonly mtnDisbursement: MtnMomoDisbursementService,
    private readonly airtelDisbursement: AirtelMoneyDisbursementService,
  ) {}

  resolveCollection(network: PaymentNetwork): PaymentCollectionProvider {
    const configured = this.providerFor(network, 'COLLECTION')
    if (configured === PaymentProvider.MTN_MOMO_DIRECT) return this.mtnCollection
    if (configured === PaymentProvider.AIRTEL_MONEY_DIRECT) return this.airtelCollection
    if (configured === PaymentProvider.AGGREGATOR) return this.pesapalCollection
    throw new BadRequestException(`Collection provider is not configured for ${network}`)
  }

  resolveDisbursement(network: PaymentNetwork): PaymentDisbursementProvider {
    const configured = this.providerFor(network, 'DISBURSEMENT')
    if (configured === PaymentProvider.MTN_MOMO_DIRECT) return this.mtnDisbursement
    if (configured === PaymentProvider.AIRTEL_MONEY_DIRECT) return this.airtelDisbursement
    throw new BadRequestException(`Disbursement provider is not configured for ${network}`)
  }

  providerFor(network: PaymentNetwork, direction: 'COLLECTION' | 'DISBURSEMENT') {
    const key = `${network}_${direction}_PROVIDER`
    const fallback = network === PaymentNetwork.AIRTEL ? 'AIRTEL_MONEY_DIRECT' : 'MTN_MOMO_DIRECT'
    const configured = (this.configService.get<string>(key) ?? fallback).toUpperCase()

    if (direction === 'COLLECTION' && this.shouldFallbackToAggregator(configured)) {
      return PaymentProvider.AGGREGATOR
    }

    if (configured === 'MTN_MOMO_DIRECT') return PaymentProvider.MTN_MOMO_DIRECT
    if (configured === 'AIRTEL_MONEY_DIRECT') return PaymentProvider.AIRTEL_MONEY_DIRECT
    if (configured === 'AGGREGATOR') return PaymentProvider.AGGREGATOR
    throw new BadRequestException(`${key} must be MTN_MOMO_DIRECT, AIRTEL_MONEY_DIRECT, or AGGREGATOR`)
  }

  private shouldFallbackToAggregator(configured: string) {
    if (!['MTN_MOMO_DIRECT', 'AIRTEL_MONEY_DIRECT'].includes(configured)) {
      return false
    }

    if (!this.hasPesapalCollectionConfig()) {
      return false
    }

    if (configured === 'MTN_MOMO_DIRECT') {
      return !this.hasAll([
        'MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY',
        'MTN_MOMO_COLLECTION_API_USER',
        'MTN_MOMO_COLLECTION_API_KEY',
      ])
    }

    return !this.hasAll([
      'AIRTEL_MONEY_COLLECTION_BASE_URL',
      'AIRTEL_MONEY_CLIENT_ID',
      'AIRTEL_MONEY_CLIENT_SECRET',
    ])
  }

  private hasPesapalCollectionConfig() {
    return this.hasAll(['PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET', 'PESAPAL_IPN_ID'])
  }

  private hasAll(keys: string[]) {
    return keys.every((key) => {
      const value = this.configService.get<string>(key)?.trim()
      return Boolean(value && !value.startsWith('CHANGE_ME') && !value.startsWith('replace_with'))
    })
  }
}
