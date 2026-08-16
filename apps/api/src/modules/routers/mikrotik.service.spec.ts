import { ConfigService } from '@nestjs/config'
import { RouterConnectionMode } from '@prisma/client'
import { MikrotikService } from './mikrotik.service'

describe('MikrotikService', () => {
  it('builds a RouterOS provisioning script with persistent active-bundle settings', () => {
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
    expect(script).toContain('/radius remove [find where comment="AROFi')
    expect(script).toContain('shared-users=1')
    expect(script).toContain('radius-accounting=yes')
    expect(script).toContain('radius-interim-update=1m')
    expect(script).toContain('login-by=cookie,mac-cookie,http-pap')
    expect(script).toContain('http-cookie-lifetime=30d')
    expect(script).not.toContain('mac-auth-mode=')
    expect(script).toContain('add-mac-cookie=yes mac-cookie-timeout=30d')
    expect(script).toContain('idle-timeout=none keepalive-timeout=none session-timeout=0s')
    expect(script).not.toContain('idle-timeout=31d')
    expect(script).not.toContain('keepalive-timeout=30d')
    expect(script).toContain('/ip hotspot ip-binding remove [find type=bypassed]')
    expect(script).toContain('keep-result=no')
    expect(script).toContain('arofiHeartbeatUrl')
    expect(script).toContain('https://arofi.net/api/mikrotik/heartbeat/')
    const heartbeatScriptLine = script
      .split('\n')
      .find((line) => line.includes('/system script add name="arofi-heartbeat"'))
    expect(heartbeatScriptLine).toContain('arofiActiveUsers')
    expect(heartbeatScriptLine).toContain('arofiActiveMacs')
    expect(heartbeatScriptLine).toContain('/ip hotspot active find')
    expect(heartbeatScriptLine).toContain('activeUsers=\\$arofiActiveUsers')
    expect(heartbeatScriptLine).toContain('activeMacs=\\$arofiActiveMacs')
    expect(heartbeatScriptLine).toContain('get \\$a mac-address')
    expect(script).toContain('interval=5s on-event="arofi-heartbeat"')
    expect(script).toContain('/api/mikrotik/provisioned/')
    expect(script).toContain('/api/mikrotik/login-html/')
    expect(script).toContain('dst-path="hotspot/login.html"')
    expect(script).toContain('/ip hotspot add name="arofi-hotspot" interface=arofi-hotspot')

    expect(script).not.toContain('/user set [find name=')
    expect(script).not.toContain('password=')
    expect(script).not.toContain('/interface bridge port remove [find interface=ether1]')
    expect(script).not.toContain('/ip address remove [find address="192.168')
    expect(script).not.toContain('/ip address remove [find address="10.50.0.1/24"]')
    expect(script).not.toContain('/ip dhcp-client add interface=ether1')
  })

  it('uses the isolated dev RADIUS endpoint when dev host env is present without explicit ports', () => {
    const service = new MikrotikService(
      new ConfigService({
        RADIUS_PUBLIC_HOST: 'dev.arofi.net',
        RADIUS_SHARED_SECRET: 'dev_radius_shared_secret',
      }),
    )

    const radius = service.getRadiusServerConfig()

    expect(radius.host).toBe('95.111.234.34')
    expect(radius.authPort).toBe(1814)
    expect(radius.accountingPort).toBe(1815)
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
    expect(script).toContain('/api/mikrotik/login-html/fresh-router-token')
    expect(script).toContain('dst-path="hotspot/login.html"')
    expect(script).toContain('[:parse ')
    expect(script).toContain('/interface wifi find name=\\"wifi1\\"')
    expect(script).toContain('security.authentication-types=\\"\\"')
    expect(script).toContain('/interface wireless find name=\\"wlan1\\"')
    expect(script).toContain('security-profile=arofi-open')
    expect(script).toContain('ssid=\\"AROFi Free WiFi\\"')
    expect(script).not.toContain('band=2ghz-b/g/n')
    expect(script).toContain('wifi1 open-security setting skipped')
    expect(script).toContain('bridge=arofi-hotspot')
    expect(script).toContain('/interface ethernet find')
    expect(script).toContain('$ethName != "ether1"')
    expect(script).toContain('$ethName != "ether2"')
    expect(script).toContain('$ethRunning = false')
    expect(script).toContain('destination=$arofiWanMgmtAnchor')
    expect(script).toContain('destination=$arofiHotspotInputAnchor')
    expect(script).toContain('destination=$arofiHotspotMgmtAnchor')
    expect(script).toContain('destination=$arofiHotspotForwardAnchor')
    expect(script).not.toContain('destination=0')
    expect(script).toContain('/ip address add address=10.55.0.1/24 interface=arofi-hotspot')
    expect(script).toContain('/ip pool add name=arofi-pool')
    expect(script).toContain('/ip dhcp-server add name=arofi-dhcp')
    expect(script).toContain('/ip dns set allow-remote-requests=yes')
    expect(script).toContain(':foreach r in=[/ip route find dst-address="0.0.0.0/0" active=yes]')
    expect(script).toContain('PPPoE WAN scan skipped')
    expect(script).toContain('LTE WAN scan skipped')
    expect(script).toContain('\\$arofiWanIface')
    expect(script).toContain('AROFi: WAN interface not detected')
    expect(script).toContain('/ip hotspot add name="ARO SpeedX" interface=arofi-hotspot')

    expect(script).not.toContain('password="KnownPassword123"')
    expect(script).not.toContain('/interface bridge port remove [find interface=ether1]')
    expect(script).not.toContain('/ip address remove [find address="192.168')
    expect(script).not.toContain('/ip address remove [find address="10.50.0.1/24"]')
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
      dnsName: 'tenantname.wifi',
    })

    expect(script).toContain(':foreach h in=[/ip hotspot find] do={')
    expect(script).toContain('use-radius=yes')
    expect(script).not.toContain('/interface bridge add name=arofi-hotspot')
    expect(script).not.toContain('ssid=')
    expect(script).not.toContain('/ip address add')
    expect(script).toContain(':local arofiHotspotAddress [/ip hotspot profile get [find name="arofi-existing"] hotspot-address]')
    expect(script).toContain('/ip dns static add name="tenantname.wifi" address=$arofiHotspotAddress')
    expect(script).toContain('/ip dhcp-server network set [find gateway=$arofiHotspotAddress] dns-server=$arofiHotspotAddress')
  })

  it('serves a MikroTik login page that forwards captive portal parameters to AROFi', () => {
    const service = new MikrotikService(new ConfigService({ PORTAL_PUBLIC_HOST: 'wifi.example.com' }))

    const html = service.buildLoginHtml('router-key-123', 'http://tenantname.wifi/login')

    expect(html).toContain('var API="https://wifi.example.com"')
    expect(html).toContain('RKEY="router-key-123"')

    expect(html).toContain('mac="$(mac)"')
    expect(html).toContain('ip="$(ip)"')
    expect(html).toContain('lo="$(link-login-only)"')
    expect(html).toContain('srv="$(server-name)"')
    expect(html).toContain('orig="$(link-orig)"')
    expect(html).toContain('function cleanRouterUrl(v)')
    expect(html).toContain('function currentLoginUrl()')
    expect(html).toContain("f.method='post';f.action=target")
    expect(html).not.toContain('CONNECTED=')
    expect(html).not.toContain('connected=1')
    expect(html).not.toContain('window.location.href=lo+\'?username=')
    expect(html).not.toContain('neverssl.com')
    expect(html).not.toContain('http://google.com')
    expect(html).toContain('id="multiSection"')
    expect(html).toContain('Multi-device packages')
    expect(html).toContain('deviceLimit')
    expect(html).toContain('multiList')
  })

  it('checks Mobile Money payment status immediately and posts credentials without a success delay', () => {
    const service = new MikrotikService(new ConfigService({ PORTAL_PUBLIC_HOST: 'wifi.example.com' }))

    const html = service.buildLoginHtml('router-key-123', 'http://tenantname.wifi/login')

    expect(html).toContain('if(pmt.activation&&pmt.reconnect&&pmt.reconnect.username){conn(pmt.reconnect);return;}')
    expect(html).toContain('function check(){')
    expect(html).toContain('check();')
    expect(html).toContain('setTimeout(check,250)')
    expect(html).not.toContain('setInterval(function()')
    expect(html).not.toContain('Payment Approved! Connecting')
    expect(html).not.toContain('Success! Connecting')
    expect(html).not.toContain('checkoutUrl')
  })

  it('only falls back to the HTTP API when the captive browser has a network failure', () => {
    const service = new MikrotikService(new ConfigService({ PORTAL_PUBLIC_HOST: 'wifi.example.com' }))

    const html = service.buildLoginHtml('router-key-123', 'http://tenantname.wifi/login')

    expect(html).toContain('if(e.network){ajax(m,APIFB+p,d')
    expect(html).toContain('var er=new Error(String(msg));er.status=x.status;cb(er);')
    expect(html).toContain('er.network=true;cb(er);')
    expect(html).not.toContain('if(e)ajax(m,APIFB+p,d,cb)')
    expect(html).not.toContain("cb(new Error('Parse err'))")
    expect(html).not.toContain("cb(new Error('Network err'))")
  })

  it('allows configured public API IPs in the pre-auth walled garden', () => {
    const service = new MikrotikService(
      new ConfigService({
        API_PUBLIC_HOST: 'portal.arofi.test',
        SERVER_PUBLIC_IP: '95.111.234.34',
        VPS_PUBLIC_IP: '95.111.234.34',
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
      portalHosts: ['portal.arofi.test'],
    })

    expect(script).toContain('/ip hotspot walled-garden ip remove [find comment="AROFi portal ip"]')
    expect(script).toContain('dst-address=95.111.234.34/32 action=accept comment="AROFi portal ip"')
    expect(script.match(/dst-address=95\.111\.234\.34\/32/g)).toHaveLength(1)
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

    expect(script).toContain('/ip hotspot walled-garden remove [find comment="AROFi portal"]')
    expect(script.match(/dst-host="portal\.arofi\.test"/g)).toHaveLength(1)
    expect(script).toContain('dst-host="pay.pesapal.com"')
    expect(script).toContain('dst-host="*.pesapal.com"')
    expect(script).toContain('/ip firewall mangle remove [find comment="AROFi anti-tether"]')
    expect(script).toContain('new-ttl=set:1')
    expect(script).toContain('AROFi anti-tether')
  })

  it('uses an explicit IP for RouterOS RADIUS entries when the public host is a DNS name', () => {
    const service = new MikrotikService(
      new ConfigService({
        RADIUS_PUBLIC_HOST: 'dev.arofi.net',
        RADIUS_PUBLIC_IP: '95.111.234.34',
        RADIUS_SHARED_SECRET: 'radius-secret',
      }),
    )

    const radius = service.getRadiusServerConfig()
    const script = service.buildProvisioningScript({
      routerName: 'RouterOS 6 Test',
      identity: 'routeros6-test',
      registrationKey: 'routeros6-token',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      radiusHost: radius.host,
      radiusAuthPort: radius.authPort,
      radiusAccountingPort: radius.accountingPort,
      sharedSecret: radius.sharedSecret,
    })

    expect(radius.host).toBe('95.111.234.34')
    expect(script).toContain('/radius add service=hotspot address=95.111.234.34')
    expect(script).not.toContain('/radius add service=hotspot address=dev.arofi.net')
  })

  it('configures dns-name and static DNS entry when dnsName parameter is provided', () => {
    const service = new MikrotikService(new ConfigService({}))

    const script = service.buildProvisioningScript({
      routerName: 'DNS Test Router',
      identity: 'dns-test-router',
      registrationKey: 'dns-token',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      radiusHost: 'radius.example.com',
      radiusAuthPort: 1812,
      radiusAccountingPort: 1813,
      sharedSecret: 'dns-secret',
      dnsName: 'tenantname.wifi',
    })

    expect(script).toContain('dns-name="tenantname.wifi"')
    // A RouterOS HotSpot may own a dynamic dns-name row; only AROFi's static row is removable.
    expect(script).toContain(':do { /ip dns static remove [find comment="AROFi hotspot DNS gateway"] } on-error={}')
    expect(script).toContain(':do { /ip dns static add name="tenantname.wifi" address=10.55.0.1 ttl=1m comment="AROFi hotspot DNS gateway" } on-error={}')
    expect(script).not.toContain('/ip dns static remove [find name="tenantname.wifi"]')
    // dynamic DNS row must never abort provisioning
  })

  it('buildOneRunCommand: tries plain HTTP fallback FIRST, then HTTPS, and includes NTP sync', () => {
    const service = new MikrotikService(
      new ConfigService({
        API_PUBLIC_HOST: 'arofi.net',
        MIKROTIK_CALLBACK_HTTP_URL: 'http://95.111.234.34',
      }),
    )

    const cmd = service.buildOneRunCommand('test-reg-key')

    expect(cmd).toContain('[:parse "/system ntp client set enabled=yes servers=pool.ntp.org"]')
    expect(cmd).toContain('primary-ntp=162.159.200.1')

    const httpIdx = cmd.indexOf('http://95.111.234.34')
    const httpsIdx = cmd.indexOf('https://arofi.net')
    expect(httpIdx).toBeGreaterThan(-1)
    expect(httpsIdx).toBeGreaterThan(-1)
    expect(httpIdx).toBeLessThan(httpsIdx)

    expect(cmd).toContain('/api/mikrotik/script/test-reg-key')
    expect(cmd).toContain(':while ($attempts < 3)')
    expect(cmd).toContain(':set arofiOk 1')
    expect(cmd).toContain('/import file-name="arofi-setup.rsc"')
    expect(cmd).toContain('port 80')
    expect(cmd).toContain('/system clock')
  })
})
