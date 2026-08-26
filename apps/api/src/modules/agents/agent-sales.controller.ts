import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { InvalidateRedisCache, RedisCache } from '../../common/cache/redis-cache.decorators'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import { AgentDashboardService } from './agent-dashboard.service'
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
    assertLocalHotspotLoginUrl(dto.loginUrl)
    return this.agentSales.createClaim(dto)
  }

  @Get('claims/status')
  getClaimStatus(@Query('token') token: string) {
    if (!token || token.length < 32 || token.length > 128) {
      throw new BadRequestException('A valid activation status token is required.')
    }
    return this.agentSales.getClaimStatus(token)
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agent-sales')
export class AgentSalesController {
  constructor(
    private readonly agentSales: AgentSalesService,
    private readonly agentDashboard: AgentDashboardService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.agentsRead)
  @RedisCache({ namespace: 'agent:dashboard', ttlSeconds: 8, scope: 'user' })
  @Get('me/dashboard')
  getMyDashboard(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.agentDashboard.getMyDashboard(user.email, tenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @InvalidateRedisCache('agent:dashboard', 'agents:overview')
  @Post('me/cash-sale')
  recordCashSale(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: AgentCashSaleDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.agentSales.recordCashSale(user.email, tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @InvalidateRedisCache('agent:dashboard', 'agents:overview')
  @Post('me/mobile-money')
  initiateMobileMoneySale(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: AgentMobileMoneySaleDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.agentSales.initiateMobileMoneySale(user.email, tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @InvalidateRedisCache('agent:dashboard', 'agents:overview')
  @Post('me/mobile-money/:paymentId/status')
  checkMobileMoneySale(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('paymentId') paymentId: string,
  ) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.agentSales.checkMyMobileMoneyPayment(user.email, tenantId, paymentId)
  }

  @RequirePermissions(PERMISSIONS.agentsManage)
  @RedisCache({ namespace: 'agents:overview', ttlSeconds: 8 })
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.agentSales.getOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsManage)
  @InvalidateRedisCache('agent:dashboard', 'agents:overview')
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
  @InvalidateRedisCache('agent:dashboard', 'agents:overview')
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

function assertLocalHotspotLoginUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new BadRequestException('The router login address is invalid. Reopen the WiFi sign-in page and try again.')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('The router login address must use HTTP or HTTPS.')
  }

  const hostname = url.hostname.toLowerCase()
  const isPrivateIpv4 =
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  const isLocalHostname = hostname.endsWith('.wifi') || hostname.endsWith('.lan') || hostname.endsWith('.local')
  const isRouterLoginPath = url.pathname === '/login' || url.pathname.endsWith('/login')

  if ((!isPrivateIpv4 && !isLocalHostname) || !isRouterLoginPath) {
    throw new BadRequestException('The activation request must point to this WiFi router’s local login page.')
  }
}
