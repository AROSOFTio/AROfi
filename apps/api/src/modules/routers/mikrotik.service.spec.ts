import { ConfigService } from '@nestjs/config'
import { RouterConnectionMode } from '@prisma/client'
import { MikrotikService } from './mikrotik.service'

describe('MikrotikService', () => {
  it('builds a RouterOS provisioning script with radius settings', () => {
    const service = new MikrotikService(
      new ConfigService({
        RADIUS_PUBLIC_HOST: 'radius.example.com',
        RADIUS_AUTH_PORT: '1812',
        RADIUS_ACCOUNTING_PORT: '1813',
        RADIUS_SHARED_SECRET: 'dev_radius_shared_secret',
      }),
    )

    const radius = service.getRadiusServerConfig()
    const script = service.buildProvisioningScript({
      routerName: 'City Centre Gateway',
      identity: 'city-core-rtr01',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      radiusHost: radius.host,
      radiusAuthPort: radius.authPort,
      radiusAccountingPort: radius.accountingPort,
      sharedSecret: radius.sharedSecret,
    })

    expect(script).toContain('/ip service set api')
    expect(script).toContain('address=radius.example.com')
    expect(script).toContain('authentication-port=1812')
    expect(script).toContain('accounting-port=1813')
    expect(script).toContain('secret="dev_radius_shared_secret"')
    expect(script).toContain('/radius remove [/radius find comment="AROFi')
    expect(script).toContain('radius-accounting=yes')
    expect(script).toContain('radius-interim-update=5m')
    expect(script).toContain('login-by=http-pap')
    expect(script).toContain('mode=http keep-result=no')
    expect(script).toContain('/api/mikrotik/provisioned/')
    expect(script).toContain('/api/mikrotik/login-html/')
    expect(script).toContain('dst-path="hotspot/login.html"')
    // Default mode builds an isolated customer hotspot, never touching the LAN.
    expect(script).toContain('/ip hotspot add name="arofi-hotspot" interface=arofi-hotspot')

    // Safety guarantees: never change admin credentials, never rebuild WAN/LAN.
    expect(script).not.toContain('/user set')
    expect(script).not.toContain('password=')
    expect(script).not.toContain('/ip address remove [/ip address find address="192.168')
    expect(script).not.toContain('/ip address remove [/ip address find address="10.50.0.1/24"]')
    expect(script).not.toContain('/ip dhcp-client add interface=ether1')
  })

  it('builds an additive customer Wi-Fi hotspot on an isolated bridge without disturbing WAN or admin login', () => {
    const service = new MikrotikService(new ConfigService({}))

    const script = service.buildProvisioningScript({
      routerName: 'Fresh Router',
      identity: 'fresh-router',
      registrationKey: 'fresh-router-token',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      radiusHost: 'radius.example.com',
      radiusAuthPort: 1812,
      radiusAccountingPort: 1813,
      sharedSecret: 'fresh-router-secret',
      adminUsername: 'admin',
      adminPassword: 'KnownPassword123',
      hotspotServerName: 'ARO SpeedX',
      hotspotNetworkName: 'AROFi Free WiFi',
      mode: 'FRESH_FULL_CAPTIVE_WIFI',
    })

    expect(script).toContain('/ip service set winbox')
    expect(script).toContain('/interface bridge add name=arofi-hotspot')
    expect(script).toContain('AROFi provisioning callback sent')
    expect(script).toContain('/api/mikrotik/self-test/fresh-router-token')
    expect(script).toContain('AROFi provisioning self-test passed')
    expect(script).toContain('/api/mikrotik/login-html/fresh-router-token')
    expect(script).toContain('dst-path="hotspot/login.html"')
    // Radio commands are deferred through [:parse] so a missing menu on the
    // wrong RouterOS version is a catchable runtime error, not a fatal compile
    // error. The inner quotes are therefore escaped inside the parse string.
    expect(script).toContain('[:parse ')
    expect(script).toContain('/interface wifi find')
    expect(script).toContain(':local arofiRadioName [/interface wifi get $arofiRadio name]')
    expect(script).toContain('security.authentication-types=\\"\\"')
    expect(script).toContain('/interface wireless find')
    expect(script).toContain(':local arofiRadioName [/interface wireless get $arofiRadio name]')
    expect(script).toContain('/interface wifiwave2 find')
    expect(script).toContain('security-profile=arofi-open')
    expect(script).toContain('ssid=\\"AROFi Free WiFi\\"')
    expect(script).toContain('bridge=$bridgeId')
    expect(script).toContain('no wireless interface is attached; searching for a non-WAN Ethernet hotspot port')
    expect(script).toContain('/ip address add address=10.55.0.1/24 interface=arofi-hotspot')
    expect(script).toContain('/ip pool add name=arofi-pool')
    expect(script).toContain('/ip dhcp-server add name=arofi-dhcp')
    expect(script).toContain('/ip dns set allow-remote-requests=yes')
    expect(script).toContain('/ip firewall nat add chain=srcnat src-address=10.55.0.0/24 out-interface=$wanIface action=masquerade')
    expect(script).toContain('/ip hotspot add name="ARO SpeedX" interface=arofi-hotspot')
    expect(script).toContain('/ip hotspot set $existingHotspot interface=arofi-hotspot')
    expect(script.indexOf('/ip hotspot remove [/ip hotspot find name="ARO SpeedX"]')).toBeGreaterThan(
      script.indexOf('AROFi provisioning self-test FAILED'),
    )

    // The KEY safety guarantees that prevent the lockout we hit before.
    expect(script).not.toContain('password="KnownPassword123"')
    expect(script).not.toContain('/ip address remove [/ip address find address="192.168')
    expect(script).not.toContain('/ip address remove [/ip address find address="10.50.0.1/24"]')
  })

  it('wires an existing hotspot to RADIUS only, creating no bridge or Wi-Fi, in SAFE_EXISTING_ROUTER mode', () => {
    const service = new MikrotikService(new ConfigService({}))

    const script = service.buildProvisioningScript({
      routerName: 'Existing Router',
      identity: 'existing-router',
      registrationKey: 'existing-token',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      radiusHost: 'radius.example.com',
      radiusAuthPort: 1812,
      radiusAccountingPort: 1813,
      sharedSecret: 'existing-secret',
      mode: 'SAFE_EXISTING_ROUTER',
    })

    expect(script).toContain(':foreach h in=[/ip hotspot find] do={')
    expect(script).toContain('use-radius=yes')
    expect(script).not.toContain('/interface bridge add name=arofi-hotspot')
    expect(script).not.toContain('ssid=')
    expect(script).not.toContain('/ip address add')
  })

  it('serves a MikroTik login page that forwards captive portal parameters to AROFi', () => {
    const service = new MikrotikService(new ConfigService({ PORTAL_PUBLIC_HOST: 'wifi.example.com' }))

    const html = service.buildLoginHtml('router-key-123')

    expect(html).toContain('API="https://wifi.example.com"')
    expect(html).toContain('RKEY="router-key-123"')
    expect(html).toContain('mac="$(mac)"')
    expect(html).toContain('ip="$(ip)"')
    expect(html).toContain('lo="$(link-login-only)"')
    expect(html).toContain('srv="$(server-name)"')
  })

  it('builds idempotent walled garden and optional TTL anti-tethering sections', () => {
    const service = new MikrotikService(
      new ConfigService({
        RADIUS_PUBLIC_HOST: 'radius.example.com',
      }),
    )

    const script = service.buildProvisioningScript({
      routerName: 'Branch Router',
      identity: 'branch-router',
      registrationKey: 'router-registration-token',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      radiusHost: 'radius.example.com',
      radiusAuthPort: 1812,
      radiusAccountingPort: 1813,
      sharedSecret: 'unique-router-secret',
      portalHosts: [
        'portal.arofi.test',
        'sandbox.momodeveloper.mtn.com',
        'pay.pesapal.com',
        '*.pesapal.com',
        'portal.arofi.test',
      ],
      ttlAntiTetheringEnabled: true,
    })

    expect(script).toContain('/ip hotspot walled-garden remove [/ip hotspot walled-garden find comment="AROFi portal"]')
    expect(script.match(/dst-host="portal\.arofi\.test"/g)).toHaveLength(1)
    expect(script).toContain('dst-host="pay.pesapal.com"')
    expect(script).toContain('dst-host="*.pesapal.com"')
    expect(script).toContain('/ip firewall mangle remove [/ip firewall mangle find comment="AROFi anti-tether"]')
    expect(script).toContain('new-ttl=decrement:1')
    expect(script).toContain('AROFi anti-tether')
  })

  function countOccurrences(text: string, char: string) {
    return text.split(char).length - 1
  }

  function expectBalanced(script: string) {
    // Every quoted/brace pair in a RouterOS script must balance, or the
    // import aborts mid-script. This cheap smoke test has already caught real
    // bugs (e.g. a stray ternary, or an under/over-escaped nested source
    // string for a generated scheduler script).
    const unescapedQuotes = countOccurrences(script.replace(/\\"/g, ''), '"')
    expect(unescapedQuotes % 2).toBe(0)
    expect(countOccurrences(script, '{')).toBe(countOccurrences(script, '}'))
    expect(countOccurrences(script, '[')).toBe(countOccurrences(script, ']'))
  }

  it('hardens WAN/LAN separation and self-heals via a 60s watchdog (FRESH_FULL_HOTSPOT)', () => {
    const service = new MikrotikService(new ConfigService({}))

    const script = service.buildProvisioningScript({
      routerName: 'Watchdog Router',
      identity: 'watchdog-router',
      registrationKey: 'watchdog-token',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      radiusHost: 'radius.example.com',
      radiusAuthPort: 1812,
      radiusAccountingPort: 1813,
      sharedSecret: 'watchdog-secret',
      hotspotServerName: 'arofi-hotspot',
      portalHosts: ['arofi.arosoft.io'],
      deviceLimit: 1,
      mode: 'FRESH_FULL_HOTSPOT',
      hotspotNetworkName: 'Watchdog WiFi',
    })

    expectBalanced(script)
    expect(script).toContain('arofi-watchdog')
    expect(script).toContain('/api/mikrotik/watchdog/watchdog-token')
    expect(script).toContain('wan_removed_from_bridge')
    expect(script).toContain('stray_dhcp_client_removed')
    // Failure #1: NAT must never be silently reported as "skip" in fresh-hotspot mode.
    expect(script).not.toMatch(/nat=skip/)
    expect(script).toContain('arofiNatOk')
  })

  it('omits the watchdog for SAFE_EXISTING_ROUTER (nothing of ours to self-heal)', () => {
    const service = new MikrotikService(new ConfigService({}))

    const script = service.buildProvisioningScript({
      routerName: 'Existing Router 2',
      identity: 'existing-router-2',
      registrationKey: 'existing-token-2',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      radiusHost: 'radius.example.com',
      radiusAuthPort: 1812,
      radiusAccountingPort: 1813,
      sharedSecret: 'existing-secret-2',
      mode: 'SAFE_EXISTING_ROUTER',
    })

    expectBalanced(script)
    expect(script).not.toContain('arofi-watchdog')
    expect(script).toContain('bridge=skip,bridge_port=skip,dhcp=skip,nat=skip')
  })
})
