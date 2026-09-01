import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { MailModule } from '../mail/mail.module'
import { RadiusModule } from '../radius/radius.module'
import { PaymentsController } from './payments.controller'
import { EnterprisePaymentConnectorController } from './enterprise-payment-connector.controller'
import { PackageActivationService } from './package-activation.service'
import { PaymentsService } from './payments.service'
import { AirtelMoneyCollectionService } from './airtel-money-collection.service'
import { AirtelMoneyDisbursementService } from './airtel-money-disbursement.service'
import { EnterprisePaymentConnectorCrypto } from './enterprise-payment-connector.crypto'
import { EnterprisePaymentConnectorService } from './enterprise-payment-connector.service'
import { IotecPayService } from './iotec-pay.service'
import { MtnMomoCollectionService } from './mtn-momo-collection.service'
import { MtnMomoDisbursementService } from './mtn-momo-disbursement.service'
import { PaymentRouterService } from './payment-router.service'
import { PaymentWebhookService } from './payment-webhook.service'
import { PesapalCollectionService } from './pesapal-collection.service'
import { PhoneNumberService } from './phone-number.service'
import { WalletLedgerService } from './wallet-ledger.service'
import { YoUgandaCollectionService } from './yo-uganda-collection.service'
import { YoUgandaDisbursementService } from './yo-uganda-disbursement.service'
import { VoucherCodeService } from '../vouchers/voucher-code.service'
import { WhatsAppModule } from '../whatsapp/whatsapp.module'

@Module({
  imports: [AuthModule, BillingModule, MailModule, RadiusModule, WhatsAppModule],
  controllers: [PaymentsController, EnterprisePaymentConnectorController],
  providers: [
    AirtelMoneyCollectionService,
    AirtelMoneyDisbursementService,
    EnterprisePaymentConnectorCrypto,
    EnterprisePaymentConnectorService,
    IotecPayService,
    MtnMomoCollectionService,
    MtnMomoDisbursementService,
    PackageActivationService,
    PaymentRouterService,
    PaymentWebhookService,
    PesapalCollectionService,
    YoUgandaCollectionService,
    YoUgandaDisbursementService,
    PaymentsService,
    PhoneNumberService,
    WalletLedgerService,
    VoucherCodeService,
  ],
  exports: [
    EnterprisePaymentConnectorService,
    IotecPayService,
    PackageActivationService,
    PaymentRouterService,
    PaymentsService,
    PhoneNumberService,
    YoUgandaCollectionService,
    YoUgandaDisbursementService,
  ],
})
export class PaymentsModule {}
