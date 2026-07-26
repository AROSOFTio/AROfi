import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common'
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

  @RequirePermissions(PERMISSIONS.referralsRead)
  @Post('withdrawals')
  requestWithdrawal(@CurrentUser() user: AuthenticatedAdminUser, @Body() body: { amountUgx?: number; payoutPhone?: string }) {
    return this.referralsService.requestWithdrawal(user.id, body)
  }

  @RequirePermissions(PERMISSIONS.all)
  @Get('admin')
  getAdminOverview() {
    return this.referralsService.listForAdmin()
  }

  @RequirePermissions(PERMISSIONS.all)
  @Post('admin/withdrawals/:transactionId/approve')
  approveWithdrawal(@CurrentUser() user: AuthenticatedAdminUser, @Param('transactionId') transactionId: string) {
    return this.referralsService.approveWithdrawal(transactionId, user.id)
  }

  @RequirePermissions(PERMISSIONS.all)
  @Post('admin/withdrawals/:transactionId/reject')
  rejectWithdrawal(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('transactionId') transactionId: string,
    @Body() body: { reason?: string },
  ) {
    return this.referralsService.rejectWithdrawal(transactionId, user.id, body.reason?.trim() || 'Rejected by Dev Admin')
  }
}
