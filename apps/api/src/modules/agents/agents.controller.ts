import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { AgentVoucherMetricFilters, AgentVoucherMetricsService } from './agent-voucher-metrics.service'
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
    private readonly agentVoucherMetrics: AgentVoucherMetricsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.agentsService.getOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Get('voucher-metrics')
  getVoucherMetrics(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Query('tenantId') tenantId?: string,
    @Query('agentId') agentId?: string,
    @Query('territory') territory?: string,
    @Query('packageId') packageId?: string,
    @Query('batchId') batchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ownerType') ownerType?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.agentVoucherMetrics.getOverview(
      scopedTenantId,
      this.buildVoucherMetricFilters({
        agentId,
        territory,
        packageId,
        batchId,
        from,
        to,
        ownerType,
      }),
    )
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Get('voucher-metrics/export.csv')
  async exportVoucherMetricsCsv(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Res() response: Response,
    @Query('tenantId') tenantId?: string,
    @Query('agentId') agentId?: string,
    @Query('territory') territory?: string,
    @Query('packageId') packageId?: string,
    @Query('batchId') batchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ownerType') ownerType?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    const file = await this.agentVoucherMetrics.exportCsv(
      scopedTenantId,
      this.buildVoucherMetricFilters({
        agentId,
        territory,
        packageId,
        batchId,
        from,
        to,
        ownerType,
      }),
    )
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
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

  @RequirePermissions(PERMISSIONS.agentsManage)
  @Patch(':agentId')
  updateAgent(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('agentId') agentId: string,
    @Body() dto: Partial<CreateAgentDto> & { status?: string },
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.agentsService.updateAgent(agentId, dto, tenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsManage)
  @Post(':agentId/deactivate')
  deactivateAgent(@CurrentUser() user: AuthenticatedAdminUser, @Param('agentId') agentId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.agentsService.updateAgent(agentId, { status: 'DISABLED' }, tenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsManage)
  @Post(':agentId/activate')
  activateAgent(@CurrentUser() user: AuthenticatedAdminUser, @Param('agentId') agentId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.agentsService.updateAgent(agentId, { status: 'ACTIVE' }, tenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsManage)
  @Delete(':agentId')
  deleteAgent(@CurrentUser() user: AuthenticatedAdminUser, @Param('agentId') agentId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.agentsService.deleteAgent(agentId, tenantId)
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

  @RequirePermissions(PERMISSIONS.disbursementsRead)
  @Get('disbursements/export.csv')
  async exportDisbursementsCsv(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Res() response: Response,
    @Query('tenantId') tenantId?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    const file = await this.agentsService.exportDisbursementsCsv(scopedTenantId)
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @Post('settlements/:settlementId/cancel')
  cancelSettlement(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('settlementId') settlementId: string,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.agentsService.cancelSettlement(settlementId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsRead)
  @Get('settlements/:settlementId/receipt.pdf')
  async getSettlementReceipt(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('settlementId') settlementId: string,
    @Res() response: Response,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    const file = await this.agentsService.renderSettlementReceipt(settlementId, tenantId)
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
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

  private buildVoucherMetricFilters(input: {
    agentId?: string
    territory?: string
    packageId?: string
    batchId?: string
    from?: string
    to?: string
    ownerType?: string
  }): AgentVoucherMetricFilters {
    const ownerType =
      input.ownerType === 'AGENT' ||
      input.ownerType === 'MAIN' ||
      input.ownerType === 'ALL'
        ? input.ownerType
        : undefined

    return {
      agentId: input.agentId || undefined,
      territory: input.territory || undefined,
      packageId: input.packageId || undefined,
      batchId: input.batchId || undefined,
      from: input.from || undefined,
      to: input.to || undefined,
      ownerType,
    }
  }
}
