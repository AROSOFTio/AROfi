import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { PermissionsGuard } from '../auth/permissions.guard'
import { PERMISSIONS } from '../auth/permissions.constants'
import { RequirePermissions } from '../auth/permissions.decorator'
import { VoucherDashboardFilters, VoucherDashboardService } from './voucher-dashboard.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('voucher-dashboard')
export class VoucherDashboardController {
  constructor(
    private readonly voucherDashboard: VoucherDashboardService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.vouchersRead)
  @Get()
  getDashboard(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('agentId') agentId?: string,
    @Query('territory') territory?: string,
    @Query('packageId') packageId?: string,
    @Query('batchId') batchId?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.voucherDashboard.getDashboard(
      scopedTenantId,
      this.filters({ from, to, agentId, territory, packageId, batchId }),
    )
  }

  @RequirePermissions(PERMISSIONS.vouchersRead)
  @Get('export.xlsx')
  async exportExcel(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Res() response: Response,
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('agentId') agentId?: string,
    @Query('territory') territory?: string,
    @Query('packageId') packageId?: string,
    @Query('batchId') batchId?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    const file = await this.voucherDashboard.exportExcel(
      scopedTenantId,
      this.filters({ from, to, agentId, territory, packageId, batchId }),
    )
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
  }

  @RequirePermissions(PERMISSIONS.vouchersRead)
  @Get('export.pdf')
  async exportPdf(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Res() response: Response,
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('agentId') agentId?: string,
    @Query('territory') territory?: string,
    @Query('packageId') packageId?: string,
    @Query('batchId') batchId?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    const file = await this.voucherDashboard.exportPdf(
      scopedTenantId,
      this.filters({ from, to, agentId, territory, packageId, batchId }),
    )
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
  }

  private filters(input: VoucherDashboardFilters): VoucherDashboardFilters {
    return {
      from: input.from || undefined,
      to: input.to || undefined,
      agentId: input.agentId || undefined,
      territory: input.territory || undefined,
      packageId: input.packageId || undefined,
      batchId: input.batchId || undefined,
    }
  }
}
