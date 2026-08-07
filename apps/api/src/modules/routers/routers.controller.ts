import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CreateRouterDto } from './dto/create-router.dto'
import { CreateRouterGroupDto } from './dto/create-router-group.dto'
import { UpdateRouterDto } from './dto/update-router.dto'
import { RoutersService } from './routers.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('routers')
export class RoutersController {
  constructor(
    private readonly routersService: RoutersService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.routersRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.routersService.getOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post('groups')
  createGroup(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateRouterGroupDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.routersService.createGroup({
      ...dto,
      tenantId,
    })
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post()
  createRouter(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateRouterDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.routersService.createRouter({
      ...dto,
      tenantId,
    })
  }

  @RequirePermissions(PERMISSIONS.routersRead)
  @Get(':routerId/setup')
  getRouterSetup(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.getRouterSetup(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post(':routerId/health-check')
  runHealthCheck(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.runHealthCheck(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post(':routerId/rotate-radius-secret')
  rotateRadiusSecret(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.rotateRadiusSecret(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersRead)
  @Get(':routerId/remote-access')
  getRemoteAccess(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.getRemoteAccess(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post(':routerId/remote-access/open')
  openRemotePort(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.openRemotePort(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post(':routerId/remote-access/close')
  closeRemotePort(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.closeRemotePort(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post(':routerId/remote-access/test')
  testRemoteAccess(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.testRemoteAccess(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersRead)
  @Get(':routerId/compensation')
  getCompensationOverview(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.getCompensationOverview(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post(':routerId/compensation/manual')
  manuallyCompensateLatestOutage(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('routerId') routerId: string,
    @Body() body: { activationIds?: string[] },
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    const activationIds = Array.isArray(body.activationIds)
      ? body.activationIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : []

    if (activationIds.length > 0) {
      return this.routersService.manuallyCompensateSelectedOutage(routerId, activationIds, tenantId)
    }

    // Preserve the existing endpoint behavior for older dashboard builds:
    // a request without activationIds still compensates the latest outage.
    return this.routersService.manuallyCompensateLatestOutage(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post('compensation/settings')
  updateCompensationSettings(@CurrentUser() user: AuthenticatedAdminUser, @Body() body: { enabled?: boolean }) {
    const tenantId = this.accessScope.requireTenantScope(user, user.tenantId ?? undefined)
    return this.routersService.updateCompensationSettings(tenantId, body.enabled !== false)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Post('remote-access/enable-all')
  enableAllRemotePorts(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.enableAllRemotePorts(tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Patch(':routerId')
  updateRouter(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('routerId') routerId: string,
    @Body() dto: UpdateRouterDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.updateRouter(routerId, dto, tenantId ?? undefined)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @Delete(':routerId')
  deleteRouter(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routersService.deleteRouter(routerId, tenantId ?? undefined)
  }
}
