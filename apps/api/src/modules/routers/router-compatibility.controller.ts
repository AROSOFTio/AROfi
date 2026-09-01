import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import { InvalidateRedisCache } from '../../common/cache/redis-cache.decorators'
import { RegisterCompatibleRouterDto } from './dto/router-compatibility.dto'
import { RouterCompatibilityService } from './router-compatibility.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('router-compatibility')
export class RouterCompatibilityController {
  constructor(
    private readonly compatibility: RouterCompatibilityService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.routersRead)
  @Get('profiles')
  getProfiles() {
    return this.compatibility.getProfiles()
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @InvalidateRedisCache('routers:overview', 'hotspots:overview')
  @Post('register')
  register(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: RegisterCompatibleRouterDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.compatibility.register(tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.routersRead)
  @Get(':routerId/setup')
  getSetup(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.compatibility.getSetup(routerId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @InvalidateRedisCache('routers:overview')
  @Post(':routerId/verify')
  verify(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.compatibility.verify(routerId, tenantId)
  }
}
