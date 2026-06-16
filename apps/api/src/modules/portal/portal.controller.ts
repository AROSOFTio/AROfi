import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common'
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
    @Query('mac') macAddress?: string,
    @Query('ip') ipAddress?: string,
    @Query('routerId') routerId?: string,
    @Query('routerKey') routerKey?: string,
    @Query('server') hotspotServerName?: string,
    @Query('loginUrl') loginUrl?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.portalService.getContext(tenantDomain, phoneNumber, authorization, {
      macAddress,
      ipAddress,
      routerId,
      routerKey,
      hotspotServerName,
      loginUrl,
    })
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
  redeemVoucher(@Body() dto: PortalRedeemVoucherDto, @Headers('user-agent') userAgent?: string) {
    return this.portalService.redeemVoucher(dto, userAgent)
  }

  @Post('reconnect')
  reconnect(
    @Body()
    dto: {
      macAddress?: string
      ipAddress?: string
      routerId?: string
      routerKey?: string
      hotspotServerName?: string
      loginUrl?: string
    },
  ) {
    return this.portalService.reconnect(dto)
  }

  @Post('support-tickets')
  createSupportTicket(
    @Body()
    dto: {
      tenantId: string
      phoneNumber?: string
      subject: string
      category: string
      body?: string
      customerReference?: string
    },
  ) {
    return this.portalService.createPortalSupportTicket(dto)
  }

  @Get('support-tickets/by-reference/:reference')
  getSupportTicket(
    @Param('reference') reference: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.portalService.getPortalSupportTicket(reference, tenantId)
  }
}
