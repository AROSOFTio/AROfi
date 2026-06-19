import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentNetwork, PaymentProvider } from '@prisma/client'
import { AirtelMoneyCollectionService } from './airtel-money-collection.service'
import { AirtelMoneyDisbursementService } from './airtel-money-disbursement.service'
import { MtnMomoCollectionService } from './mtn-momo-collection.service'
import { MtnMomoDisbursementService } from './mtn-momo-disbursement.service'
import { PaymentCollectionProvider, PaymentDisbursementProvider } from './payment-provider.interface'
import { PesapalCollectionService } from './pesapal-collection.service'
import { YoUgandaCollectionService } from './yo-uganda-collection.service'

@Injectable()
export class PaymentRouterService {
  constructor(
    private readonly configService: ConfigService,
    private readonly mtnCollection: MtnMomoCollectionService,
    private readonly airtelCollection: AirtelMoneyCollectionService,
    private readonly pesapalCollection: PesapalCollectionService,
    private readonly yoCollection: YoUgandaCollectionService,
    private readonly mtnDisbursement: MtnMomoDisbursementService,
    private readonly airtelDisbursement: AirtelMoneyDisbursementService,
  ) {}

  resolveCollection(network: PaymentNetwork): PaymentCollectionProvider {
    // ── Yo! Uganda only ─────────────────────────────────────────────────────
    // All other collection providers (MTN direct, Airtel direct, Pesapal) are
    // disabled. Route every network through the Yo! Uganda aggregator.
    return this.yoCollection

    /* MTN / Airtel direct and Pesapal — commented out
    const configured = this.providerFor(network, 'COLLECTION')
    if (configured === PaymentProvider.MTN_MOMO_DIRECT) return this.mtnCollection
    if (configured === PaymentProvider.AIRTEL_MONEY_DIRECT) {
      throw new BadRequestException('Airtel direct collection is not configured. Enable Airtel via aggregator in platform settings.')
    }
    if (configured === PaymentProvider.AGGREGATOR) {
      const aggregatorProvider = this.configService.get<string>('AGGREGATOR_PROVIDER')?.toUpperCase()
      if (aggregatorProvider === 'YO_UGANDA') {
        return this.yoCollection
      }
      return this.pesapalCollection
    }
    throw new BadRequestException(`Collection provider is not configured for ${network}`)
    */
  }

  resolveDisbursement(network: PaymentNetwork): PaymentDisbursementProvider {
    const configured = this.providerFor(network, 'DISBURSEMENT')
    if (configured === PaymentProvider.MTN_MOMO_DIRECT) return this.mtnDisbursement
    if (configured === PaymentProvider.AIRTEL_MONEY_DIRECT) {
      throw new BadRequestException('Airtel direct payouts are not configured. Use MTN payouts or enable an approved payout provider.')
    }
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

  getProviderReadiness() {
    // Yo! Uganda is the only active collection provider.
    const yoReady = this.hasAll(['YO_UGANDA_USERNAME', 'YO_UGANDA_PASSWORD'])

    return {
      collection: {
        MTN: {
          directConfigured: false,
          aggregatorConfigured: yoReady,
          ready: yoReady,
        },
        AIRTEL: {
          directConfigured: false,
          aggregatorConfigured: yoReady,
          directStatus: 'Disabled — using Yo! Uganda aggregator',
          aggregatorStatus: yoReady ? 'Active' : 'Inactive',
          ready: yoReady,
        },
      },
    }
  }

  private shouldFallbackToAggregator(configured: string) {
    if (!['MTN_MOMO_DIRECT', 'AIRTEL_MONEY_DIRECT'].includes(configured)) {
      return false
    }

    if (!this.hasAggregatorCollectionConfig()) {
      return false
    }

    if (configured === 'MTN_MOMO_DIRECT') {
      return !this.hasAll([
        'MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY',
        'MTN_MOMO_COLLECTION_API_USER',
        'MTN_MOMO_COLLECTION_API_KEY',
      ])
    }

    return true
  }

  private hasAggregatorCollectionConfig() {
    const aggregatorProvider = this.configService.get<string>('AGGREGATOR_PROVIDER')?.toUpperCase()
    if (aggregatorProvider === 'YO_UGANDA') {
      return this.hasAll(['YO_UGANDA_USERNAME', 'YO_UGANDA_PASSWORD'])
    }
    return this.hasAll(['PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET', 'PESAPAL_IPN_ID'])
  }

  private hasAll(keys: string[]) {
    return keys.every((key) => {
      const value = this.configService.get<string>(key)?.trim()
      return Boolean(value && !value.startsWith('CHANGE_ME') && !value.startsWith('replace_with'))
    })
  }
}
