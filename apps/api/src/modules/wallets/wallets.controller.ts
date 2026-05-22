import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { WalletsService } from './wallets.service'
import { RegisterPayoutNumberDto } from './dto/register-payout-number.dto'
import { RequestPayoutNumberChangeDto } from './dto/request-payout-number-change.dto'
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto'
import { SetPayoutSecretDto } from './dto/set-payout-secret.dto'

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
  @Get('payouts/profile/me')
  getPayoutProfile(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.walletsService.getPayoutProfile(tenantId)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @Post('payouts/secret')
  setPayoutSecret(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: SetPayoutSecretDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.walletsService.setPayoutSecret(tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @Post('payouts/numbers')
  registerPayoutNumber(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: RegisterPayoutNumberDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.walletsService.registerPayoutNumber(tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @Post('payouts/number-change-requests')
  requestPayoutNumberChange(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Body() dto: RequestPayoutNumberChangeDto,
  ) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.walletsService.requestPayoutNumberChange(tenantId, dto, user.id)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @Post('withdrawals')
  requestWithdrawal(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: RequestWithdrawalDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.walletsService.requestWithdrawal(tenantId, dto, user.id)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get(':tenantId')
  getWallet(@CurrentUser() user: AuthenticatedAdminUser, @Param('tenantId') tenantId: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.walletsService.getWallet(tenantId, scopedTenantId)
  }
}

