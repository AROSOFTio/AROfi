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

    expect(script).toContain('/ip service enable api')
    expect(script).toContain('address=radius.example.com')
    expect(script).toContain('authentication-port=1812')
    expect(script).toContain('accounting-port=1813')
    expect(script).toContain('secret="dev_radius_shared_secret"')
    expect(script).toContain('/radius remove [find where comment="AROFi')
    expect(script).toContain('/radius remove [find address=radius.example.com]')
    expect(script).toContain('shared-users=1')
    expect(script).toContain('radius-accounting=yes')
    expect(script).toContain('radius-interim-update=5m')
    expect(script).toContain('mode=http keep-result=no')
    expect(script).toContain('/api/mikrotik/provisioned/')
    expect(script).toContain('/api/mikrotik/login-html/')
    expect(script).toContain('dst-path="hotspot/login.html"')
    expect(script).toContain('/ip hotspot set [find name="hotspot1"] profile="arofi-')
  })

  it('builds a fuller fresh captive Wi-Fi setup with open SSID, bridge, DHCP, DNS, NAT, and server binding', () => {
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

    expect(script).toContain('/ip service enable winbox')
    expect(script).toContain('password="KnownPassword123"')
    expect(script).toContain('/interface bridge add name=bridgeLocal')
    expect(script).toContain('/interface bridge port remove [find interface=ether1]')
    expect(script).toContain('/ip dhcp-client add interface=ether1')
    expect(script).toContain('AROFi provisioning callback sent')
    expect(script).toContain('/api/mikrotik/login-html/fresh-router-token')
    expect(script).toContain('dst-path="hotspot/login.html"')
    expect(script).toContain('/interface wifi find name="wifi1"')
    expect(script).toContain('security.authentication-types=""')
    expect(script).toContain('/interface wireless find name="wlan1"')
    expect(script).toContain('/interface wireless cap set enabled=no')
    expect(script).toContain('security-profile=arofi-open')
    expect(script).toContain('ssid="AROFi Free WiFi"')
    expect(script).toContain('/interface bridge port add bridge=bridgeLocal')
    expect(script).toContain('/ip address add address=10.50.0.1/24 interface=bridgeLocal')
    expect(script).toContain('/ip pool add name=arofi-pool')
    expect(script).toContain('/ip dhcp-server add name=arofi-dhcp')
    expect(script).toContain('/ip dns set allow-remote-requests=yes')
    expect(script).toContain('/ip firewall nat remove [find comment="AROFi nat"]')
    expect(script).toContain('/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade')
    expect(script).toContain('/ip hotspot add name="ARO SpeedX" interface=bridgeLocal')
  })

  it('serves a MikroTik login page that forwards captive portal parameters to AROFi', () => {
    const service = new MikrotikService(new ConfigService({ PORTAL_PUBLIC_HOST: 'wifi.example.com' }))

    const html = service.buildLoginHtml('router-key-123')

    expect(html).toContain('https://wifi.example.com/portal')
    expect(html).toContain('params.set("mac", "$(mac)")')
    expect(html).toContain('params.set("ip", "$(ip)")')
    expect(html).toContain('params.set("link-login", "$(link-login-only)")')
    expect(html).toContain('params.set("server", "$(server-name)")')
    expect(html).toContain('params.set("routerKey", "router-key-123")')
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
      portalHosts: ['portal.arofi.test', 'sandbox.momodeveloper.mtn.com', 'portal.arofi.test'],
      ttlAntiTetheringEnabled: true,
    })

    expect(script).toContain('/ip hotspot walled-garden remove [find comment="AROFi portal"]')
    expect(script.match(/dst-host="portal\.arofi\.test"/g)).toHaveLength(1)
    expect(script).toContain('/ip firewall mangle remove [find comment="AROFi anti-tether"]')
    expect(script).toContain('new-ttl=set:1')
    expect(script).toContain('AROFi anti-tether')
  })
})
