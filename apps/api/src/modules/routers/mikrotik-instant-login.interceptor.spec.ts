import { appendInstantAloginInstaller } from './mikrotik-instant-login.interceptor'

describe('appendInstantAloginInstaller', () => {
  const provisioningScript = [
    '# AROFi MikroTik onboarding script (safe / additive)',
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

  it('uses a long idle timeout while preserving bundle expiry cutoffs', () => {
    const result = appendInstantAloginInstaller(provisioningScript)

    expect(result).toContain(
      'idle-timeout=31d keepalive-timeout=none session-timeout=0s',
    )
    expect(result).toContain(
      'active bundles stay online until their real expiry',
    )
    expect(result).toContain('mac-cookie-timeout=30d')
  })

  it('adds persistence even when an existing router script has no status page URL', () => {
    const existingRouterScript = [
      '# AROFi MikroTik onboarding script (safe / additive)',
      '/ip hotspot user profile print',
    ].join('\n')

    const result = appendInstantAloginInstaller(existingRouterScript)

    expect(result).toContain('idle-timeout=31d')
    expect(result).not.toContain('hotspot/alogin.html')
  })

  it('does not append either repair more than once', () => {
    const first = appendInstantAloginInstaller(provisioningScript)
    const second = appendInstantAloginInstaller(first)

    expect(second).toBe(first)
    expect(second.match(/keep paid sessions online until RADIUS bundle expiry/g)).toHaveLength(1)
    expect(second.match(/replace MikroTik stock alogin\.html/g)).toHaveLength(1)
  })

  it('leaves unrelated text untouched', () => {
    expect(appendInstantAloginInstaller('plain text')).toBe('plain text')
  })
})
