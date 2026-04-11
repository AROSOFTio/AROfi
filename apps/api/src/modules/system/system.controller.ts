import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { AddSupportTicketMessageDto } from './dto/add-support-ticket-message.dto'
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto'
import { UpdateFeatureLimitDto } from './dto/update-feature-limit.dto'
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto'
import { SystemService } from './system.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('system')
export class SystemController {
  constructor(
    private readonly systemService: SystemService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.auditRead, PERMISSIONS.featureLimitsRead, PERMISSIONS.supportRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.systemService.getOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.auditRead)
  @Get('audit-logs')
  getAuditLogs(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.systemService.getAuditLogs(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.featureLimitsRead)
  @Get('feature-limits')
  getFeatureLimits(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.systemService.getFeatureLimits(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.featureLimitsManage)
  @Patch('feature-limits/:limitId')
  updateFeatureLimit(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('limitId') limitId: string,
    @Body() dto: UpdateFeatureLimitDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.systemService.updateFeatureLimit(limitId, dto, tenantId)
  }

  @RequirePermissions(PERMISSIONS.supportRead)
  @Get('support-tickets')
  getSupportTickets(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.systemService.getSupportTickets(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.supportWrite)
  @Post('support-tickets')
  createSupportTicket(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateSupportTicketDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.systemService.createSupportTicket({
      ...dto,
      tenantId,
    })
  }

  @RequirePermissions(PERMISSIONS.supportWrite)
  @Patch('support-tickets/:ticketId')
  updateSupportTicket(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: UpdateSupportTicketDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.systemService.updateSupportTicket(ticketId, dto, tenantId)
  }

  @RequirePermissions(PERMISSIONS.supportWrite)
  @Post('support-tickets/:ticketId/messages')
  addSupportTicketMessage(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: AddSupportTicketMessageDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.systemService.addSupportTicketMessage(ticketId, dto, tenantId)
  }
}

