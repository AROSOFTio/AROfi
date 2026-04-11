import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { WalletsService } from './wallets.service'

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
  @Get(':tenantId')
  getWallet(@CurrentUser() user: AuthenticatedAdminUser, @Param('tenantId') tenantId: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.walletsService.getWallet(tenantId, scopedTenantId)
  }
}

