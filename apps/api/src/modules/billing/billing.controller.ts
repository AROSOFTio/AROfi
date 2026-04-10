import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/auth.module'
import { BillingService } from './billing.service'
import { AdjustWalletDto } from './dto/adjust-wallet.dto'
import { RecordMobileMoneySaleDto } from './dto/record-mobile-money-sale.dto'

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.billingService.getOverview(tenantId)
  }

  @Get('sales')
  getSales(@Query('tenantId') tenantId?: string) {
    return this.billingService.getSales(tenantId)
  }

  @Get('transactions')
  getTransactions(@Query('tenantId') tenantId?: string) {
    return this.billingService.getTransactions(tenantId)
  }

  @Post('mobile-money-sales')
  recordMobileMoneySale(@Body() dto: RecordMobileMoneySaleDto) {
    return this.billingService.recordMobileMoneySale(dto)
  }

  @Post('wallet-adjustments')
  adjustWallet(@Body() dto: AdjustWalletDto) {
    return this.billingService.adjustWallet(dto)
  }
}
