import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PaymentsModule } from '../payments/payments.module'
import { SmsController } from './sms.controller'
import { SmsService } from './sms.service'

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
