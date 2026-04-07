import { Module } from '@nestjs/common'
import { BillingModule } from '../billing/billing.module'
import { AgentsController } from './agents.controller'
import { AgentsService } from './agents.service'

@Module({
  imports: [BillingModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
