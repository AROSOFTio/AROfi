import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { PaymentsModule } from '../payments/payments.module'
import { IotecWalletWebhookController } from './iotec-wallet-webhook.controller'
import { WalletsController } from './wallets.controller'
import { WalletsService } from './wallets.service'
import { WithdrawalOperationsController } from './withdrawal-operations.controller'
import { WithdrawalOperationsService } from './withdrawal-operations.service'

@Module({
  imports: [AuthModule, MailModule, PaymentsModule],
  controllers: [WalletsController, WithdrawalOperationsController, IotecWalletWebhookController],
  providers: [WalletsService, WithdrawalOperationsService],
  exports: [WalletsService, WithdrawalOperationsService],
})
export class WalletsModule {}
