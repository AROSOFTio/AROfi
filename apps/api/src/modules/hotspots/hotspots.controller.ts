import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CreateHotspotDto } from './dto/create-hotspot.dto'
import { HotspotsService } from './hotspots.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('hotspots')
export class HotspotsController {
  constructor(
    private readonly hotspotsService: HotspotsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.hotspotsRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.hotspotsService.getOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.hotspotsManage)
  @Post()
  createHotspot(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateHotspotDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.hotspotsService.createHotspot({
      ...dto,
      tenantId,
    })
  }
}

