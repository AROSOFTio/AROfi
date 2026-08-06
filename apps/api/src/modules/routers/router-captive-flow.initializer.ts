import { Injectable, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { MikrotikController } from './mikrotik.controller'
import { MikrotikService } from './mikrotik.service'

type MutableMikrotikService = {
  buildProvisioningScript: (...args: any[]) => string
  buildStatusHtml: (...args: any[]) => string
}

type MutableMikrotikController = {
  prepareLoginHtml: (html: string) => string
}

/**
 * Restores the fast captive-portal behaviour used before the Smart TV MAC-login
 * change. Enabling `login-by=mac` makes RouterOS try RADIUS MAC authentication
 * as soon as a phone joins WiFi. A normal phone is not a pre-provisioned Smart
 * TV, so that request must time out or be rejected before Android receives the
 * captive redirect. The result is the delayed "Action required" loop.
 */
@Injectable()
export class RouterCaptiveFlowInitializer implements OnModuleInit {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly mikrotikService: MikrotikService,
  ) {}

  onModuleInit() {
    this.patchProvisioningScript()
    this.patchStatusHtml()
    this.patchRouterPortalHtml()
  }

  private patchProvisioningScript() {
    const service = this.mikrotikService as unknown as MutableMikrotikService
    const original = service.buildProvisioningScript.bind(service)

    service.buildProvisioningScript = (...args: any[]) => {
      const script = original(...args)

      return script.replace(
        /login-by=([^\s]+)(?:\s+mac-auth-mode=mac-as-username-and-password)?/g,
        (full, rawModes: string) => {
          const originalModes = rawModes.split(',')
          const modes = originalModes
            .map((mode) => mode.trim())
            .filter((mode) => mode && mode !== 'mac')

          if (modes.length === originalModes.length) {
            return full
          }

          const safeModes = Array.from(new Set([...modes, 'cookie', 'http-pap']))
          return `login-by=${safeModes.join(',')}`
        },
      )
    }
  }

  private patchStatusHtml() {
    const service = this.mikrotikService as unknown as MutableMikrotikService
    const original = service.buildStatusHtml.bind(service)

    service.buildStatusHtml = (...args: any[]) => {
      const html = original(...args)
      const closeCaptivePortal = `
  <meta http-equiv="refresh" content="0;url=http://connectivitycheck.gstatic.com/generate_204">
  <script>
    (function(){
      var target='http://connectivitycheck.gstatic.com/generate_204';
      try{window.location.replace(target);}catch(e){window.location.href=target;}
    })();
  </script>`

      return html.includes('connectivitycheck.gstatic.com/generate_204')
        ? html
        : html.replace('</head>', `${closeCaptivePortal}\n</head>`)
    }
  }

  private patchRouterPortalHtml() {
    const controller = this.moduleRef.get(MikrotikController, { strict: false }) as unknown as MutableMikrotikController | undefined
    if (!controller || typeof controller.prepareLoginHtml !== 'function') {
      return
    }

    const original = controller.prepareLoginHtml.bind(controller)
    controller.prepareLoginHtml = (html: string) => {
      let prepared = original(html)

      // An already-active package must auto-submit immediately. The previous
      // controller patch forced this to false, making customers tap the portal
      // repeatedly after payment or trial activation.
      prepared = prepared.replace(
        'var autoReady=false;',
        'var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;',
      )

      // Submit credentials to RouterOS in a hidden frame, close both overlays
      // immediately, and navigate the top window after RouterOS has had a short
      // moment to create the HotSpot session. A normal top-level form submit can
      // remain stuck on the original captive page even though authentication
      // already succeeded, leaving "Payment Approved! Connecting..." forever.
      const oldConnect = "function conn(rc){if(!rc||!rc.username)return;var dst=CONNECTED;var target=(rc.loginUrl||lo||'http://10.55.0.1/login');window.location.href=target+'?username='+encodeURIComponent(rc.username)+'&password='+encodeURIComponent(rc.password||rc.username)+'&dst='+encodeURIComponent(dst);}"
      const instantConnect = "function conn(rc){if(!rc||!rc.username){sst('Access is active but login credentials were not returned. Please try again.','err');return;}var target=(rc.loginUrl||lo||'http://10.55.0.1/login');var requested='';try{requested=(new URLSearchParams(window.location.search)).get('dst')||'';}catch(e){}var dst=(requested&&/^https?:\\/\\//i.test(requested))?requested:(CONNECTED||'http://www.msftconnecttest.com/redirect');try{closePay();}catch(e){}var overlay=document.getElementById('msgOverlay');if(overlay)overlay.classList.remove('on');var frame=document.getElementById('arofiLoginFrame');if(!frame){frame=document.createElement('iframe');frame.id='arofiLoginFrame';frame.name='arofiLoginFrame';frame.style.display='none';document.body.appendChild(frame);}var f=document.createElement('form');f.method='post';f.action=target;f.target=frame.name;f.style.display='none';function add(n,v){var i=document.createElement('input');i.type='hidden';i.name=n;i.value=v||'';f.appendChild(i);}add('username',rc.username);add('password',rc.password||rc.username);add('dst',dst);add('popup','false');document.body.appendChild(f);f.submit();window.setTimeout(function(){try{window.location.replace(dst);}catch(e){window.location.href=dst;}},900);}"
      prepared = prepared.split(oldConnect).join(instantConnect)

      // Trial occupies only one small breathing button. The context API removes
      // trial packages after this MAC/IP has used one, which hides the section.
      const compactTrialCss = `
<style id="arofi-instant-captive-fix">
  #trialSection{margin:2px auto 12px!important;padding:0!important;text-align:center!important;background:transparent!important;border:0!important;min-height:0!important}
  #trialSection .section-label,#trialSection .section-sub{display:none!important}
  #trialList{display:flex!important;justify-content:center!important;align-items:center!important;gap:0!important;margin:0!important;padding:0!important}
  #trialList:empty,#trialSection:has(#trialList:empty){display:none!important}
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
