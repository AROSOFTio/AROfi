import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RouterConnectionMode, RouterStatus } from '@prisma/client'
import * as net from 'net'
import * as tls from 'tls'
import { PrismaService } from '../../prisma.service'
import { MikrotikService } from './mikrotik.service'
import { RouterCredentialsService } from './router-credentials.service'

const PORTAL_REFRESH_SCRIPT = 'arofi-portal-refresh'
const PORTAL_REFRESH_INTERVAL = '15m'

/**
 * The customer captive popup is served by RouterOS from hotspot/login.html,
 * not by Next.js. Keep the existing voucher/payment/reconnect JavaScript and
 * upgrade the generated shell so captive browsers see the approved compact
 * AROFi experience immediately.
 *
 * This initializer also performs a best-effort one-time refresh of portal files
 * on already provisioned routers reachable through their AROFi SSTP/API path,
 * then installs a small router-side refresh scheduler. A failed refresh never
 * removes the currently working login.html.
 */
@Injectable()
export class PremiumCaptivePortalInitializer implements OnModuleInit {
  private readonly logger = new Logger(PremiumCaptivePortalInitializer.name)

  constructor(
    private readonly mikrotikService: MikrotikService,
    private readonly prisma: PrismaService,
    private readonly routerCredentials: RouterCredentialsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const service = this.mikrotikService as MikrotikService & {
      buildLoginHtml: (registrationKey: string, portalBaseUrl?: string | null) => string
      buildProvisioningScript: (input: { registrationKey?: string | null }) => string
    }

    const originalLogin = service.buildLoginHtml.bind(service)
    service.buildLoginHtml = (registrationKey: string, portalBaseUrl?: string | null) =>
      this.applyPremiumPortal(originalLogin(registrationKey, portalBaseUrl))

    // Every newly provisioned router receives a periodic portal refresh job so
    // later UI improvements reach hotspot/login.html without re-provisioning.
    const originalProvisioning = service.buildProvisioningScript.bind(service)
    service.buildProvisioningScript = (input: { registrationKey?: string | null }) => {
      const script = originalProvisioning(input)
      return input.registrationKey
        ? `${script}\n\n${this.buildRouterRefreshInstaller(input.registrationKey)}`
        : script
    }

    if (process.env.ROUTER_PORTAL_AUTO_SYNC !== 'false') {
      const timer = setTimeout(() => void this.syncExistingRouters(), 15_000)
      if (typeof timer.unref === 'function') timer.unref()
    }
  }

  private applyPremiumPortal(html: string) {
    if (html.includes('id="arofi-premium-captive-v2"')) return html

    const style = `<style id="arofi-premium-captive-v2">
      :root{--navy:#071A49;--blue:#0964FA;--cyan:#00C4EB;--ink:#0b1739;--muted:#64748b}
      body{background:#f3f7fc!important;color:var(--ink)!important;padding:10px 8px 22px!important}
      .card{max-width:900px!important;padding:0!important;overflow:hidden;background:#fff!important;border:0!important;border-radius:22px!important;box-shadow:0 18px 48px rgba(7,26,73,.12)!important}
      .hdr{display:none!important}
      .premium-hero{position:relative;overflow:hidden;min-height:150px;padding:14px 18px 17px;color:#fff;background:radial-gradient(circle at 84% 9%,rgba(0,196,235,.25),transparent 31%),linear-gradient(130deg,#020b26 0%,#071A49 58%,#0a37a3 100%)}
      .premium-brand{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px}.premium-logo{display:block;max-width:160px;height:38px;object-fit:contain;object-position:left center}
      .premium-lang{display:flex;gap:5px;align-items:center;border:1px solid rgba(255,255,255,.24);border-radius:999px;padding:5px 9px;font-size:10px;font-weight:750;background:rgba(255,255,255,.05)}
      .premium-copy{position:relative;z-index:2;margin-top:15px;max-width:460px}.premium-copy h1{font-size:28px;line-height:1.02;margin:0;font-weight:900;letter-spacing:-.03em}.premium-copy p{margin:5px 0 0;color:#c7d9ff;font-size:11.5px}.premium-copy small{display:block;margin-top:5px;color:#91b7ff;font-size:10.5px;font-weight:700}
      .premium-wifi{position:absolute;right:42px;bottom:24px;width:94px;height:70px;opacity:.92}.premium-wifi span{position:absolute;left:50%;bottom:8px;border:3px solid #67e8f9;border-left-color:transparent;border-bottom-color:transparent;border-radius:50%;transform:translateX(-50%) rotate(-45deg);animation:arofiWave 1.8s ease-in-out infinite}.premium-wifi span:nth-child(1){width:82px;height:82px;animation-delay:0s}.premium-wifi span:nth-child(2){width:56px;height:56px;animation-delay:.18s}.premium-wifi span:nth-child(3){width:30px;height:30px;animation-delay:.36s}.premium-wifi i{position:absolute;left:50%;bottom:2px;width:7px;height:7px;background:#67e8f9;border-radius:50%;transform:translateX(-50%);box-shadow:0 0 12px rgba(103,232,249,.9)}@keyframes arofiWave{0%,100%{opacity:.42;filter:drop-shadow(0 0 0 rgba(103,232,249,0))}50%{opacity:1;filter:drop-shadow(0 0 6px rgba(103,232,249,.8))}}
      .premium-tabs{display:flex;overflow-x:auto;white-space:nowrap;border-bottom:1px solid #e2e8f0;background:#fff;padding:0 4px;scrollbar-width:none}.premium-tabs::-webkit-scrollbar{display:none}.premium-tab{position:relative;min-width:108px;flex:1;border:0;background:transparent;padding:9px 6px 8px;color:#64748b;font-size:9.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px}.premium-tab svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2}.premium-tab.on{color:var(--blue)}.premium-tab.on:after{content:"";position:absolute;left:20%;right:20%;height:2.5px;bottom:0;border-radius:5px;background:var(--blue)}
      #loading{padding:22px 0!important;background:#f8fbff}.spin-wrap .spinner{border-color:#bfdbfe!important;border-top-color:var(--blue)!important}
      #content{background:#f8fbff;padding:10px!important}.premium-panel{display:none}.premium-panel.on{display:block}.premium-card{background:#fff;border:1px solid #e2e8f0;border-radius:17px;padding:12px;box-shadow:0 4px 14px rgba(7,26,73,.035);margin-bottom:9px}.premium-card-title{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:900;color:var(--ink);margin-bottom:9px}.premium-card-title i{font-style:normal;color:var(--blue)}
      .quick-row{margin:0!important;display:grid!important;grid-template-columns:1fr auto!important;gap:7px!important}.quick-row input{border:1px solid #d9e2ef!important;border-radius:11px!important;background:#fff!important;padding:10px 11px!important;font-size:12px!important}.connect-btn,.btn{border-radius:11px!important;background:linear-gradient(90deg,#0964FA,#0646e6)!important;padding:10px 15px!important;box-shadow:0 7px 16px rgba(9,100,250,.16)!important}.secure-note{display:flex;align-items:center;gap:5px;margin-top:8px;font-size:9.5px;color:#64748b;font-weight:650}
      .section-label{text-align:left!important;font-size:14px!important;font-weight:900!important;color:var(--ink)!important;margin:3px 0 2px!important}.section-sub{text-align:left!important;margin:0 0 9px!important;max-width:none!important;font-size:10.5px!important}.pkgs{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;margin-top:8px!important}.pkg{display:flex!important;min-width:0!important;min-height:116px!important;flex-direction:column!important;align-items:stretch!important;gap:4px!important;padding:10px!important;border-radius:14px!important;border:1px solid #dfe7f2!important;box-shadow:0 3px 10px rgba(7,26,73,.035)!important}.pkg .pk-name{font-size:12.5px!important;line-height:1.18!important;color:var(--ink)!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.pkg .pk-dur{font-size:9.5px!important;line-height:1.2!important}.pkg .pk-price{font-size:15px!important;line-height:1.05!important;color:#0646e6!important;margin:1px 0 3px}.pkg .pk-buy{margin-top:auto!important;text-align:center;border:0!important;border-radius:8px!important;background:linear-gradient(90deg,#0964FA,#0646e6)!important;padding:6px!important;font-size:9.5px!important}
      .accept{margin:0 0 9px!important;border:1px solid #e2e8f0!important;border-radius:17px!important;background:#fff!important;padding:12px!important;text-align:left!important}.accept-label{margin:0 0 8px!important}.accept-label strong{display:block;font-size:14px;color:var(--ink)}.accept-label small{display:block;margin-top:2px;font-size:10px;font-weight:500;color:#64748b}.accept-logos{justify-content:flex-start!important;gap:7px!important}.net{min-width:112px!important;padding:8px 11px!important}.net-airtel{background:#fff1f2!important}
      .find-wrap{display:none!important}.find-panel{display:block!important;margin:0!important;border:0!important;padding:0!important}.tv-voucher{margin:0 0 9px!important;border-radius:14px!important}.tv-section{display:block;margin:0!important;border:0!important;background:transparent!important;padding:0!important}.tv-section .section-label{margin-top:0!important}.tv-section .pkgs{margin-top:8px!important}#multiSection{display:block!important}
      .promo-card{background:#fff;border:1px solid #e2e8f0;border-radius:17px;padding:18px;text-align:center}.promo-card h2{font-size:16px;margin:0 0 5px}.promo-card p{font-size:11px;color:#64748b;line-height:1.45;margin:0 auto;max-width:450px}
      .support{display:none;margin:9px 0 0!important;border:1px solid #e2e8f0!important;border-radius:17px!important;background:#fff!important;padding:12px!important}.support[style*="flex"]{display:flex!important}.support-phone{color:var(--blue)!important}.tech{margin:9px auto 0!important;color:#64748b!important}.wa-inline{box-shadow:none!important}.pay-box{border-radius:17px!important}.message-box{border-radius:16px!important}
      @media(max-width:720px){body{padding:5px 4px 12px!important}.card{border-radius:17px!important}.premium-hero{min-height:132px;padding:11px 13px 13px}.premium-logo{max-width:142px;height:32px}.premium-copy{margin-top:11px}.premium-copy h1{font-size:23px}.premium-wifi{right:24px;bottom:18px;transform:scale(.78);transform-origin:right bottom}.pkgs{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}#content{padding:7px!important}.premium-card{padding:9px;border-radius:14px;margin-bottom:7px}.pkg{min-height:105px!important;padding:8px!important;border-radius:12px!important}.premium-tab{min-width:92px;padding:8px 5px 7px;font-size:9px}.accept{padding:9px!important;border-radius:14px!important}.net{min-width:98px!important;padding:7px 8px!important}}
      @media(max-width:470px){body{padding:2px!important}.card{border-radius:13px!important}.premium-hero{min-height:124px;padding:10px 10px 11px}.premium-logo{max-width:130px;height:29px}.premium-lang{padding:4px 7px;font-size:9px}.premium-copy{margin-top:9px}.premium-copy h1{font-size:21px}.premium-copy p{font-size:10.5px}.premium-wifi{right:14px;bottom:13px;transform:scale(.65)}#content{padding:5px!important}.premium-card{padding:8px!important}.quick-row{grid-template-columns:1fr auto!important;gap:5px!important}.connect-btn{padding:9px 10px!important}.pkgs{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:5px!important}.pkg{min-height:101px!important;padding:7px!important}.pkg .pk-name{font-size:11.5px!important}.pkg .pk-price{font-size:14px!important}.premium-tab{min-width:88px}.accept-logos{gap:5px!important}.net{min-width:92px!important;font-size:9.5px!important}}
    </style>`

    const iconVoucher = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z"/><path d="M13 5v14"/></svg>'
    const iconMulti = '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="13" height="10" rx="2"/><path d="M6 18h5M8.5 14v4"/><rect x="16" y="8" width="6" height="11" rx="1.5"/></svg>'
    const iconTv = '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></svg>'
    const iconFind = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 5 5M8 11h6"/></svg>'
    const iconPromo = '<svg viewBox="0 0 24 24"><path d="M20 13 11 22l-9-9V4h9l9 9Z"/><circle cx="7" cy="9" r="1.2"/></svg>'

    const hero = `<div class="premium-hero">
      <div class="premium-brand"><img id="premiumLogo" class="premium-logo" src="https://arofi.net/brand/arofi-logo-gradient.webp" alt="AROFi"><div class="premium-lang">◎ English⌄</div></div>
      <div class="premium-copy"><h1>Connect to Wi-Fi</h1><p>✓ Fast, secure internet access</p><small id="premiumTenant">AROFi Wi-Fi</small></div><div class="premium-wifi" aria-hidden="true"><span></span><span></span><span></span><i></i></div>
    </div>
    <div class="premium-tabs" id="premiumTabs">
      <button class="premium-tab on" data-tab="voucher">${iconVoucher}<span>Voucher</span></button>
      <button class="premium-tab" data-tab="multi">${iconMulti}<span>Multi-Device</span></button>
      <button class="premium-tab" data-tab="tv">${iconTv}<span>TV</span></button>
      <button class="premium-tab" data-tab="recover">${iconFind}<span>Find My Voucher</span></button>
      <button class="premium-tab" data-tab="promo">${iconPromo}<span>Promo</span></button>
    </div>`

    const script = `<script id="arofi-premium-captive-script-v2">
      (function(){
        function move(el,p){if(el&&p)p.appendChild(el)}
        function panel(id){var p=document.createElement('section');p.id='premium-'+id;p.className='premium-panel'+(id==='voucher'?' on':'');return p}
        function card(title){var c=document.createElement('div');c.className='premium-card';if(title)c.innerHTML='<div class="premium-card-title"><i>✦</i>'+title+'</div>';return c}
        function init(){
          var content=document.getElementById('content');if(!content||document.getElementById('premium-voucher'))return;
          var voucher=panel('voucher'),multi=panel('multi'),tv=panel('tv'),recover=panel('recover'),promo=panel('promo');
          var voucherCard=card('Have a voucher?');move(document.querySelector('.quick-row'),voucherCard);var secure=document.createElement('div');secure.className='secure-note';secure.textContent='🔒 Secure & encrypted connection';voucherCard.appendChild(secure);voucher.appendChild(voucherCard);
          var trial=document.getElementById('trialSection');if(trial)move(trial,voucher);
          var plans=card('Choose Your Plan');var standardLabel=content.querySelector(':scope > .section-label');if(standardLabel)standardLabel.remove();move(document.getElementById('plist'),plans);voucher.appendChild(plans);
          var quick=document.getElementById('acceptBox');if(quick){var l=quick.querySelector('.accept-label');if(l)l.innerHTML='<strong>Quick Pay</strong><small>Pay instantly with Mobile Money</small>';move(quick,voucher)}
          move(document.getElementById('multiSection'),multi);
          move(document.getElementById('tvVoucherBox'),tv);move(document.getElementById('tvSection'),tv);
          var find=card('Find My Voucher');move(document.getElementById('findPanel'),find);var fp=find.querySelector('.find-panel');if(fp)fp.classList.add('on');recover.appendChild(find);
          promo.innerHTML='<div class="promo-card"><h2>Promotions</h2><p>No active promotion is published for this Wi-Fi right now.</p></div>';
          var support=document.getElementById('support');content.insertBefore(voucher,content.firstChild);content.insertBefore(multi,support);content.insertBefore(tv,support);content.insertBefore(recover,support);content.insertBefore(promo,support);
          var tabs=document.querySelectorAll('.premium-tab');for(var i=0;i<tabs.length;i++)tabs[i].onclick=function(){var id=this.getAttribute('data-tab');for(var j=0;j<tabs.length;j++)tabs[j].classList.toggle('on',tabs[j]===this);var ps=document.querySelectorAll('.premium-panel');for(var k=0;k<ps.length;k++)ps[k].classList.toggle('on',ps[k].id==='premium-'+id)};
          var findWrap=document.querySelector('.find-wrap');if(findWrap)findWrap.style.display='none';
        }
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
      })();
    </script>`

    let next = html.replace('</head>', `${style}</head>`)
    next = next.replace('<div class="card">', `<div class="card">${hero}`)
    next = next.replace(
      "document.getElementById('tname').textContent=d.tenant?d.tenant.name:'AROFi Hotspot';",
      "document.getElementById('tname').textContent=d.tenant?d.tenant.name:'AROFi Hotspot';var _pt=document.getElementById('premiumTenant');if(_pt&&d.tenant)_pt.textContent=d.tenant.name||'AROFi Wi-Fi';var _pl=document.getElementById('premiumLogo');if(_pl&&d.tenant&&d.tenant.logoUrl){_pl.src=d.tenant.logoUrl;_pl.onerror=function(){this.onerror=null;this.src='https://arofi.net/brand/arofi-logo-gradient.webp';};}",
    )
    return next.replace('</body>', `${script}</body>`)
  }

  private async syncExistingRouters() {
    try {
      const routers = await this.prisma.router.findMany({
        where: {
          status: { not: RouterStatus.PENDING },
          registrationKey: { not: '' },
        },
        select: {
          id: true,
          name: true,
          registrationKey: true,
          host: true,
          remoteSstpIp: true,
          apiPort: true,
          connectionMode: true,
          username: true,
          passwordCiphertext: true,
        },
      })

      let refreshed = 0
      let skipped = 0
      let failed = 0
      for (const router of routers) {
        const key = router.registrationKey?.trim()
        const host = router.remoteSstpIp?.trim() || router.host?.trim()
        if (!key || !host || !router.username || !router.passwordCiphertext || /^pending/i.test(host)) {
          skipped += 1
          continue
        }

        try {
          const password = this.routerCredentials.decrypt(router.passwordCiphertext)
          await this.refreshRouterPortal({
            host,
            port: router.apiPort,
            useTls: router.connectionMode === RouterConnectionMode.ROUTEROS_API_SSL,
            username: router.username,
            password,
            registrationKey: key,
          })
          refreshed += 1
        } catch (error) {
          failed += 1
          this.logger.warn(`Portal refresh skipped for ${router.name}: ${error instanceof Error ? error.message : String(error)}`)
        }

        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      this.logger.log(`Captive portal sync finished: refreshed=${refreshed}, skipped=${skipped}, failed=${failed}`)
    } catch (error) {
      this.logger.warn(`Captive portal sync sweep failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async refreshRouterPortal(input: {
    host: string
    port: number
    useTls: boolean
    username: string
    password: string
    registrationKey: string
  }) {
    const client = await PortalRouterOsClient.connect({ host: input.host, port: input.port, useTls: input.useTls, timeoutMs: 5000 })
    try {
      await client.login(input.username, input.password)
      const urls = this.portalUrls(input.registrationKey)
      await this.fetchWithFallback(client, urls.loginHttps, urls.loginHttp, 'hotspot/login.html')
      await this.fetchWithFallback(client, urls.statusHttps, urls.statusHttp, 'hotspot/status.html')
      await this.installRouterRefreshScheduler(client, input.registrationKey)
    } finally {
      client.close()
    }
  }

  private async fetchWithFallback(client: PortalRouterOsClient, httpsUrl: string, httpUrl: string, destination: string) {
    try {
      await client.command(['/tool/fetch', `=url=${httpsUrl}`, '=mode=https', '=check-certificate=no', `=dst-path=${destination}`])
    } catch {
      await client.command(['/tool/fetch', `=url=${httpUrl}`, '=mode=http', `=dst-path=${destination}`])
    }
  }

  private async installRouterRefreshScheduler(client: PortalRouterOsClient, registrationKey: string) {
    for (const menu of ['/system/script', '/system/scheduler']) {
      const rows = await client.command([`${menu}/print`, '=.proplist=.id,name', `?name=${PORTAL_REFRESH_SCRIPT}`])
      for (const row of rows) {
        if (row['.id']) await client.command([`${menu}/remove`, `=numbers=${row['.id']}`])
      }
    }

    const source = this.routerRefreshSource(registrationKey)
    await client.command(['/system/script/add', `=name=${PORTAL_REFRESH_SCRIPT}`, `=source=${source}`, '=comment=AROFi captive portal refresh'])
    await client.command(['/system/scheduler/add', `=name=${PORTAL_REFRESH_SCRIPT}`, `=interval=${PORTAL_REFRESH_INTERVAL}`, `=on-event=${PORTAL_REFRESH_SCRIPT}`, '=comment=AROFi captive portal refresh'])
  }

  private buildRouterRefreshInstaller(registrationKey: string) {
    const source = this.routerRefreshSource(registrationKey)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
    return [
      '# AROFi captive portal automatic refresh',
      `/system script remove [find name="${PORTAL_REFRESH_SCRIPT}"]`,
      `/system script add name="${PORTAL_REFRESH_SCRIPT}" source="${source}" comment="AROFi captive portal refresh"`,
      `/system scheduler remove [find name="${PORTAL_REFRESH_SCRIPT}"]`,
      `/system scheduler add name="${PORTAL_REFRESH_SCRIPT}" interval=${PORTAL_REFRESH_INTERVAL} on-event="${PORTAL_REFRESH_SCRIPT}" comment="AROFi captive portal refresh"`,
    ].join('\n')
  }

  private routerRefreshSource(registrationKey: string) {
    const urls = this.portalUrls(registrationKey)
    return `:do { /tool fetch url="${urls.loginHttps}" check-certificate=no mode=https dst-path="hotspot/login.html" } on-error={ :do { /tool fetch url="${urls.loginHttp}" mode=http dst-path="hotspot/login.html" } on-error={} }; :do { /tool fetch url="${urls.statusHttps}" check-certificate=no mode=https dst-path="hotspot/status.html" } on-error={ :do { /tool fetch url="${urls.statusHttp}" mode=http dst-path="hotspot/status.html" } on-error={} }`
  }

  private portalUrls(registrationKey: string) {
    const key = encodeURIComponent(registrationKey)
    const apiHost = (this.config.get<string>('API_PUBLIC_HOST') || this.config.get<string>('PORTAL_PUBLIC_HOST') || 'arofi.net')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
    const httpsBase = `https://${apiHost}`
    const configuredHttp = this.config.get<string>('MIKROTIK_CALLBACK_HTTP_URL')
    const httpBase = configuredHttp
      ? configuredHttp.replace(/\/$/, '').replace(/:4012(\/|$)/, '$1').replace(/\/$/, '')
      : `http://${(this.config.get<string>('RADIUS_PUBLIC_HOST') || '95.111.234.34').replace(/^https?:\/\//, '').replace(/:\d+$/, '')}:18080`
    return {
      loginHttps: `${httpsBase}/api/mikrotik/login-html/${key}`,
      loginHttp: `${httpBase}/api/mikrotik/login-html/${key}`,
      statusHttps: `${httpsBase}/api/mikrotik/status-html/${key}`,
      statusHttp: `${httpBase}/api/mikrotik/status-html/${key}`,
    }
  }
}

type PortalRouterOsConnectInput = {
  host: string
  port: number
  useTls: boolean
  timeoutMs: number
}

class PortalRouterOsClient {
  private buffer = Buffer.alloc(0)

  private constructor(
    private readonly socket: net.Socket | tls.TLSSocket,
    private readonly timeoutMs: number,
  ) {}

  static connect(input: PortalRouterOsConnectInput) {
    return new Promise<PortalRouterOsClient>((resolve, reject) => {
      const socket = input.useTls
        ? tls.connect({ host: input.host, port: input.port, rejectUnauthorized: false })
        : net.createConnection({ host: input.host, port: input.port })
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('RouterOS API connection timed out'))
      }, input.timeoutMs)
      socket.once('connect', () => {
        clearTimeout(timer)
        socket.setTimeout(input.timeoutMs)
        resolve(new PortalRouterOsClient(socket, input.timeoutMs))
      })
      socket.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      socket.once('timeout', () => {
        socket.destroy()
        reject(new Error('RouterOS API request timed out'))
      })
    })
  }

  async login(username: string, password: string) {
    await this.command(['/login', `=name=${username}`, `=password=${password}`])
  }

  async command(words: string[]) {
    await this.writeSentence(words)
    return this.readReply()
  }

  close() {
    this.socket.destroy()
  }

  private writeSentence(words: string[]) {
    return new Promise<void>((resolve, reject) => {
      const chunks = words.flatMap((word) => [this.encodeLength(Buffer.byteLength(word)), Buffer.from(word)])
      chunks.push(Buffer.from([0]))
      this.socket.write(Buffer.concat(chunks), (error) => error ? reject(error) : resolve())
    })
  }

  private async readReply() {
    const rows: Array<Record<string, string>> = []
    while (true) {
      const sentence = await this.readSentence()
      const marker = sentence[0]
      if (marker === '!done') return rows
      if (marker === '!trap' || marker === '!fatal') {
        const message = sentence.map((word) => word.match(/^=message=(.*)$/)?.[1]).find(Boolean) ?? marker
        throw new Error(`RouterOS API error: ${message}`)
      }
      if (marker === '!re') {
        const row: Record<string, string> = {}
        for (const word of sentence.slice(1)) {
          const match = word.match(/^=([^=]+)=(.*)$/)
          if (match) row[match[1]] = match[2]
        }
        rows.push(row)
      }
    }
  }

  private async readSentence() {
    const words: string[] = []
    while (true) {
      const length = await this.readLength()
      if (length === 0) return words
      words.push((await this.readBytes(length)).toString())
    }
  }

  private async readLength() {
    const first = (await this.readBytes(1))[0]
    if ((first & 0x80) === 0x00) return first
    if ((first & 0xc0) === 0x80) return ((first & ~0xc0) << 8) + (await this.readBytes(1))[0]
    if ((first & 0xe0) === 0xc0) {
      const rest = await this.readBytes(2)
      return ((first & ~0xe0) << 16) + (rest[0] << 8) + rest[1]
    }
    if ((first & 0xf0) === 0xe0) {
      const rest = await this.readBytes(3)
      return ((first & ~0xf0) << 24) + (rest[0] << 16) + (rest[1] << 8) + rest[2]
    }
    const rest = await this.readBytes(4)
    return (rest[0] << 24) + (rest[1] << 16) + (rest[2] << 8) + rest[3]
  }

  private readBytes(length: number) {
    if (this.buffer.length >= length) {
      const out = this.buffer.subarray(0, length)
      this.buffer = this.buffer.subarray(length)
      return Promise.resolve(out)
    }
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('RouterOS API response timed out'))
      }, this.timeoutMs)
      const onData = (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk])
        if (this.buffer.length >= length) {
          const out = this.buffer.subarray(0, length)
          this.buffer = this.buffer.subarray(length)
          cleanup()
          resolve(out)
        }
      }
      const onError = (error: Error) => { cleanup(); reject(error) }
      const onClose = () => { cleanup(); reject(new Error('RouterOS API connection closed')) }
      const cleanup = () => {
        clearTimeout(timer)
        this.socket.off('data', onData)
        this.socket.off('error', onError)
        this.socket.off('close', onClose)
      }
      this.socket.on('data', onData)
      this.socket.once('error', onError)
      this.socket.once('close', onClose)
    })
  }

  private encodeLength(length: number) {
    if (length < 0x80) return Buffer.from([length])
    if (length < 0x4000) return Buffer.from([(length >> 8) | 0x80, length & 0xff])
    if (length < 0x200000) return Buffer.from([(length >> 16) | 0xc0, (length >> 8) & 0xff, length & 0xff])
    if (length < 0x10000000) return Buffer.from([(length >> 24) | 0xe0, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff])
    return Buffer.from([0xf0, (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff])
  }
}
