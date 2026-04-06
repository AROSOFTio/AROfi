import { Module } from '@nestjs/common'
import { BillingModule } from '../billing/billing.module'
import { VoucherCodeService } from './voucher-code.service'
import { VouchersController } from './vouchers.controller'
import { VouchersService } from './vouchers.service'

@Module({
  imports: [BillingModule],
  controllers: [VouchersController],
  providers: [VoucherCodeService, VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
