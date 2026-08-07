import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { PaymentsModule } from '../payments/payments.module'
import { IotecWalletWebhookController } from './iotec-wallet-webhook.controller'
import { WalletsController } from './wallets.controller'
import { WalletsService } from './wallets.service'

@Module({
  imports: [AuthModule, MailModule, PaymentsModule],
  controllers: [WalletsController, IotecWalletWebhookController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
