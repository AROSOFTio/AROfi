import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { PaymentsModule } from '../payments/payments.module'
import { AgentSalesController, AgentSalesPublicController } from './agent-sales.controller'
import { AgentSalesService } from './agent-sales.service'
import { AgentVoucherMetricsService } from './agent-voucher-metrics.service'
import { AgentsController } from './agents.controller'
import { AgentsService } from './agents.service'
import { VoucherDashboardController } from './voucher-dashboard.controller'
import { VoucherDashboardService } from './voucher-dashboard.service'

@Module({
  imports: [AuthModule, BillingModule, PaymentsModule],
  controllers: [AgentsController, AgentSalesController, AgentSalesPublicController, VoucherDashboardController],
  providers: [AgentsService, AgentSalesService, AgentVoucherMetricsService, VoucherDashboardService],
  exports: [AgentsService, AgentSalesService, AgentVoucherMetricsService, VoucherDashboardService],
})
export class AgentsModule {}
