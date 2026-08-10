import { ModuleRef } from '@nestjs/core'
import { MikrotikController } from './mikrotik.controller'
import { MikrotikService } from './mikrotik.service'
import { RouterCaptiveFlowInitializer } from './router-captive-flow.initializer'

describe('RouterCaptiveFlowInitializer', () => {
  it('permanently removes automatic MAC auth from every generated HotSpot profile', () => {
    const mutableService = {
      buildProvisioningScript: jest.fn(() => [
        '/ip hotspot profile set [find name="test"] use-radius=yes login-by=mac,cookie,http-pap mac-auth-mode=mac-as-username-and-password',
        '/ip hotspot profile set [find name="second"] login-by=http-pap,mac',
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

    expect(script).toContain('login-by=cookie,http-pap')
    expect(script).toContain('login-by=http-pap,cookie')
    expect(script).not.toMatch(/login-by=[^\s]+(?:^|,)mac(?:,|$)/)
    expect(script).not.toContain('mac-auth-mode=')
  })

  it('keeps the proven immediate top-level RouterOS POST with no timer or iframe', () => {
    const oldConnect = "function conn(rc){if(!rc||!rc.username)return;var dst=CONNECTED;var target=(rc.loginUrl||lo||'http://10.55.0.1/login');window.location.href=target+'?username='+encodeURIComponent(rc.username)+'&password='+encodeURIComponent(rc.password||rc.username)+'&dst='+encodeURIComponent(dst);}"
    const controller = {
      prepareLoginHtml: jest.fn((html: string) => html),
    }
    const moduleRef = {
      get: jest.fn((token: unknown) => token === MikrotikController ? controller : undefined),
    }
    const mutableService = {
      buildProvisioningScript: jest.fn(() => 'login-by=cookie,http-pap'),
    }

    const initializer = new RouterCaptiveFlowInitializer(
      moduleRef as unknown as ModuleRef,
      mutableService as unknown as MikrotikService,
    )
    initializer.onModuleInit()

    const html = controller.prepareLoginHtml(`<html><head></head><body><script>${oldConnect}</script></body></html>`)

    expect(html).toContain("f.method='post';f.action=target;f.style.display='none'")
    expect(html).toContain('document.body.appendChild(f);f.submit();}')
    expect(html).not.toContain('window.setTimeout')
    expect(html).not.toContain('arofiLoginFrame')
  })
})
