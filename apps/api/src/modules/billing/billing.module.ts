import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BillingController } from './billing.controller'
import { BillingPostingService } from './billing-posting.service'
import { BillingService } from './billing.service'
import { FeeEngineService } from './fee-engine.service'

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [FeeEngineService, BillingPostingService, BillingService],
  exports: [FeeEngineService, BillingPostingService, BillingService],
})
export class BillingModule {}
