import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { RadiusModule } from '../radius/radius.module'
import { PaymentsController } from './payments.controller'
import { PackageActivationService } from './package-activation.service'
import { PaymentsService } from './payments.service'
import { AirtelMoneyCollectionService } from './airtel-money-collection.service'
import { AirtelMoneyDisbursementService } from './airtel-money-disbursement.service'
import { MtnMomoCollectionService } from './mtn-momo-collection.service'
import { MtnMomoDisbursementService } from './mtn-momo-disbursement.service'
import { PaymentRouterService } from './payment-router.service'
import { PaymentWebhookService } from './payment-webhook.service'
import { PesapalCollectionService } from './pesapal-collection.service'
import { PhoneNumberService } from './phone-number.service'
import { WalletLedgerService } from './wallet-ledger.service'
import { YoUgandaCollectionService } from './yo-uganda-collection.service'

@Module({
  imports: [AuthModule, BillingModule, RadiusModule],
  controllers: [PaymentsController],
  providers: [
    AirtelMoneyCollectionService,
    AirtelMoneyDisbursementService,
    MtnMomoCollectionService,
    MtnMomoDisbursementService,
    PackageActivationService,
    PaymentRouterService,
    PaymentWebhookService,
    PesapalCollectionService,
    YoUgandaCollectionService,
    PaymentsService,
    PhoneNumberService,
    WalletLedgerService,
  ],
  exports: [PackageActivationService, PaymentRouterService, PaymentsService, PhoneNumberService, YoUgandaCollectionService],
})
export class PaymentsModule {}
