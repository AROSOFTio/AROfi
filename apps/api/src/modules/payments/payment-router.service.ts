import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentNetwork, PaymentProvider } from '@prisma/client'
import { AirtelMoneyCollectionService } from './airtel-money-collection.service'
import { AirtelMoneyDisbursementService } from './airtel-money-disbursement.service'
import { IotecPayService } from './iotec-pay.service'
import { MtnMomoCollectionService } from './mtn-momo-collection.service'
import { MtnMomoDisbursementService } from './mtn-momo-disbursement.service'
import { PaymentCollectionProvider, PaymentDisbursementProvider } from './payment-provider.interface'
import { PesapalCollectionService } from './pesapal-collection.service'
import { YoUgandaCollectionService } from './yo-uganda-collection.service'
import { YoUgandaDisbursementService } from './yo-uganda-disbursement.service'

type ProviderSettings = {
  mtnCollectionProvider?: PaymentProvider
  airtelCollectionProvider?: PaymentProvider
  mtnDisbursementProvider?: PaymentProvider
  airtelDisbursementProvider?: PaymentProvider
}

@Injectable()
export class PaymentRouterService {
  constructor(
    private readonly configService: ConfigService,
    private readonly mtnCollection: MtnMomoCollectionService,
    private readonly airtelCollection: AirtelMoneyCollectionService,
    private readonly pesapalCollection: PesapalCollectionService,
    private readonly yoCollection: YoUgandaCollectionService,
    private readonly iotecPay: IotecPayService,
    private readonly yoDisbursement: YoUgandaDisbursementService,
    private readonly mtnDisbursement: MtnMomoDisbursementService,
    private readonly airtelDisbursement: AirtelMoneyDisbursementService,
  ) {}

  resolveCollection(
    network: PaymentNetwork,
    configuredProvider?: PaymentProvider,
  ): PaymentCollectionProvider {
    const provider = configuredProvider ?? this.providerFor(network, 'COLLECTION')

    if (provider === PaymentProvider.IOTEC_PAY) return this.iotecPay
    if (provider === PaymentProvider.MTN_MOMO_DIRECT) {
      if (network !== PaymentNetwork.MTN) {
        throw new BadRequestException('MTN direct collection can only process MTN numbers')
      }
      return this.mtnCollection
    }
    if (provider === PaymentProvider.AIRTEL_MONEY_DIRECT) {
      if (network !== PaymentNetwork.AIRTEL) {
        throw new BadRequestException('Airtel direct collection can only process Airtel numbers')
      }
      return this.airtelCollection
    }
    if (provider === PaymentProvider.AGGREGATOR) {
      return this.aggregatorCollection()
    }

    throw new BadRequestException(`Collection provider is not configured for ${network}`)
  }

  resolveDisbursement(
    network: PaymentNetwork,
    configuredProvider?: PaymentProvider,
  ): PaymentDisbursementProvider {
    const provider = configuredProvider ?? this.providerFor(network, 'DISBURSEMENT')

    if (provider === PaymentProvider.IOTEC_PAY) return this.iotecPay
    if (provider === PaymentProvider.AGGREGATOR) return this.yoDisbursement
    if (provider === PaymentProvider.MTN_MOMO_DIRECT) {
      if (network !== PaymentNetwork.MTN) {
        throw new BadRequestException('MTN direct disbursement can only pay MTN numbers')
      }
      return this.mtnDisbursement
    }
    if (provider === PaymentProvider.AIRTEL_MONEY_DIRECT) {
      if (network !== PaymentNetwork.AIRTEL) {
        throw new BadRequestException('Airtel direct disbursement can only pay Airtel numbers')
      }
      return this.airtelDisbursement
    }

    throw new BadRequestException(`Disbursement provider is not configured for ${network}`)
  }

  providerFor(network: PaymentNetwork, direction: 'COLLECTION' | 'DISBURSEMENT') {
    const key = `${network}_${direction}_PROVIDER`
    const configured = (this.configService.get<string>(key) ?? 'AGGREGATOR').toUpperCase()

    if (configured === 'IOTEC_PAY') return PaymentProvider.IOTEC_PAY
    if (configured === 'YO_UGANDA') return PaymentProvider.AGGREGATOR
    if (configured === 'MTN_MOMO_DIRECT') return PaymentProvider.MTN_MOMO_DIRECT
    if (configured === 'AIRTEL_MONEY_DIRECT') return PaymentProvider.AIRTEL_MONEY_DIRECT
    if (configured === 'AGGREGATOR') return PaymentProvider.AGGREGATOR

    throw new BadRequestException(
      `${key} must be IOTEC_PAY, AGGREGATOR, MTN_MOMO_DIRECT, or AIRTEL_MONEY_DIRECT`,
    )
  }

  getProviderReadiness(settings?: ProviderSettings) {
    const mtnCollectionProvider =
      settings?.mtnCollectionProvider ?? this.providerFor(PaymentNetwork.MTN, 'COLLECTION')
    const airtelCollectionProvider =
      settings?.airtelCollectionProvider ?? this.providerFor(PaymentNetwork.AIRTEL, 'COLLECTION')
    const mtnDisbursementProvider =
      settings?.mtnDisbursementProvider ?? this.providerFor(PaymentNetwork.MTN, 'DISBURSEMENT')
    const airtelDisbursementProvider =
      settings?.airtelDisbursementProvider ?? this.providerFor(PaymentNetwork.AIRTEL, 'DISBURSEMENT')

    const mtnCollectionReady = this.isConfigured(mtnCollectionProvider, 'COLLECTION')
    const airtelCollectionReady = this.isConfigured(airtelCollectionProvider, 'COLLECTION')

    return {
      collection: {
        MTN: {
          provider: mtnCollectionProvider,
          directConfigured: this.isConfigured(PaymentProvider.MTN_MOMO_DIRECT, 'COLLECTION'),
          aggregatorConfigured: this.isConfigured(PaymentProvider.AGGREGATOR, 'COLLECTION'),
          iotecConfigured: this.isConfigured(PaymentProvider.IOTEC_PAY, 'COLLECTION'),
          ready: mtnCollectionReady,
        },
        AIRTEL: {
          provider: airtelCollectionProvider,
          directConfigured: this.isConfigured(PaymentProvider.AIRTEL_MONEY_DIRECT, 'COLLECTION'),
          aggregatorConfigured: this.isConfigured(PaymentProvider.AGGREGATOR, 'COLLECTION'),
          iotecConfigured: this.isConfigured(PaymentProvider.IOTEC_PAY, 'COLLECTION'),
          directStatus: this.isConfigured(PaymentProvider.AIRTEL_MONEY_DIRECT, 'COLLECTION')
            ? 'Configured'
            : 'Inactive',
          aggregatorStatus: this.isConfigured(PaymentProvider.AGGREGATOR, 'COLLECTION')
            ? 'Configured'
            : 'Inactive',
          ready: airtelCollectionReady,
        },
      },
      disbursement: {
        MTN: {
          provider: mtnDisbursementProvider,
          ready: this.isConfigured(mtnDisbursementProvider, 'DISBURSEMENT'),
        },
        AIRTEL: {
          provider: airtelDisbursementProvider,
          ready: this.isConfigured(airtelDisbursementProvider, 'DISBURSEMENT'),
        },
      },
    }
  }

  private aggregatorCollection() {
    const aggregatorProvider = this.configService.get<string>('AGGREGATOR_PROVIDER')?.toUpperCase()
    return aggregatorProvider === 'PESAPAL' ? this.pesapalCollection : this.yoCollection
  }

  private isConfigured(provider: PaymentProvider, direction: 'COLLECTION' | 'DISBURSEMENT') {
    if (provider === PaymentProvider.IOTEC_PAY) {
      return this.hasAll(['IOTEC_CLIENT_ID', 'IOTEC_CLIENT_SECRET', 'IOTEC_WALLET_ID'])
    }
    if (provider === PaymentProvider.AGGREGATOR) {
      const selected = this.configService.get<string>('AGGREGATOR_PROVIDER')?.toUpperCase()
      if (selected === 'PESAPAL') {
        return direction === 'COLLECTION' &&
          this.hasAll(['PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET', 'PESAPAL_IPN_ID'])
      }
      return this.hasAll(['YO_UGANDA_USERNAME', 'YO_UGANDA_PASSWORD'])
    }
    if (provider === PaymentProvider.MTN_MOMO_DIRECT) {
      return direction === 'COLLECTION'
        ? this.hasAll([
            'MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY',
            'MTN_MOMO_COLLECTION_API_USER',
            'MTN_MOMO_COLLECTION_API_KEY',
          ])
        : this.hasAll([
            'MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY',
            'MTN_MOMO_DISBURSEMENT_API_USER',
            'MTN_MOMO_DISBURSEMENT_API_KEY',
          ])
    }
    if (provider === PaymentProvider.AIRTEL_MONEY_DIRECT) {
      return direction === 'COLLECTION'
        ? this.hasAll([
            'AIRTEL_MONEY_COLLECTION_BASE_URL',
            'AIRTEL_MONEY_CLIENT_ID',
            'AIRTEL_MONEY_CLIENT_SECRET',
          ])
        : this.hasAll([
            'AIRTEL_MONEY_DISBURSEMENT_BASE_URL',
            'AIRTEL_MONEY_CLIENT_ID',
            'AIRTEL_MONEY_CLIENT_SECRET',
          ])
    }
    return false
  }

  private hasAll(keys: string[]) {
    return keys.every((key) => {
      const value = this.configService.get<string>(key)?.trim()
      return Boolean(value && !value.startsWith('CHANGE_ME') && !value.startsWith('replace_with'))
    })
  }
}
