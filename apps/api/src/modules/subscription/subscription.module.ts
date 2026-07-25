import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { EventsModule } from '../events/events.module'
import { PaymentsModule } from '../payments/payments.module'
import { SubscriptionController } from './subscription.controller'
import { SubscriptionService } from './subscription.service'

@Module({
  imports: [AuthModule, MailModule, PaymentsModule, EventsModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
