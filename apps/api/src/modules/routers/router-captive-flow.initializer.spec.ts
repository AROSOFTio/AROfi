import { ModuleRef } from '@nestjs/core'
import { MikrotikController } from './mikrotik.controller'
import { MikrotikService } from './mikrotik.service'
import { RouterCaptiveFlowInitializer } from './router-captive-flow.initializer'

describe('RouterCaptiveFlowInitializer', () => {
  it('forbids automatic MAC auth but requires trusted mac-cookie reconnect and no local logout timers', () => {
    const mutableService = {
      buildProvisioningScript: jest.fn(() => [
        '/ip hotspot profile set [find name="test"] use-radius=yes login-by=mac,cookie,http-pap mac-auth-mode=mac-as-username-and-password',
        '/ip hotspot profile set [find name="second"] login-by=http-pap,mac',
        '/ip hotspot user profile set [find default=yes] shared-users=1 add-mac-cookie=yes mac-cookie-timeout=1d idle-timeout=31d keepalive-timeout=30d session-timeout=5m',
        ':foreach up in=[/ip hotspot user profile find] do={ /ip hotspot user profile set $up shared-users=1 add-mac-cookie=yes mac-cookie-timeout=365d keepalive-timeout=2m }',
      ].join('\n')),
    }
    const moduleRef = {
      get: jest.fn(() => undefined),
    }

    const initializer = new RouterCaptiveFlowInitializer(
      moduleRef as unknown as ModuleRef,
      mutableService as unknown as MikrotikService,
    )
    initializer.onModuleInit()

    const script = mutableService.buildProvisioningScript()
    const loginValues = Array.from(script.matchAll(/login-by=([^\s]+)/g)).map((match) => match[1])

    expect(loginValues).not.toHaveLength(0)
    for (const value of loginValues) {
      expect(value.split(',')).not.toContain('mac')
      expect(value).toBe('cookie,mac-cookie,http-pap')
    }
    expect(script).not.toContain('mac-auth-mode=')
    expect(script).toContain(
      'shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d idle-timeout=none keepalive-timeout=none session-timeout=0s',
    )
    expect(script).not.toContain('idle-timeout=31d')
    expect(script).not.toContain('keepalive-timeout=30d')
    expect(script).toContain('name="arofi-session-policy"')
    expect(script).toContain('interval=1m')
  })

  it('restores active returning-device auto reconnect with an immediate top-level RouterOS POST', () => {
    const oldConnect = "function conn(rc){if(!rc||!rc.username)return;var dst=CONNECTED;var target=(rc.loginUrl||lo||'http://10.55.0.1/login');window.location.href=target+'?username='+encodeURIComponent(rc.username)+'&password='+encodeURIComponent(rc.password||rc.username)+'&dst='+encodeURIComponent(dst);}"
    const controller = {
      prepareLoginHtml: jest.fn((html: string) => html),
    }
    const moduleRef = {
      get: jest.fn((token: unknown) => token === MikrotikController ? controller : undefined),
    }
    const mutableService = {
      buildProvisioningScript: jest.fn(() => 'login-by=cookie,mac-cookie,http-pap'),
    }

    const initializer = new RouterCaptiveFlowInitializer(
      moduleRef as unknown as ModuleRef,
      mutableService as unknown as MikrotikService,
    )
    initializer.onModuleInit()

    const html = controller.prepareLoginHtml([
      '<html><head></head><body><script>',
      'var autoReady=false;',
      "var loopGuard=_lastAuto&&(Date.now()-_lastAuto)<8000;",
      oldConnect,
      '</script></body></html>',
    ].join(''))

    expect(html).toContain(
      'var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;',
    )
    expect(html).toContain('(Date.now()-_lastAuto)<2500')
    expect(html).toContain("f.method='post';f.action=target;f.style.display='none'")
    expect(html).toContain('document.body.appendChild(f);f.submit();}')
    expect(html).not.toContain('window.location.href=target+\'?username=')
    expect(html).not.toContain('window.setTimeout')
    expect(html).not.toContain('arofiLoginFrame')
  })
})
