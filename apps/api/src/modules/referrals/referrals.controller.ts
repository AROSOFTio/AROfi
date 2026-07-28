import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
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
  requestWithdrawal(@CurrentUser() user: AuthenticatedAdminUser, @Body() body: { amountUgx?: number; payoutNumberId?: string; secretKey?: string }) {
    return this.referralsService.requestWithdrawal(user.id, body)
  }

  @RequirePermissions(PERMISSIONS.all)
  @Get('admin')
  getAdminOverview() {
    return this.referralsService.listForAdmin()
  }

  @RequirePermissions(PERMISSIONS.all)
  @Get('admin/export/referrals.csv')
  async exportReferrals(@Res() response: Response) {
    const file = await this.referralsService.exportReferralsCsv()
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
  }

  @RequirePermissions(PERMISSIONS.all)
  @Get('admin/export/withdrawals.csv')
  async exportWithdrawals(@Res() response: Response) {
    const file = await this.referralsService.exportWithdrawalsCsv()
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
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

  @RequirePermissions(PERMISSIONS.all)
  @Post('admin/profiles/:profileId/suspend')
  suspendProfile(@CurrentUser() user: AuthenticatedAdminUser, @Param('profileId') profileId: string, @Body() body: { reason?: string }) {
    return this.referralsService.suspendProfile(profileId, user.id, body.reason?.trim() || 'Suspended by Dev Admin')
  }

  @RequirePermissions(PERMISSIONS.all)
  @Post('admin/profiles/:profileId/reactivate')
  reactivateProfile(@CurrentUser() user: AuthenticatedAdminUser, @Param('profileId') profileId: string, @Body() body: { reason?: string }) {
    return this.referralsService.reactivateProfile(profileId, user.id, body.reason?.trim() || 'Reactivated by Dev Admin')
  }

}
