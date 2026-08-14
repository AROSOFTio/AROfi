import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import { AgentSalesService } from './agent-sales.service'
import {
  AgentCashSaleDto,
  AgentMobileMoneySaleDto,
  CreateAgentActivationClaimDto,
  RecordAgentCashSettlementDto,
  UpdateAgentSalesPolicyDto,
} from './dto/agent-sales.dto'

@Controller('agent-sales')
export class AgentSalesPublicController {
  constructor(private readonly agentSales: AgentSalesService) {}

  @Post('claims')
  createClaim(@Body() dto: CreateAgentActivationClaimDto) {
    return this.agentSales.createClaim(dto)
  }

  @Get('claims/status')
  getClaimStatus(@Query('token') token: string) {
    return this.agentSales.getClaimStatus(token)
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agent-sales')
export class AgentSalesController {
  constructor(
    private readonly agentSales: AgentSalesService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Get('me/dashboard')
  getMyDashboard(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.agentSales.getMyDashboard(user.email, tenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Post('me/cash-sale')
  recordCashSale(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: AgentCashSaleDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.agentSales.recordCashSale(user.email, tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Post('me/mobile-money')
  initiateMobileMoneySale(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: AgentMobileMoneySaleDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.agentSales.initiateMobileMoneySale(user.email, tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Post('me/mobile-money/:paymentId/status')
  checkMobileMoneySale(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('paymentId') paymentId: string,
  ) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.agentSales.checkMyMobileMoneyPayment(user.email, tenantId, paymentId)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.agentSales.getOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsManage)
  @Patch('agents/:agentId/policy')
  updatePolicy(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentSalesPolicyDto,
    @Query('tenantId') tenantId?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.agentSales.updatePolicy(agentId, scopedTenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.agentsManage)
  @Post('cash-settlements')
  recordCashSettlement(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Body() dto: RecordAgentCashSettlementDto,
    @Query('tenantId') tenantId?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.agentSales.recordCashSettlement(scopedTenantId, dto)
  }
}
