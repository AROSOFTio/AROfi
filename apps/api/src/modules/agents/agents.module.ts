import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { AgentsController } from './agents.controller'
import { AgentsService } from './agents.service'

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
