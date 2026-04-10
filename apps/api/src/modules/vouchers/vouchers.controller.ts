import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CreateVoucherBatchDto } from './dto/create-voucher-batch.dto'
import { CreateVoucherTemplateDto } from './dto/create-voucher-template.dto'
import { RecordVoucherSaleDto } from './dto/record-voucher-sale.dto'
import { RedeemVoucherDto } from './dto/redeem-voucher.dto'
import { UpdateVoucherTemplateDto } from './dto/update-voucher-template.dto'
import { VouchersService } from './vouchers.service'

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.vouchersService.getOverview(tenantId)
  }

  @Get('templates')
  getTemplates(@Query('tenantId') tenantId?: string) {
    return this.vouchersService.getTemplates(tenantId)
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateVoucherTemplateDto) {
    return this.vouchersService.createTemplate(dto)
  }

  @Patch('templates/:templateId')
  updateTemplate(@Param('templateId') templateId: string, @Body() dto: UpdateVoucherTemplateDto) {
    return this.vouchersService.updateTemplate(templateId, dto)
  }

  @Post('batches')
  createBatch(@Body() dto: CreateVoucherBatchDto) {
    return this.vouchersService.createBatch(dto)
  }

  @Post(':voucherId/sale')
  recordSale(@Param('voucherId') voucherId: string, @Body() dto: RecordVoucherSaleDto) {
    return this.vouchersService.recordSale(voucherId, dto)
  }

  @Post('redeem')
  redeemVoucher(@Body() dto: RedeemVoucherDto) {
    return this.vouchersService.redeemVoucher(dto)
  }
}
