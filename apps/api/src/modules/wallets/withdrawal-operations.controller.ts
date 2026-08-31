import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PermissionsGuard } from '../auth/permissions.guard'
import { InvalidateRedisCache } from '../../common/cache/redis-cache.decorators'
import { WithdrawalOperationsService } from './withdrawal-operations.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('wallets/withdrawals')
export class WithdrawalOperationsController {
  constructor(
    private readonly operations: WithdrawalOperationsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get(':disbursementId/diagnostics')
  diagnostics(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('disbursementId') disbursementId: string,
    @Query('tenantId') tenantId?: string,
    @Query('checkProvider') checkProvider?: string,
  ) {
    const scopedTenantId = this.resolveScope(user, tenantId)
    return this.operations.getDiagnostics(disbursementId, scopedTenantId, checkProvider === 'true')
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @InvalidateRedisCache('wallets:withdrawals-all', 'wallets:payouts-profile')
  @Post(':disbursementId/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('disbursementId') disbursementId: string,
    @Body() body: { reason?: string },
    @Query('tenantId') tenantId?: string,
  ) {
    const scopedTenantId = this.resolveScope(user, tenantId)
    return this.operations.cancelWithdrawal(
      disbursementId,
      user.id,
      body.reason?.trim() || 'Cancelled from Wallet & Earnings',
      scopedTenantId,
    )
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @InvalidateRedisCache('wallets:withdrawals-all', 'wallets:payouts-profile')
  @Post(':disbursementId/refresh-status')
  refreshStatus(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('disbursementId') disbursementId: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const scopedTenantId = this.resolveScope(user, tenantId)
    return this.operations.refreshProviderStatus(disbursementId, user.id, scopedTenantId)
  }

  private resolveScope(user: AuthenticatedAdminUser, requestedTenantId?: string) {
    if (this.accessScope.isSuperAdmin(user)) {
      return requestedTenantId?.trim() || undefined
    }
    return this.accessScope.resolveTenantScope(user, requestedTenantId) ?? this.accessScope.requireTenantScope(user)
  }
}
