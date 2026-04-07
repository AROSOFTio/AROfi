import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common'
import { PortalLoginDto } from './dto/portal-login.dto'
import { PortalRedeemVoucherDto } from './dto/portal-redeem-voucher.dto'
import { PortalService } from './portal.service'

@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('context')
  getContext(
    @Query('tenantDomain') tenantDomain?: string,
    @Query('phoneNumber') phoneNumber?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.portalService.getContext(tenantDomain, phoneNumber, authorization)
  }

  @Post('login')
  login(@Body() dto: PortalLoginDto) {
    return this.portalService.login(dto)
  }

  @Get('session')
  getSession(@Headers('authorization') authorization?: string) {
    return this.portalService.getSession(authorization)
  }

  @Post('redeem-voucher')
  redeemVoucher(@Body() dto: PortalRedeemVoucherDto) {
    return this.portalService.redeemVoucher(dto)
  }
}
