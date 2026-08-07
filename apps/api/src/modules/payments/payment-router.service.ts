import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentNetwork, PaymentProvider, PlatformPaymentGateway } from '@prisma/client'
import { AirtelMoneyCollectionService } from './airtel-money-collection.service'
import { AirtelMoneyDisbursementService } from './airtel-money-disbursement.service'
import { IotecPayService } from './iotec-pay.service'
import { MtnMomoCollectionService } from './mtn-momo-collection.service'
import { MtnMomoDisbursementService } from './mtn-momo-disbursement.service'
import { PaymentCollectionProvider, PaymentDisbursementProvider } from './payment-provider.interface'
import { PesapalCollectionService } from './pesapal-collection.service'
import { YoUgandaCollectionService } from './yo-uganda-collection.service'
import { YoUgandaDisbursementService } from './yo-uganda-disbursement.service'

type GatewaySettings = {
  paymentGateway?: PlatformPaymentGateway
}

type RoutingSelection = PlatformPaymentGateway | PaymentProvider

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
    selection?: RoutingSelection,
  ): PaymentCollectionProvider {
    const provider = this.providerFor(network, 'COLLECTION', selection)

    if (provider === PaymentProvider.IOTEC_PAY) return this.iotecPay
    if (provider === PaymentProvider.PESAPAL) return this.pesapalCollection
    if (provider === PaymentProvider.YO_UGANDA || provider === PaymentProvider.AGGREGATOR) {
      return this.yoCollection
    }
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

    throw new BadRequestException(`Collection provider is not configured for ${network}`)
  }

  resolveDisbursement(
    network: PaymentNetwork,
    selection?: RoutingSelection,
  ): PaymentDisbursementProvider {
    const provider = this.providerFor(network, 'DISBURSEMENT', selection)

    if (provider === PaymentProvider.IOTEC_PAY) return this.iotecPay
    if (provider === PaymentProvider.YO_UGANDA || provider === PaymentProvider.AGGREGATOR) {
      return this.yoDisbursement
    }
    if (provider === PaymentProvider.PESAPAL) {
      throw new ServiceUnavailableException(
        'Pesapal universal mode cannot send arbitrary business withdrawals because no public Pesapal payout API is configured. Add the approved Pesapal payout API adapter before activating Pesapal as the platform gateway.',
      )
    }
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

  providerFor(
    network: PaymentNetwork,
    direction: 'COLLECTION' | 'DISBURSEMENT',
    selection?: RoutingSelection,
  ): PaymentProvider {
    const selected = selection ?? this.defaultGateway()

    if (selected === PlatformPaymentGateway.YO_UGANDA || selected === PaymentProvider.YO_UGANDA) {
      return PaymentProvider.YO_UGANDA
    }
    if (selected === PlatformPaymentGateway.IOTEC_PAY || selected === PaymentProvider.IOTEC_PAY) {
      return PaymentProvider.IOTEC_PAY
    }
    if (selected === PlatformPaymentGateway.PESAPAL || selected === PaymentProvider.PESAPAL) {
      return PaymentProvider.PESAPAL
    }
    if (selected === PlatformPaymentGateway.DIRECT_MNO) {
      if (network === PaymentNetwork.MTN) return PaymentProvider.MTN_MOMO_DIRECT
      if (network === PaymentNetwork.AIRTEL) return PaymentProvider.AIRTEL_MONEY_DIRECT
      throw new BadRequestException(`Direct MNO ${direction.toLowerCase()} requires MTN or Airtel`)
    }

    // Preserve historical transactions created before the single-gateway setting.
    if (selected === PaymentProvider.AGGREGATOR) {
      const legacy = (this.configService.get<string>('AGGREGATOR_PROVIDER') || 'YO_UGANDA').toUpperCase()
      return legacy === 'PESAPAL' ? PaymentProvider.PESAPAL : PaymentProvider.YO_UGANDA
    }
    if (
      selected === PaymentProvider.MTN_MOMO_DIRECT ||
      selected === PaymentProvider.AIRTEL_MONEY_DIRECT
    ) {
      return selected
    }

    throw new BadRequestException(`Unsupported payment gateway selection: ${String(selected)}`)
  }

  getProviderReadiness(settings?: GatewaySettings) {
    const gateway = settings?.paymentGateway ?? this.defaultGateway()
    const mtnCollectionProvider = this.providerFor(PaymentNetwork.MTN, 'COLLECTION', gateway)
    const airtelCollectionProvider = this.providerFor(PaymentNetwork.AIRTEL, 'COLLECTION', gateway)
    const mtnDisbursementProvider = this.providerFor(PaymentNetwork.MTN, 'DISBURSEMENT', gateway)
    const airtelDisbursementProvider = this.providerFor(PaymentNetwork.AIRTEL, 'DISBURSEMENT', gateway)

    const mtnCollectionReady = this.isConfigured(mtnCollectionProvider, 'COLLECTION')
    const airtelCollectionReady = this.isConfigured(airtelCollectionProvider, 'COLLECTION')
    const mtnDisbursementReady = this.isConfigured(mtnDisbursementProvider, 'DISBURSEMENT')
    const airtelDisbursementReady = this.isConfigured(airtelDisbursementProvider, 'DISBURSEMENT')
    const cardReady =
      gateway === PlatformPaymentGateway.IOTEC_PAY
        ? this.isConfigured(PaymentProvider.IOTEC_PAY, 'COLLECTION')
        : gateway === PlatformPaymentGateway.PESAPAL
          ? this.isConfigured(PaymentProvider.PESAPAL, 'COLLECTION')
          : false

    return {
      gateway,
      universalReady:
        mtnCollectionReady &&
        airtelCollectionReady &&
        mtnDisbursementReady &&
        airtelDisbursementReady,
      paymentMethods: cardReady ? ['MOBILE_MONEY', 'CARD'] : ['MOBILE_MONEY'],
      collection: {
        MTN: {
          provider: mtnCollectionProvider,
          ready: mtnCollectionReady,
        },
        AIRTEL: {
          provider: airtelCollectionProvider,
          ready: airtelCollectionReady,
        },
        CARD: {
          provider:
            gateway === PlatformPaymentGateway.IOTEC_PAY
              ? PaymentProvider.IOTEC_PAY
              : gateway === PlatformPaymentGateway.PESAPAL
                ? PaymentProvider.PESAPAL
                : null,
          ready: cardReady,
          currency: 'UGX',
        },
      },
      disbursement: {
        MTN: {
          provider: mtnDisbursementProvider,
          ready: mtnDisbursementReady,
        },
        AIRTEL: {
          provider: airtelDisbursementProvider,
          ready: airtelDisbursementReady,
        },
      },
      warning:
        gateway === PlatformPaymentGateway.PESAPAL
          ? 'Pesapal collections and hosted card checkout are supported, but arbitrary payout/disbursement API access is not available in the public API.'
          : null,
    }
  }

  private defaultGateway(): PlatformPaymentGateway {
    const configured = (this.configService.get<string>('PAYMENT_GATEWAY') || 'YO_UGANDA').toUpperCase()
    if (configured === 'IOTEC_PAY' || configured === 'IOTECH') {
      return PlatformPaymentGateway.IOTEC_PAY
    }
    if (configured === 'PESAPAL') return PlatformPaymentGateway.PESAPAL
    if (configured === 'DIRECT_MNO' || configured === 'DIRECT') {
      return PlatformPaymentGateway.DIRECT_MNO
    }
    return PlatformPaymentGateway.YO_UGANDA
  }

  private isConfigured(provider: PaymentProvider, direction: 'COLLECTION' | 'DISBURSEMENT') {
    if (provider === PaymentProvider.IOTEC_PAY) {
      return this.hasAll(['IOTEC_CLIENT_ID', 'IOTEC_CLIENT_SECRET', 'IOTEC_WALLET_ID'])
    }
    if (provider === PaymentProvider.PESAPAL) {
      return (
        direction === 'COLLECTION' &&
        this.hasAll(['PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET', 'PESAPAL_IPN_ID'])
      )
    }
    if (provider === PaymentProvider.YO_UGANDA || provider === PaymentProvider.AGGREGATOR) {
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
