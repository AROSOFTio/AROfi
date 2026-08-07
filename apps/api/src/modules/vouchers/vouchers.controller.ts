import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CreateVoucherBatchDto } from './dto/create-voucher-batch.dto'
import { CreateVoucherTemplateDto } from './dto/create-voucher-template.dto'
import { RedeemVoucherDto } from './dto/redeem-voucher.dto'
import { UpdateVoucherTemplateDto } from './dto/update-voucher-template.dto'
import { VoucherRedemptionSaleService } from './voucher-redemption-sale.service'
import { VouchersService } from './vouchers.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(
    private readonly vouchersService: VouchersService,
    private readonly voucherRedemptionSales: VoucherRedemptionSaleService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.vouchersRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.vouchersService.getOverview(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.vouchersRead)
  @Get('templates')
  getTemplates(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.vouchersService.getTemplates(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.vouchersManage)
  @Post('templates')
  createTemplate(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateVoucherTemplateDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.vouchersService.createTemplate({
      ...dto,
      tenantId,
    })
  }

  @RequirePermissions(PERMISSIONS.vouchersManage)
  @Patch('templates/:templateId')
  updateTemplate(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateVoucherTemplateDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.vouchersService.updateTemplate(templateId, dto, tenantId)
  }

  @RequirePermissions(PERMISSIONS.vouchersManage)
  @Post('batches')
  createBatch(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateVoucherBatchDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.vouchersService.createBatch({
      ...dto,
      tenantId,
    })
  }

  @RequirePermissions(PERMISSIONS.vouchersRead)
  @Get('batches/:batchId/print.pdf')
  async printBatchPdf(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('batchId') batchId: string,
    @Query('template') template: string | undefined,
    @Query('disposition') disposition: string | undefined,
    @Query('preview') preview: string | undefined,
    @Res() response: Response,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    // The fifth argument is added by the guarded build transform. Casting here
    // keeps the checked-in source compatible with both pre-transform local
    // tooling and the production build that supports preview-safe rendering.
    const renderBatchPdf = this.vouchersService.renderBatchPdf.bind(this.vouchersService) as (
      batchId: string,
      tenantId?: string,
      actorUserId?: string,
      templateId?: string,
      trackPrint?: boolean,
    ) => ReturnType<VouchersService['renderBatchPdf']>
    const file = await renderBatchPdf(batchId, tenantId, user.id, template, preview !== 'true')
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('Content-Disposition', `${disposition === 'inline' ? 'inline' : 'attachment'}; filename="${file.filename}"`)
    response.send(file.buffer)
  }

  @RequirePermissions(PERMISSIONS.vouchersRead)
  @Get('batches/:batchId/export.csv')
  async exportBatchCsv(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('batchId') batchId: string,
    @Res() response: Response,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    const file = await this.vouchersService.exportBatchCsv(batchId, tenantId)
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
  }

  @RequirePermissions(PERMISSIONS.vouchersManage)
  @Post(':voucherId/sale')
  recordSale() {
    throw new BadRequestException(
      'Voucher sales are recorded automatically only when the customer redeems the voucher.',
    )
  }

  @RequirePermissions(PERMISSIONS.vouchersManage)
  @Post('sell')
  sellVoucher() {
    throw new BadRequestException(
      'Voucher sales are recorded automatically only when the customer redeems the voucher.',
    )
  }

  @RequirePermissions(PERMISSIONS.vouchersManage)
  @Post('redeem')
  async redeemVoucher(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: RedeemVoucherDto) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    const result = await this.vouchersService.redeemVoucher(dto, tenantId)
    await this.voucherRedemptionSales.recordRedeemedVoucherAsSale(result.voucher.id)
    return result
  }

  @RequirePermissions(PERMISSIONS.vouchersManage)
  @Delete('batches/:batchId')
  deleteBatch(@CurrentUser() user: AuthenticatedAdminUser, @Param('batchId') batchId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.vouchersService.deleteBatch(batchId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.vouchersManage)
  @Delete(':voucherId')
  deleteVoucher(@CurrentUser() user: AuthenticatedAdminUser, @Param('voucherId') voucherId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.vouchersService.deleteVoucher(voucherId, tenantId)
  }
}
