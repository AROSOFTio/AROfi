import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
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
  @Get()
  findAll(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.tenantsService.findAll(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.tenantsManage)
  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto)
  }
}

