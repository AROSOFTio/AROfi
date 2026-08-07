import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { AgentVoucherMetricsService } from './agent-voucher-metrics.service'
import { AgentsController } from './agents.controller'
import { AgentsService } from './agents.service'
import { VoucherDashboardController } from './voucher-dashboard.controller'
import { VoucherDashboardService } from './voucher-dashboard.service'

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [AgentsController, VoucherDashboardController],
  providers: [AgentsService, AgentVoucherMetricsService, VoucherDashboardService],
  exports: [AgentsService, AgentVoucherMetricsService, VoucherDashboardService],
})
export class AgentsModule {}
