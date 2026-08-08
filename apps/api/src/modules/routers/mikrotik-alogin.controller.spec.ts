import { MikrotikAloginController } from './mikrotik-alogin.controller'
import { RoutersService } from './routers.service'

describe('MikrotikAloginController', () => {
  const routersService = {
    getMikrotikStatusHtmlByKey: jest.fn(async () => '<div>Connected</div>'),
  }

  it('returns an invisible close/connectivity document with no connected page', async () => {
    const controller = new MikrotikAloginController(routersService as unknown as RoutersService)

    const html = await controller.getAloginHtml('router-key')

    expect(html).toContain("var target='$(link-redirect)'")
    expect(html).toContain('window.location.replace(target)')
    expect(html).toContain('window.close()')
    expect(html).toContain('connectivitycheck.gstatic.com/generate_204')
    expect(html).toContain('body{visibility:hidden}')
    expect(html).not.toContain('>Connected<')
    expect(html).not.toContain('<title>Connected</title>')
    expect(html).not.toContain('Connected. <a')
  })
})
