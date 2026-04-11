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
import { BillingService } from './billing.service'
import { AdjustWalletDto } from './dto/adjust-wallet.dto'
import { RecordMobileMoneySaleDto } from './dto/record-mobile-money-sale.dto'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.billingService.getOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('sales')
  getSales(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.billingService.getSales(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('transactions')
  getTransactions(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.billingService.getTransactions(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @Post('mobile-money-sales')
  recordMobileMoneySale(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: RecordMobileMoneySaleDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.billingService.recordMobileMoneySale({
      ...dto,
      tenantId,
    })
  }

  @RequirePermissions(PERMISSIONS.billingWrite)
  @Post('wallet-adjustments')
  adjustWallet(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: AdjustWalletDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.billingService.adjustWallet({
      ...dto,
      tenantId,
    })
  }
}
