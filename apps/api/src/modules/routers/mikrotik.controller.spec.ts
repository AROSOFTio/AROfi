import { MikrotikController } from './mikrotik.controller'
import { RoutersService } from './routers.service'

describe('MikrotikController completion pages', () => {
  const routersService = {
    getMikrotikStatusHtmlByKey: jest.fn(async () => '<div>Connected</div>'),
  }

  it('returns an invisible close/connectivity document for status.html', async () => {
    const controller = new MikrotikController(routersService as unknown as RoutersService)

    const html = await controller.getStatusHtml('router-key')

    expect(html).toContain('window.close()')
    expect(html).toContain('connectivitycheck.gstatic.com/generate_204')
    expect(html).toContain('www.msftconnecttest.com/connecttest.txt')
    expect(html).toContain('captive.apple.com/hotspot-detect.html')
    expect(html).toContain('body{visibility:hidden}')
    expect(html).not.toContain('>Connected<')
    expect(html).not.toContain('You can close this page')
  })

  it('uses the same invisible completion response for alogin.html', async () => {
    const controller = new MikrotikController(routersService as unknown as RoutersService)

    const html = await controller.getAloginHtml('router-key')

    expect(html).toContain("var target='$(link-redirect)'")
    expect(html).toContain('window.location.replace(target)')
    expect(html).not.toContain('>Connected<')
  })
})
