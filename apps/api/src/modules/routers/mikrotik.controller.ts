import { Controller, Get, Header, NotFoundException, Param, Query, Req } from '@nestjs/common';
import { RoutersService } from './routers.service';

@Controller('mikrotik')
export class MikrotikController {
  constructor(private readonly routersService: RoutersService) {}

  @Get('script/:key')
  @Header('Content-Type', 'text/plain')
  async getProvisioningScript(@Param('key') key: string) {
    const script = await this.routersService.getProvisioningScriptByKey(key);
    if (!script) {
      throw new NotFoundException('Router provisioning script not found');
    }
    return script;
  }

  @Get('login-html/:key')
  @Header('Content-Type', 'text/html')
  async getLoginHtml(@Param('key') key: string) {
    const html = await this.routersService.getMikrotikLoginHtmlByKey(key);
    if (!html) {
      throw new NotFoundException('Router login.html not found');
    }
    return html;
  }

  @Get('status-html/:key')
  @Header('Content-Type', 'text/html')
  async getStatusHtml(@Param('key') key: string) {
    const html = await this.routersService.getMikrotikStatusHtmlByKey(key);
    if (!html) {
      throw new NotFoundException('Router status.html not found');
    }
    return html;
  }

  @Get('remote-access/install')
  @Header('Content-Type', 'text/plain')
  async getRemoteAccessInstall(@Query('token') token?: string, @Req() request?: any) {
    const authHeader = request?.headers?.['authorization'];
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : null;

    const activeToken = token || bearerToken;
    if (!activeToken) {
      throw new NotFoundException('Token not provided');
    }

    const script = await this.routersService.getRemoteAccessInstallScript(activeToken);
    if (!script) {
      throw new NotFoundException('Remote access configuration not found');
    }
    return script;
  }

  @Get('remote-access/install/:token')
  @Header('Content-Type', 'text/plain')
  async getRemoteAccessInstallWithParam(@Param('token') token: string, @Req() request?: any) {
    return this.getRemoteAccessInstall(token, request);
  }

  @Get('provisioned/:key')
  async markProvisioned(
    @Param('key') key: string,
    @Req() request: any,
    @Query('nasIp') selfReportedNasIp?: string,
  ) {
    const httpSourceIp = this.resolveSourceIp(request);
    // Prefer the router's self-reported WAN IP — more accurate behind CGNAT
    const sourceIp = selfReportedNasIp?.trim() || httpSourceIp;
    const result = await this.routersService.markRouterProvisionedByKey(key, sourceIp);
    if (!result) {
      throw new NotFoundException('Router registration key not found');
    }
    return result;
  }

  @Get('heartbeat/:key')
  async heartbeat(@Param('key') key: string, @Req() request: any) {
    const sourceIp = this.resolveSourceIp(request);
    const result = await this.routersService.recordRouterHeartbeatByKey(key, sourceIp);
    if (!result) {
      throw new NotFoundException('Router registration key not found');
    }
    return result;
  }

  private resolveSourceIp(request: any) {
    const forwardedFor = request.headers?.['x-forwarded-for'];
    const firstForwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    return (
      firstForwardedIp ||
      request.headers?.['x-real-ip'] ||
      request.ip ||
      request.socket?.remoteAddress ||
      ''
    ).replace(/^::ffff:/, '');
  }
}
