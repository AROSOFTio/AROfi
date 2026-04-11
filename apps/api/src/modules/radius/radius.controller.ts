import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import {
  AccessScopeService,
  AuthenticatedAdminUser,
  JwtAuthGuard,
  PermissionsGuard,
} from '../auth/auth.module'
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
  ) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.sessionsRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.radiusService.getOverview(scopedTenantId)
  }

  @Post('auth-events')
  recordAuthEvent(@Body() dto: RecordRadiusAuthEventDto) {
    return this.radiusService.recordAuthEvent(dto)
  }

  @Post('accounting-events')
  recordAccountingEvent(@Body() dto: RecordRadiusAccountingEventDto) {
    return this.radiusService.recordAccountingEvent(dto)
  }
}
