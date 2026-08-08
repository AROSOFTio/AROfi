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

  it('finishes voucher, return and MoMo access with one immediate RouterOS POST and no connected page', () => {
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
      'var API="https://arofi.net",APIFB="http://95.111.234.34",RKEY="key",CONNECTED="http://business.wifi/login?connected=1";',
      'var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"";',
      'var autoReady=false;',
      "var loopGuard=_lastAuto&&(Date.now()-_lastAuto)<8000;",
      "var _up=new URLSearchParams(search);\n      if(_up.get('connected')==='1'){\n        document.getElementById('loading').style.display='none';\n        document.getElementById('content').style.display='block';\n        return;\n      }\n\n",
      'setTimeout(login, 200);',
      "      sst('Verifying voucher...','info');",
      "          sst('Success! Connecting...','ok');\n          conn(res.reconnect);",
      "        var cu=pmt.checkoutUrl||(pmt.responsePayload&&(pmt.responsePayload.checkoutUrl||(pmt.responsePayload.gateway&&pmt.responsePayload.gateway.checkoutUrl)));\n        if(cu){window.location.href=cu;return;}\n        sst(selTv?'Enter your Mobile Money PIN. After approval, reconnect the Smart TV to WiFi.':'Enter your Mobile Money PIN on your phone. Waiting for approval...','info');\n        poll(pmt.id,pmt.statusToken);",
      "    function poll(id,tok){\n      var n=0,iv=setInterval(function(){\n        if(++n>200){clearInterval(iv);sst('Timed out waiting for payment.','err');document.getElementById('pbtn').disabled=false;return;}\n        apiCall('POST', '/api/payments/'+id+'/check-status'+(tok?'?token='+encodeURIComponent(tok):''), null, function(err, p){\n          if(err) return;\n          if(p.activation){\n            if(selTv){\n              clearInterval(iv);\n              document.getElementById('pbtn').disabled=false;\n              closePay();\n              var tvm=normMac(document.getElementById('tvmac').value);\n              sst('Payment approved. Smart TV '+tvm+' is active. On the TV, open WiFi settings and select this WiFi again. If it is already connected, forget/disconnect then reconnect.','ok');\n            }else if(p.reconnect&&p.reconnect.username){clearInterval(iv);sst('Payment Approved! Connecting...','ok');conn(p.reconnect);}else{sst('Payment approved. Finalizing login...','info');}\n          }\n          else if(p.status==='FAILED'){clearInterval(iv);sst(p.statusMessage||'Payment Declined.','err');document.getElementById('pbtn').disabled=false;}\n        });\n      },600);\n    }\n\n    function rec(){",
      oldConnect,
      '</script></body></html>',
    ].join(''))

    expect(html).toContain(
      'var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;',
    )
    expect(html).toContain('(Date.now()-_lastAuto)<2500')
    expect(html).toContain('orig="$(link-orig)"||""')
    expect(html).toContain('function finishTarget()')
    expect(html).toContain("f.method='post';f.action=target;f.style.display='none'")
    expect(html).toContain("add('dst',finishTarget())")
    expect(html).toContain("add('popup','false')")
    expect(html).toContain('document.documentElement.style.visibility=\'hidden\';f.submit();}')
    expect(html).toContain('function check()')
    expect(html).toContain('check();')
    expect(html).toContain('setTimeout(check,500)')
    expect(html).toContain('login();')

    expect(html).not.toContain('?connected=1')
    expect(html).not.toContain("_up.get('connected')")
    expect(html).not.toContain('setTimeout(login, 200)')
    expect(html).not.toContain('window.location.href=cu')
    expect(html).not.toContain('setInterval(function()')
    expect(html).not.toContain("sst('Success! Connecting...'")
    expect(html).not.toContain("sst('Payment Approved! Connecting...'")
    expect(html).not.toContain('window.location.href=target+\'?username=')
    expect(html).not.toContain('arofiLoginFrame')
  })
})
