import { Module } from '@nestjs/common'
import { PaymentsModule } from '../payments/payments.module'
import { SessionsModule } from '../sessions/sessions.module'
import { VouchersModule } from '../vouchers/vouchers.module'
import { PortalController } from './portal.controller'
import { PortalService } from './portal.service'

@Module({
  imports: [PaymentsModule, SessionsModule, VouchersModule],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
