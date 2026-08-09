import {
  appendInstantAloginInstaller,
  enforceDeliveredSessionPolicy,
} from './mikrotik-instant-login.interceptor'

describe('appendInstantAloginInstaller', () => {
  const provisioningScript = [
    '# AROFi MikroTik onboarding script (safe / additive)',
    '/tool fetch url="https://arofi.net/api/mikrotik/status-html/router-key" check-certificate=no dst-path="hotspot/status.html"',
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

  it('disables local logout timers and enables trusted returning-device mac-cookie', () => {
    const result = appendInstantAloginInstaller(provisioningScript)

    expect(result).toContain(
      'login-by=cookie,mac-cookie,http-pap http-cookie-lifetime=30d',
    )
    expect(result).toContain(
      'idle-timeout=none keepalive-timeout=none session-timeout=0s',
    )
    expect(result).toContain(
      'active bundles stay online and returning devices reconnect automatically',
    )
    expect(result).toContain('add-mac-cookie=yes mac-cookie-timeout=30d')
    expect(result).not.toContain('idle-timeout=31d')
    expect(result).not.toContain('keepalive-timeout=30d')
  })

  it('strips automatic MAC auth from the final delivered script even when a marker already exists', () => {
    const regressedScript = [
      '# AROFi MikroTik onboarding script (safe / additive)',
      '# AROFi: permanent active-bundle and returning-device policy',
      '/ip hotspot profile set [find] login-by=mac,cookie,http-pap mac-auth-mode=mac-as-username-and-password',
      '/ip hotspot user profile set [find] shared-users=1 add-mac-cookie=yes mac-cookie-timeout=1d keepalive-timeout=30d',
    ].join('\n')

    const result = appendInstantAloginInstaller(regressedScript)

    expect(result).toContain('login-by=cookie,mac-cookie,http-pap')
    expect(result).toContain(
      'shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d idle-timeout=none keepalive-timeout=none session-timeout=0s',
    )
    expect(result).not.toMatch(/login-by=[^\s]*\bmac(?:,|\s)/)
    expect(result).not.toContain('mac-auth-mode=')
    expect(result).not.toContain('keepalive-timeout=30d')
  })

  it('normalizes alternate profile values directly', () => {
    const result = enforceDeliveredSessionPolicy([
      '/ip hotspot profile set [find] login-by=http-pap,mac',
      '/ip hotspot user profile set [find] shared-users=4 add-mac-cookie=no mac-cookie-timeout=365d idle-timeout=5m keepalive-timeout=2m session-timeout=1h',
    ].join('\n'))

    expect(result).toContain('login-by=cookie,mac-cookie,http-pap')
    expect(result).toContain(
      'shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d idle-timeout=none keepalive-timeout=none session-timeout=0s',
    )
    expect(result).not.toContain('login-by=http-pap,mac')
  })

  it('adds persistence even when an existing router script has no status page URL', () => {
    const existingRouterScript = [
      '# AROFi MikroTik onboarding script (safe / additive)',
      '/ip hotspot user profile print',
    ].join('\n')

    const result = appendInstantAloginInstaller(existingRouterScript)

    expect(result).toContain('idle-timeout=none')
    expect(result).toContain('login-by=cookie,mac-cookie,http-pap')
    expect(result).not.toContain('hotspot/alogin.html')
  })

  it('does not append either repair more than once', () => {
    const first = appendInstantAloginInstaller(provisioningScript)
    const second = appendInstantAloginInstaller(first)

    expect(second).toBe(first)
    expect(second.match(/permanent active-bundle and returning-device policy/g)).toHaveLength(1)
    expect(second.match(/replace MikroTik stock alogin\.html/g)).toHaveLength(1)
  })

  it('leaves unrelated text untouched', () => {
    expect(appendInstantAloginInstaller('plain text')).toBe('plain text')
  })
})
