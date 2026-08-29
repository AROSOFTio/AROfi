import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { InvalidateRedisCache, RedisCache } from '../../common/cache/redis-cache.decorators'
import { CreateTenantDto } from './dto/create-tenant.dto'
import { TenantsService } from './tenants.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.tenantsRead)
  @RedisCache({ namespace: 'tenants:list', ttlSeconds: 8 })
  @Get()
  findAll(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.tenantsService.findAll(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.tenantsManage)
  @InvalidateRedisCache('tenants:list')
  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto)
  }

  @RequirePermissions(PERMISSIONS.tenantsManage)
  @InvalidateRedisCache('tenants:list')
  @Delete(':id')
  deleteTenant(@CurrentUser() user: AuthenticatedAdminUser, @Param('id') id: string) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only SuperAdmins can delete businesses')
    }
    return this.tenantsService.deleteTenant(id)
  }
}
