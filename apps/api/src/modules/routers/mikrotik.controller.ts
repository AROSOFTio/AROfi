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

    // The 2 August reconnect flow started auto-submitting saved credentials as
    // soon as the captive page loaded. On Samsung devices this can bypass the
    // package list and leave Android evaluating a half-completed login as a
    // network without internet. Always render bundles first; explicit voucher,
    // trial, recovery, and successful payment actions still call conn().
    return html.replace(
      'var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;',
      'var autoReady=false;',
    );
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

  @Get('mobile-setup/:key')
  async getMobileSetup(@Param('key') key: string) {
    const summary = await this.routersService.getMobileSetupSummaryByKey(key);
    if (!summary) {
      throw new NotFoundException('Router not found');
    }
    return summary;
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
    const sourceIp = this.resolveProvisioningNasIp(selfReportedNasIp, httpSourceIp);
    const result = await this.routersService.markRouterProvisionedByKey(key, sourceIp);
    if (!result) {
      throw new NotFoundException('Router registration key not found');
    }
    return result;
  }

  @Get('heartbeat/:key')
  async heartbeat(
    @Param('key') key: string,
    @Req() request: any,
    @Query('activeUsers') activeUsers?: string,
    @Query('activeMacs') activeMacs?: string,
  ) {
    const sourceIp = this.resolveSourceIp(request);
    const result = await this.routersService.recordRouterHeartbeatByKey(key, sourceIp, activeUsers, activeMacs);
    if (!result) {
      throw new NotFoundException('Router registration key not found');
    }
    return result;
  }

  private resolveProvisioningNasIp(selfReportedNasIp?: string, httpSourceIp?: string) {
    const reportedIp = this.normalizeIpv4(selfReportedNasIp);
    const observedIp = this.normalizeIpv4(httpSourceIp);

    // FreeRADIUS must register the address it actually sees. A router behind
    // CGNAT often reports a private WAN address even though auth packets arrive
    // from the public address observed by this API callback.
    if (reportedIp && !this.isPrivateOrReservedIpv4(reportedIp)) {
      return reportedIp;
    }

    return observedIp || reportedIp || '';
  }

  private normalizeIpv4(value?: string) {
    const normalized = value?.trim().replace(/^::ffff:/, '') ?? '';
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) &&
      normalized.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255)
      ? normalized
      : '';
  }

  private isPrivateOrReservedIpv4(ip: string) {
    const [a, b] = ip.split('.').map(Number);

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
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
