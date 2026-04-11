import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  AccessScopeService,
  AuthenticatedAdminUser,
  JwtAuthGuard,
  PermissionsGuard,
} from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CreateRouterDto } from './dto/create-router.dto'
import { CreateRouterGroupDto } from './dto/create-router-group.dto'
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
}
