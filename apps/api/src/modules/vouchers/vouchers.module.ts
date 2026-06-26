import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { MailModule } from '../mail/mail.module'
import { PaymentsModule } from '../payments/payments.module'
import { WhatsAppModule } from '../whatsapp/whatsapp.module'
import { VoucherCodeService } from './voucher-code.service'
import { VouchersController } from './vouchers.controller'
import { VouchersService } from './vouchers.service'

@Module({
  imports: [AuthModule, BillingModule, MailModule, PaymentsModule, WhatsAppModule],
  controllers: [VouchersController],
  providers: [VoucherCodeService, VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
