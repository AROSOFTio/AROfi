import { Body, Controller, Get, Headers, Param, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { RecordRadiusAccountingEventDto } from './dto/record-radius-accounting-event.dto'
import { RecordRadiusAuthEventDto } from './dto/record-radius-auth-event.dto'
import { RadiusService } from './radius.service'

@Controller('radius')
export class RadiusController {
  constructor(
    private readonly radiusService: RadiusService,
    private readonly accessScope: AccessScopeService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.sessionsRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.radiusService.getOverview(scopedTenantId)
  }

  @Post('auth-events')
  recordAuthEvent(@Body() dto: RecordRadiusAuthEventDto, @Headers('x-radius-api-key') apiKey?: string) {
    this.assertInternalRadiusAccess(apiKey)
    return this.radiusService.recordAuthEvent(dto)
  }

  @Post('accounting-events')
  recordAccountingEvent(@Body() dto: RecordRadiusAccountingEventDto, @Headers('x-radius-api-key') apiKey?: string) {
    this.assertInternalRadiusAccess(apiKey)
    return this.radiusService.recordAccountingEvent(dto)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post('activations/:activationId/reset-device')
  resetDeviceBinding(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('activationId') activationId: string,
    @Body() body: { newMacAddress?: string; reason: string },
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.radiusService.resetDeviceBinding({
      activationId,
      tenantId,
      adminUserId: user.id,
      newMacAddress: body.newMacAddress,
      reason: body.reason,
    })
  }

  private assertInternalRadiusAccess(apiKey?: string) {
    const configured = this.configService.get<string>('RADIUS_INTERNAL_API_KEY')
    if (!configured || apiKey !== configured) {
      throw new UnauthorizedException('RADIUS internal API key is required')
    }
  }
}

