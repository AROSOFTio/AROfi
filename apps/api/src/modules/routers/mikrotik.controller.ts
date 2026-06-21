import { Controller, Get, Header, NotFoundException, Param, Query, Req } from '@nestjs/common'
import { RoutersService } from './routers.service'

type MikrotikReportQuery = Record<string, string | string[] | undefined>

@Controller('mikrotik')
export class MikrotikController {
  constructor(private readonly routersService: RoutersService) {}

  @Get('script/:key')
  @Header('Content-Type', 'text/plain')
  async getProvisioningScript(@Param('key') key: string) {
    const script = await this.routersService.getProvisioningScriptByKey(key)
    if (!script) {
      throw new NotFoundException('Router provisioning script not found')
    }
    return script
  }

  @Get('login-html/:key')
  @Header('Content-Type', 'text/html')
  async getLoginHtml(@Param('key') key: string) {
    const html = await this.routersService.getMikrotikLoginHtmlByKey(key)
    if (!html) {
      throw new NotFoundException('Router login.html not found')
    }
    return html
  }

  @Get('provisioned/:key')
  async markProvisioned(
    @Param('key') key: string,
    @Req() request: any,
    @Query() query: MikrotikReportQuery,
  ) {
    const selfReportedNasIp = this.firstQueryValue(query.nasIp)
    const httpSourceIp = this.resolveSourceIp(request)
    const sourceIp = selfReportedNasIp?.trim() || httpSourceIp
    const result = await this.routersService.markRouterProvisionedByKey(key, sourceIp, query)
    if (!result) {
      throw new NotFoundException('Router registration key not found')
    }
    return result
  }

  @Get('self-test/:key')
  async recordSelfTest(
    @Param('key') key: string,
    @Req() request: any,
    @Query() query: MikrotikReportQuery,
  ) {
    const selfReportedNasIp = this.firstQueryValue(query.nasIp)
    const httpSourceIp = this.resolveSourceIp(request)
    const sourceIp = selfReportedNasIp?.trim() || httpSourceIp
    const result = await this.routersService.recordProvisioningSelfTestByKey(key, sourceIp, query)
    if (!result) {
      throw new NotFoundException('Router registration key not found')
    }
    return result
  }

  @Get('heartbeat/:key')
  async heartbeat(@Param('key') key: string, @Req() request: any) {
    const sourceIp = this.resolveSourceIp(request)
    const result = await this.routersService.recordRouterHeartbeatByKey(key, sourceIp)
    if (!result) {
      throw new NotFoundException('Router registration key not found')
    }
    return result
  }

  @Get('watchdog/:key')
  async watchdog(
    @Param('key') key: string,
    @Req() request: any,
    @Query() query: MikrotikReportQuery,
  ) {
    const sourceIp = this.resolveSourceIp(request)
    const result = await this.routersService.recordWatchdogReportByKey(key, sourceIp, query)
    if (!result) {
      throw new NotFoundException('Router registration key not found')
    }
    return result
  }

  private resolveSourceIp(request: any) {
    const forwardedFor = request.headers?.['x-forwarded-for']
    const firstForwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim()

    return (
      firstForwardedIp ||
      request.headers?.['x-real-ip'] ||
      request.ip ||
      request.socket?.remoteAddress ||
      ''
    ).replace(/^::ffff:/, '')
  }

  private firstQueryValue(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value
  }
}
