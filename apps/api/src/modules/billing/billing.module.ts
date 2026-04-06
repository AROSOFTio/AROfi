import { Module } from '@nestjs/common'
import { BillingController } from './billing.controller'
import { BillingPostingService } from './billing-posting.service'
import { BillingService } from './billing.service'
import { FeeEngineService } from './fee-engine.service'

@Module({
  controllers: [BillingController],
  providers: [FeeEngineService, BillingPostingService, BillingService],
  exports: [FeeEngineService, BillingPostingService, BillingService],
})
export class BillingModule {}
