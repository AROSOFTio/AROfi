import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import {
  AccessScopeService,
  AuthenticatedAdminUser,
  JwtAuthGuard,
  PermissionsGuard,
} from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { SessionsService } from './sessions.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.sessionsRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.sessionsService.getOverview(scopedTenantId)
  }
}
