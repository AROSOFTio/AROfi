import { appendInstantAloginInstaller } from './mikrotik-instant-login.interceptor'

describe('appendInstantAloginInstaller', () => {
  const provisioningScript = [
    '/tool fetch url="https://arofi.net/api/mikrotik/status-html/router-key" check-certificate=no mode=https dst-path="hotspot/status.html"',
    '/tool fetch url="http://203.0.113.10/api/mikrotik/status-html/router-key" mode=http dst-path="hotspot/status.html"',
  ].join('\n')

  it('installs the post-login page from HTTPS with an HTTP fallback', () => {
    const result = appendInstantAloginInstaller(provisioningScript)

    expect(result).toContain(
      'https://arofi.net/api/mikrotik/alogin-html/router-key',
    )
    expect(result).toContain(
      'http://203.0.113.10/api/mikrotik/alogin-html/router-key',
    )
    expect(result).toContain('dst-path="hotspot/alogin.html"')
    expect(result).toContain('post-login redirect is instant')
  })

  it('does not append the installer more than once', () => {
    const first = appendInstantAloginInstaller(provisioningScript)
    const second = appendInstantAloginInstaller(first)

    expect(second).toBe(first)
  })

  it('leaves unrelated text untouched', () => {
    expect(appendInstantAloginInstaller('plain text')).toBe('plain text')
  })
})
