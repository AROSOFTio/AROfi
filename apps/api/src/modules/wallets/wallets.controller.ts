import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { DisbursementStatus } from '@prisma/client'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { InvalidateRedisCache, RedisCache } from '../../common/cache/redis-cache.decorators'
import { WalletsService } from './wallets.service'
import { RegisterPayoutNumberDto } from './dto/register-payout-number.dto'
import { RequestPayoutNumberChangeDto } from './dto/request-payout-number-change.dto'
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto'
import { SetPayoutSecretDto } from './dto/set-payout-secret.dto'
import { TopUpWalletDto } from './dto/topup-wallet.dto'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get()
  listWallets(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.walletsService.listWallets(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @RedisCache({ namespace: 'wallets:payouts-profile', ttlSeconds: 8 })
  @Get('payouts/profile/me')
  getPayoutProfile(@CurrentUser() user: AuthenticatedAdminUser) {
    const isSuper = this.accessScope.isSuperAdmin(user)
    const tenantId = isSuper ? 'platform' : this.accessScope.requireTenantScope(user)
    return this.walletsService.getPayoutProfile(tenantId)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @InvalidateRedisCache('wallets:payouts-profile')
  @Post('payouts/secret')
  setPayoutSecret(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: SetPayoutSecretDto) {
    const isSuper = this.accessScope.isSuperAdmin(user)
    const tenantId = isSuper ? 'platform' : this.accessScope.requireTenantScope(user)
    return this.walletsService.setPayoutSecret(tenantId, dto, user.id)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @Post('payouts/secret/reset/request')
  requestPayoutSecretReset(@CurrentUser() user: AuthenticatedAdminUser) {
    const isSuper = this.accessScope.isSuperAdmin(user)
    const tenantId = isSuper ? 'platform' : this.accessScope.requireTenantScope(user)
    return this.walletsService.requestPayoutSecretReset(tenantId, user.id)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @InvalidateRedisCache('wallets:payouts-profile')
  @Post('payouts/secret/reset/confirm')
  confirmPayoutSecretReset(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Body() dto: { token: string; secretKey: string },
  ) {
    const isSuper = this.accessScope.isSuperAdmin(user)
    const tenantId = isSuper ? 'platform' : this.accessScope.requireTenantScope(user)
    return this.walletsService.confirmPayoutSecretReset(tenantId, dto, user.id)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @InvalidateRedisCache('wallets:payouts-profile')
  @Post('payouts/numbers')
  registerPayoutNumber(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: RegisterPayoutNumberDto) {
    const isSuper = this.accessScope.isSuperAdmin(user)
    const tenantId = isSuper ? 'platform' : this.accessScope.requireTenantScope(user)
    return this.walletsService.registerPayoutNumber(tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @InvalidateRedisCache('wallets:payouts-profile')
  @Post('payouts/number-change-requests')
  requestPayoutNumberChange(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Body() dto: RequestPayoutNumberChangeDto,
  ) {
    const isSuper = this.accessScope.isSuperAdmin(user)
    const tenantId = isSuper ? 'platform' : this.accessScope.requireTenantScope(user)
    return this.walletsService.requestPayoutNumberChange(tenantId, dto, user.id)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @InvalidateRedisCache('wallets:withdrawals-all', 'wallets:payouts-profile')
  @Post('withdrawals')
  requestWithdrawal(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: RequestWithdrawalDto) {
    const isSuper = this.accessScope.isSuperAdmin(user)
    const tenantId = isSuper ? 'platform' : this.accessScope.requireTenantScope(user)
    return this.walletsService.requestWithdrawal(tenantId, dto, user.id)
  }

  @RequirePermissions(PERMISSIONS.disbursementsRead)
  @RedisCache({ namespace: 'wallets:withdrawals-all', ttlSeconds: 8 })
  @Get('withdrawals/all')
  listVendorWithdrawals(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: DisbursementStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.walletsService.listVendorWithdrawals({ tenantId: scopedTenantId, status, from, to })
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @InvalidateRedisCache('wallets:withdrawals-all', 'wallets:payouts-profile')
  @Post('withdrawals/:disbursementId/approve')
  approveWithdrawal(@CurrentUser() user: AuthenticatedAdminUser, @Param('disbursementId') disbursementId: string) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can approve business withdrawals')
    }
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.walletsService.approveWithdrawal(disbursementId, user.id, scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @InvalidateRedisCache('wallets:withdrawals-all', 'wallets:payouts-profile')
  @Post('withdrawals/:disbursementId/reject')
  rejectWithdrawal(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('disbursementId') disbursementId: string,
    @Body() body: { reason?: string },
  ) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can reject business withdrawals')
    }
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.walletsService.rejectWithdrawal(disbursementId, user.id, body.reason?.trim() || 'Rejected by Dev Admin', scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @InvalidateRedisCache('wallets:withdrawals-all', 'wallets:payouts-profile')
  @Post('withdrawals/:disbursementId/retry')
  retryWithdrawal(@CurrentUser() user: AuthenticatedAdminUser, @Param('disbursementId') disbursementId: string) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can retry business withdrawals')
    }
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.walletsService.retryFailedWithdrawal(disbursementId, scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @InvalidateRedisCache('wallets:payouts-profile')
  @Post('payouts/numbers/:numberId/approve')
  approvePayoutNumber(@CurrentUser() user: AuthenticatedAdminUser, @Param('numberId') numberId: string) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can approve payout numbers')
    }
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.walletsService.approvePayoutNumber(numberId, user.id, scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @InvalidateRedisCache('wallets:payouts-profile')
  @Post('payouts/numbers/:numberId/reject')
  rejectPayoutNumber(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('numberId') numberId: string,
    @Body() body: { reason?: string },
  ) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can reject payout numbers')
    }
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.walletsService.rejectPayoutNumber(numberId, user.id, body.reason?.trim() || 'Rejected by Dev Admin', scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @InvalidateRedisCache('wallets:payouts-profile')
  @Post('payouts/number-change-requests/:requestId/approve')
  approvePayoutNumberChange(@CurrentUser() user: AuthenticatedAdminUser, @Param('requestId') requestId: string) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can approve payout number changes')
    }
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.walletsService.approvePayoutNumberChange(requestId, user.id, scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.disbursementsManage)
  @InvalidateRedisCache('wallets:payouts-profile')
  @Post('payouts/number-change-requests/:requestId/reject')
  rejectPayoutNumberChange(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('requestId') requestId: string,
    @Body() body: { reason?: string },
  ) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can reject payout number changes')
    }
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.walletsService.rejectPayoutNumberChange(requestId, user.id, body.reason?.trim() || 'Rejected by Dev Admin', scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @Post('topup')
  initiateTopup(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: TopUpWalletDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.walletsService.initiateTopup(tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('topup/:reference/status')
  checkTopupStatus(@CurrentUser() user: AuthenticatedAdminUser, @Param('reference') reference: string) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.walletsService.checkTopupStatus(reference, tenantId)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get(':tenantId')
  getWallet(@CurrentUser() user: AuthenticatedAdminUser, @Param('tenantId') tenantId: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.walletsService.getWallet(tenantId, scopedTenantId)
  }
}
