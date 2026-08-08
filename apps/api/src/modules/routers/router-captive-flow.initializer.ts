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
 * Active paid sessions must not be terminated by local idle/keepalive timers.
 * RADIUS Session-Timeout, package expiry, quota exhaustion and explicit
 * revocation remain the only authoritative access-ending events.
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

      // The controller used to force this to false, which guaranteed that a
      // returning customer saw "Action required" even with a valid active
      // activation. Restore the existing activation-aware reconnect payload.
      prepared = prepared.replace(
        'var autoReady=false;',
        'var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;',
      )

      // Keep only a very short redirect-loop guard. MAC-cookie normally logs a
      // returning device in before this page opens; this POST is the fallback
      // when the router cookie was cleared or expired.
      prepared = prepared.replace(
        "var loopGuard=_lastAuto&&(Date.now()-_lastAuto)<8000;",
        "var loopGuard=_lastAuto&&(Date.now()-_lastAuto)<2500;",
      )

      // A direct POST is the native RouterOS login flow. GET navigation could be
      // intercepted again and reopen login.html, creating the action-required
      // loop after a valid voucher/payment login.
      const oldConnect = "function conn(rc){if(!rc||!rc.username)return;var dst=CONNECTED;var target=(rc.loginUrl||lo||'http://10.55.0.1/login');window.location.href=target+'?username='+encodeURIComponent(rc.username)+'&password='+encodeURIComponent(rc.password||rc.username)+'&dst='+encodeURIComponent(dst);}"
      const instantConnect = "function conn(rc){if(!rc||!rc.username){sst('Access is active but login credentials were not returned. Please try again.','err');return;}var target=(rc.loginUrl||lo||'http://10.55.0.1/login');var f=document.createElement('form');f.method='post';f.action=target;f.style.display='none';function add(n,v){var i=document.createElement('input');i.type='hidden';i.name=n;i.value=v||'';f.appendChild(i);}add('username',rc.username);add('password',rc.password||rc.username);add('dst',CONNECTED);add('popup','true');document.body.appendChild(f);f.submit();}"
      prepared = prepared.split(oldConnect).join(instantConnect)

      // Trial remains visible but occupies only one compact, breathing button.
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
