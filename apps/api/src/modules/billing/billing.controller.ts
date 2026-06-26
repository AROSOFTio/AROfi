import { Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { BillingService } from './billing.service'
import type { BillingReportFilters } from './billing.service'
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
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string, @Query() query?: BillingReportFilters) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.billingService.getOverview(scopedTenantId, query)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('sales')
  getSales(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string, @Query() query?: BillingReportFilters) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.billingService.getSales(scopedTenantId, query)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('sales-by-tenant')
  getSalesByTenant(@CurrentUser() user: AuthenticatedAdminUser, @Query() query?: BillingReportFilters) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can view sales broken down by vendor/tenant')
    }
    return this.billingService.getSalesByTenant(query)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('transactions')
  getTransactions(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string, @Query() query?: BillingReportFilters) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.billingService.getTransactions(scopedTenantId, query)
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

