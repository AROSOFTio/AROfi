import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
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

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  login(@Body() dto: PortalLoginDto) {
    return this.portalService.login(dto)
  }

  @Get('session')
  getSession(@Headers('authorization') authorization?: string) {
    return this.portalService.getSession(authorization)
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('redeem-voucher')
  redeemVoucher(@Body() dto: PortalRedeemVoucherDto, @Headers('user-agent') userAgent?: string) {
    return this.portalService.redeemVoucher(dto, userAgent)
  }

  @Throttle({ default: { ttl: 60_000, limit: 15 } })
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

  // Recovery probes for payments/vouchers by phone or reference — the
  // tightest throttle on the portal so existence cannot be enumerated.
  @Throttle({ default: { ttl: 300_000, limit: 5 } })
  @Post('recover-voucher')
  recoverVoucher(
    @Body()
    dto: {
      transactionId: string
      routerKey?: string
      macAddress?: string
      ipAddress?: string
      routerId?: string
      hotspotServerName?: string
      loginUrl?: string
    },
  ) {
    return this.portalService.recoverVoucher(dto)
  }

  @Throttle({ default: { ttl: 300_000, limit: 5 } })
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
