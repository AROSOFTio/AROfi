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

const SESSION_POLICY_MARKER = '# AROFi: permanent active-bundle and returning-device policy'
const SESSION_POLICY_SCRIPT = 'arofi-session-policy'
const REQUIRED_LOGIN_METHODS = 'login-by=cookie,mac-cookie,http-pap'
const REQUIRED_USER_PROFILE =
  'shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d idle-timeout=none keepalive-timeout=none session-timeout=0s'

/**
 * Permanent captive-flow policy.
 *
 * `login-by=mac` is forbidden because it performs a blocking RADIUS MAC-auth
 * attempt before the phone receives the captive redirect. `mac-cookie` is a
 * different RouterOS feature: it reuses credentials only after that device has
 * completed a successful voucher/payment login. It is required so a customer
 * with an active bundle reconnects without seeing "Action required" again.
 *
 * Voucher, trial, recovery and Mobile Money success all submit credentials by
 * one immediate top-level POST. The destination is the device's connectivity
 * check, not another AROFi "Connected" page, so the captive window closes as
 * soon as RouterOS accepts the session.
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

    service.buildProvisioningScript = (...args: any[]) =>
      this.applyPermanentSessionPolicy(original(...args))
  }

  private applyPermanentSessionPolicy(script: string) {
    let updated = script

    // Exact login policy: no automatic RADIUS MAC auth, but keep trusted
    // post-login MAC cookies so returning active customers reconnect silently.
    updated = updated.replace(
      /login-by=[^\s]+(?:\s+mac-auth-mode=mac-as-username-and-password)?/g,
      REQUIRED_LOGIN_METHODS,
    )

    // Normalize every generated user profile command, including scripts made
    // by older compatibility patches that used 1d/31d/365d or finite keepalive.
    updated = updated.replace(
      /shared-users=[^\s}]+\s+add-mac-cookie=[^\s}]+\s+mac-cookie-timeout=[^\s}]+(?:\s+idle-timeout=[^\s}]+)?(?:\s+keepalive-timeout=[^\s}]+)?(?:\s+session-timeout=[^\s}]+)?/g,
      REQUIRED_USER_PROFILE,
    )

    if (updated.includes(SESSION_POLICY_MARKER)) {
      return updated
    }

    const policySource = [
      ':foreach p in=[/ip hotspot profile find] do={ :do { /ip hotspot profile set $p login-by=cookie,mac-cookie,http-pap http-cookie-lifetime=30d } on-error={} }',
      ':foreach up in=[/ip hotspot user profile find] do={ :do { /ip hotspot user profile set $up shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d idle-timeout=none keepalive-timeout=none session-timeout=0s } on-error={} }',
    ].join('; ')
    const escapedPolicySource = this.escapeRouterOsScriptSource(policySource)

    return [
      updated.trimEnd(),
      '',
      SESSION_POLICY_MARKER,
      '# Self-healing only: this never removes an active session or cookie.',
      `/system script remove [find name="${SESSION_POLICY_SCRIPT}"]`,
      `/system script add name="${SESSION_POLICY_SCRIPT}" policy=read,write,test source="${escapedPolicySource}"`,
      `/system scheduler remove [find name="${SESSION_POLICY_SCRIPT}"]`,
      `/system scheduler add name="${SESSION_POLICY_SCRIPT}" interval=1m on-event="${SESSION_POLICY_SCRIPT}" disabled=no comment="AROFi active bundle policy"`,
      `:do { /system script run "${SESSION_POLICY_SCRIPT}" } on-error={ :put "WARNING: AROFi session policy could not be applied." }`,
      ':put "AROFi active-bundle policy installed: no idle/keepalive logout and returning-device auto reconnect enabled."',
      '',
    ].join('\n')
  }

  private patchRouterPortalHtml() {
    const controller = this.moduleRef.get(MikrotikController, { strict: false }) as MutableMikrotikController | undefined
    if (!controller || typeof controller.prepareLoginHtml !== 'function') {
      return
    }

    const original = controller.prepareLoginHtml.bind(controller)
    controller.prepareLoginHtml = (html: string) => {
      let prepared = original(html)

      // Restore activation-aware return login only for the API-confirmed same
      // device/router bundle. New visitors still see the portal immediately.
      prepared = prepared.replace(
        'var autoReady=false;',
        'var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;',
      )

      prepared = prepared.replace(
        "var loopGuard=_lastAuto&&(Date.now()-_lastAuto)<8000;",
        "var loopGuard=_lastAuto&&(Date.now()-_lastAuto)<2500;",
      )

      // Keep the original captive probe URL. After authentication it is the best
      // signal to Android/iOS/Windows that internet is available and lets the OS
      // close its mini-browser. QR scans whose original URL is local .wifi use a
      // platform connectivity endpoint instead.
      prepared = prepared.replace(
        'var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"";',
        'var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"",orig="$(link-orig)"||"";',
      )

      // The old connected=1 branch deliberately rendered another AROFi page.
      // Remove it completely; successful authentication now exits the captive
      // browser through conn() and invisible alogin/status pages.
      prepared = prepared.replace(
        `      var _up=new URLSearchParams(search);\n      if(_up.get('connected')==='1'){\n        document.getElementById('loading').style.display='none';\n        document.getElementById('content').style.display='block';\n        return;\n      }\n\n`,
        '',
      )
      prepared = prepared.replace(/,CONNECTED="[^"]*";/, ';')

      // QR codes already contain the voucher. Do not wait 200ms before starting
      // redemption; begin immediately while package context loads in parallel.
      prepared = prepared.replace('setTimeout(login, 200);', 'login();')

      // No success/verification popup between a valid voucher and RouterOS.
      prepared = prepared.replace("      sst('Verifying voucher...','info');", '      closeMsg();')
      prepared = prepared.replace(
        "          sst('Success! Connecting...','ok');\n          conn(res.reconnect);",
        '          conn(res.reconnect);',
      )
      prepared = prepared.replace("b.disabled=false;b.textContent='Login';", "b.disabled=false;b.textContent='Connect';")

      // Mobile Money is an in-place STK/PIN flow. Never navigate the captive
      // browser to a gateway checkout page. Start polling immediately rather
      // than waiting for the first interval tick.
      prepared = prepared.replace(
        "        var cu=pmt.checkoutUrl||(pmt.responsePayload&&(pmt.responsePayload.checkoutUrl||(pmt.responsePayload.gateway&&pmt.responsePayload.gateway.checkoutUrl)));\n        if(cu){window.location.href=cu;return;}\n        sst(selTv?'Enter your Mobile Money PIN. After approval, reconnect the Smart TV to WiFi.':'Enter your Mobile Money PIN on your phone. Waiting for approval...','info');\n        poll(pmt.id,pmt.statusToken);",
        "        if(pmt.activation&&pmt.reconnect&&pmt.reconnect.username){closePay();conn(pmt.reconnect);return;}\n        closePay();\n        sst(selTv?'Approve the Mobile Money prompt. The Smart TV will activate automatically.':'Approve the Mobile Money prompt on your phone.','info');\n        poll(pmt.id,pmt.statusToken);",
      )

      prepared = prepared.replace(
        /    function poll\(id,tok\)\{.*?\n    \}\n\n    function rec\(\)\{/s,
        `    function poll(id,tok){
      var n=0,stopped=false;
      function stop(){stopped=true;}
      function check(){
        if(stopped)return;
        if(++n>240){stop();sst('Timed out waiting for payment.','err');document.getElementById('pbtn').disabled=false;return;}
        apiCall('POST','/api/payments/'+id+'/check-status'+(tok?'?token='+encodeURIComponent(tok):''),null,function(err,p){
          if(stopped)return;
          if(err){setTimeout(check,500);return;}
          if(p.activation){
            if(selTv){
              stop();document.getElementById('pbtn').disabled=false;closePay();closeMsg();
              var tvm=normMac(document.getElementById('tvmac').value);
              sst('Smart TV '+tvm+' is active. Reconnect the TV to this WiFi.','ok');
              return;
            }
            if(p.reconnect&&p.reconnect.username){stop();conn(p.reconnect);return;}
          }
          if(p.status==='FAILED'){stop();sst(p.statusMessage||'Payment Declined.','err');document.getElementById('pbtn').disabled=false;return;}
          setTimeout(check,500);
        });
      }
      check();
    }

    function rec(){`,
      )

      // One native top-level POST. No GET query, no iframe, no timer and no
      // second AROFi page. RouterOS redirects to a connectivity check so the
      // operating system closes the captive browser after authentication.
      const oldConnect = "function conn(rc){if(!rc||!rc.username)return;var dst=CONNECTED;var target=(rc.loginUrl||lo||'http://10.55.0.1/login');window.location.href=target+'?username='+encodeURIComponent(rc.username)+'&password='+encodeURIComponent(rc.password||rc.username)+'&dst='+encodeURIComponent(dst);}"
      const instantConnect = "function finishTarget(){var o=orig||'';if(o&&o.indexOf('$(')!==0&&!/\\.wifi(?:\\/|$)/i.test(o)&&!/\\/login(?:[/?]|$)/i.test(o))return o;var ua=navigator.userAgent||'';if(/Windows/i.test(ua))return 'http://www.msftconnecttest.com/connecttest.txt';if(/iPhone|iPad|Macintosh/i.test(ua))return 'http://captive.apple.com/hotspot-detect.html';return 'http://connectivitycheck.gstatic.com/generate_204';}function conn(rc){if(!rc||!rc.username){sst('Access is active but login credentials were not returned. Please try again.','err');return;}closePay();closeMsg();var target=(rc.loginUrl||lo||'http://10.55.0.1/login');var f=document.createElement('form');f.method='post';f.action=target;f.style.display='none';function add(n,v){var i=document.createElement('input');i.type='hidden';i.name=n;i.value=v||'';f.appendChild(i);}add('username',rc.username);add('password',rc.password||rc.username);add('dst',finishTarget());add('popup','false');document.body.appendChild(f);document.documentElement.style.visibility='hidden';f.submit();}"
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
      if (!prepared.includes('id="arofi-instant-captive-fix"')) {
        prepared = prepared.replace('</head>', `${compactTrialCss}</head>`)
      }

      return prepared
    }
  }

  private escapeRouterOsScriptSource(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
  }
}
