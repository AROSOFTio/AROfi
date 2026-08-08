import { Injectable, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { MikrotikController } from './mikrotik.controller'
import { MikrotikService } from './mikrotik.service'

type MutableMikrotikService = MikrotikService & {
  buildProvisioningScript: (...args: any[]) => string
}

type MutableMikrotikController = MikrotikController & {
  prepareLoginHtml: (html: string) => string
}

/**
 * Restores the fast captive-portal behaviour used before the Smart TV MAC-login
 * change. Enabling `login-by=mac` makes RouterOS try RADIUS MAC authentication
 * as soon as a phone joins WiFi. A normal phone is not a pre-provisioned Smart
 * TV, so that request must time out or be rejected before Android receives the
 * captive redirect. The result is the delayed "Action required" loop.
 *
 * Smart TV access remains supported because the TV credential is still its MAC
 * address; it can be submitted explicitly when the TV reconnects. Normal phones
 * must go straight to cookie/http-pap without a blocking MAC-auth attempt.
 */
@Injectable()
export class RouterCaptiveFlowInitializer implements OnModuleInit {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly mikrotikService: MikrotikService,
  ) {}

  onModuleInit() {
    this.patchProvisioningScript()
    this.patchRouterPortalHtml()
  }

  private patchProvisioningScript() {
    const service = this.mikrotikService as MutableMikrotikService
    const original = service.buildProvisioningScript.bind(service)

    service.buildProvisioningScript = (...args: any[]) => {
      const script = original(...args)

      return script.replace(
        /login-by=([^\s]+)(?:\s+mac-auth-mode=mac-as-username-and-password)?/g,
        (full, rawModes: string) => {
          const modes = rawModes
            .split(',')
            .map((mode) => mode.trim())
            .filter((mode) => mode && mode !== 'mac')

          if (modes.length === rawModes.split(',').length) {
            return full
          }

          const safeModes = Array.from(new Set([...modes, 'cookie', 'http-pap']))
          return `login-by=${safeModes.join(',')}`
        },
      )
    }
  }

  private patchRouterPortalHtml() {
    const controller = this.moduleRef.get(MikrotikController, { strict: false }) as MutableMikrotikController | undefined
    if (!controller || typeof controller.prepareLoginHtml !== 'function') {
      return
    }

    const original = controller.prepareLoginHtml.bind(controller)
    controller.prepareLoginHtml = (html: string) => {
      let prepared = original(html)

      // The GET navigation used by the mini portal could be re-intercepted by
      // the hotspot and reopen login.html. A direct POST is the native RouterOS
      // login flow and authenticates immediately after the API returns credentials.
      const oldConnect = "function conn(rc){if(!rc||!rc.username)return;var dst=CONNECTED;var target=(rc.loginUrl||lo||'http://10.55.0.1/login');window.location.href=target+'?username='+encodeURIComponent(rc.username)+'&password='+encodeURIComponent(rc.password||rc.username)+'&dst='+encodeURIComponent(dst);}"
      const instantConnect = "function conn(rc){if(!rc||!rc.username){sst('Access is active but login credentials were not returned. Please try again.','err');return;}var target=(rc.loginUrl||lo||'http://10.55.0.1/login');var f=document.createElement('form');f.method='post';f.action=target;f.style.display='none';function add(n,v){var i=document.createElement('input');i.type='hidden';i.name=n;i.value=v||'';f.appendChild(i);}add('username',rc.username);add('password',rc.password||rc.username);add('dst',CONNECTED);add('popup','true');document.body.appendChild(f);f.submit();}"
      prepared = prepared.split(oldConnect).join(instantConnect)

      // Trial remains visible but occupies only one compact, breathing button.
      // The API removes trial packages entirely after this MAC/IP has used one,
      // so the existing renderer automatically hides this section thereafter.
      const compactTrialCss = `
<style id="arofi-instant-captive-fix">
  #trialSection{margin:2px auto 12px!important;padding:0!important;text-align:center!important;background:transparent!important;border:0!important;min-height:0!important}
  #trialSection .section-label,#trialSection .section-sub{display:none!important}
  #trialList{display:flex!important;justify-content:center!important;align-items:center!important;gap:0!important;margin:0!important;padding:0!important}
  #trialList .pkg{display:inline-flex!important;width:auto!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}
  #trialList .pkg>span:first-child,#trialList .pk-price{display:none!important}
  #trialList .pk-buy{position:static!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:70px!important;height:32px!important;padding:0 18px!important;border-radius:999px!important;border:1px solid rgba(37,99,235,.45)!important;background:#2563eb!important;color:#fff!important;font-size:12px!important;font-weight:800!important;letter-spacing:.04em!important;box-shadow:0 6px 18px rgba(37,99,235,.22)!important;animation:arofiTrialBreath 1.8s ease-in-out infinite!important}
  @keyframes arofiTrialBreath{0%,100%{transform:scale(1);box-shadow:0 6px 18px rgba(37,99,235,.20)}50%{transform:scale(1.055);box-shadow:0 8px 24px rgba(37,99,235,.38)}}
  @media (prefers-reduced-motion:reduce){#trialList .pk-buy{animation:none!important}}
</style>`
      prepared = prepared.replace('</head>', `${compactTrialCss}</head>`)

      return prepared
    }
  }
}
