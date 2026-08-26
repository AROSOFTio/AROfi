import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { PaymentsModule } from '../payments/payments.module'
import { AgentAccountingController } from './agent-accounting.controller'
import { AgentAccountingService } from './agent-accounting.service'
import { AgentDashboardService } from './agent-dashboard.service'
import { AgentOverviewService } from './agent-overview.service'
import { AgentSalesController, AgentSalesPublicController } from './agent-sales.controller'
import { AgentSalesService } from './agent-sales.service'
import { AgentVoucherMetricsService } from './agent-voucher-metrics.service'
import { AgentVoucherStockController } from './agent-voucher-stock.controller'
import { AgentVoucherStockService } from './agent-voucher-stock.service'
import { AgentsController } from './agents.controller'
import { AgentsService } from './agents.service'
import { VoucherDashboardController } from './voucher-dashboard.controller'
import { VoucherDashboardService } from './voucher-dashboard.service'

@Module({
  imports: [AuthModule, BillingModule, PaymentsModule],
  controllers: [
    AgentsController,
    AgentSalesController,
    AgentSalesPublicController,
    AgentAccountingController,
    AgentVoucherStockController,
    VoucherDashboardController,
  ],
  providers: [
    AgentsService,
    AgentSalesService,
    AgentDashboardService,
    AgentOverviewService,
    AgentAccountingService,
    AgentVoucherStockService,
    AgentVoucherMetricsService,
    VoucherDashboardService,
  ],
  exports: [
    AgentsService,
    AgentSalesService,
    AgentDashboardService,
    AgentOverviewService,
    AgentAccountingService,
    AgentVoucherStockService,
    AgentVoucherMetricsService,
    VoucherDashboardService,
  ],
})
export class AgentsModule {}
