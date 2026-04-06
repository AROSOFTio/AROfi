import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { CreateVoucherBatchDto } from './dto/create-voucher-batch.dto'
import { RecordVoucherSaleDto } from './dto/record-voucher-sale.dto'
import { RedeemVoucherDto } from './dto/redeem-voucher.dto'
import { VouchersService } from './vouchers.service'

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.vouchersService.getOverview(tenantId)
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
