import { Body, Controller, ForbiddenException, Get, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
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
      throw new ForbiddenException('Only Dev Admin can view sales broken down by business')
    }
    return this.billingService.getSalesByTenant(query)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('transactions')
  getTransactions(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string, @Query() query?: BillingReportFilters) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.billingService.getTransactions(scopedTenantId, query)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('sales/export.csv')
  async exportSalesCsv(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Res() response: Response,
    @Query('tenantId') tenantId?: string,
    @Query() query?: BillingReportFilters,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    const file = await this.billingService.exportSalesCsv(scopedTenantId, query)
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
  }

  @RequirePermissions(PERMISSIONS.billingRead)
  @Get('transactions/export.csv')
  async exportTransactionsCsv(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Res() response: Response,
    @Query('tenantId') tenantId?: string,
    @Query() query?: BillingReportFilters,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    const file = await this.billingService.exportTransactionsCsv(scopedTenantId, query)
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
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

