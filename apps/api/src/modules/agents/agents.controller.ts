import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { AgentsService } from './agents.service'
import { AgentFloatAdjustmentDto } from './dto/agent-float-adjustment.dto'
import { CreateAgentDto } from './dto/create-agent.dto'
import { CreateDisbursementDto } from './dto/create-disbursement.dto'
import { CreateSettlementDto } from './dto/create-settlement.dto'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.agentsService.getOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Get('float/overview')
  getFloatOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.agentsService.getFloatOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsRead)
  @Get('disbursements/overview')
  getDisbursementOverview(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.agentsService.getDisbursementOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsManage)
  @Post()
  createAgent(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateAgentDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.agentsService.createAgent({
      ...dto,
      tenantId,
    })
  }

  @RequirePermissions(PERMISSIONS.floatManage)
  @Post(':agentId/float-topups')
  loadFloat(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('agentId') agentId: string,
    @Body() dto: AgentFloatAdjustmentDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.agentsService.loadFloat(agentId, dto, tenantId)
  }

  @RequirePermissions(PERMISSIONS.floatManage)
  @Post(':agentId/float-returns')
  returnFloat(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('agentId') agentId: string,
    @Body() dto: AgentFloatAdjustmentDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.agentsService.returnFloat(agentId, dto, tenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @Post(':agentId/settlements')
  createSettlement(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('agentId') agentId: string,
    @Body() dto: CreateSettlementDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.agentsService.createSettlement(agentId, dto, tenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @Post(':agentId/disbursements')
  createDisbursement(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('agentId') agentId: string,
    @Body() dto: CreateDisbursementDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.agentsService.createDisbursement(agentId, dto, tenantId)
  }
}

