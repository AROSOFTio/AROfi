import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { PaymentsController } from './payments.controller'
import { PackageActivationService } from './package-activation.service'
import { PesapalGatewayService } from './pesapal.gateway.service'
import { PaymentsService } from './payments.service'
import { YoUgandaGatewayService } from './yo-uganda.gateway.service'

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [PaymentsController],
  providers: [YoUgandaGatewayService, PesapalGatewayService, PackageActivationService, PaymentsService],
  exports: [PackageActivationService, PaymentsService, YoUgandaGatewayService, PesapalGatewayService],
})
export class PaymentsModule {}
