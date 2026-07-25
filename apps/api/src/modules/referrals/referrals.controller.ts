import { Controller, Get, Headers, UseGuards } from '@nestjs/common'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import { ReferralsService } from './referrals.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @RequirePermissions(PERMISSIONS.referralsRead)
  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedAdminUser, @Headers('origin') origin?: string) {
    return this.referralsService.getMyDashboard(user.id, origin)
  }

  @RequirePermissions(PERMISSIONS.all)
  @Get('admin')
  getAdminOverview() {
    return this.referralsService.listForAdmin()
  }
}
