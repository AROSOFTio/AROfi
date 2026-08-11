import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  RouterConnectionMode,
  RouterStatus,
} from '@prisma/client'
import * as net from 'net'
import * as tls from 'tls'

type ProvisioningInput = {
  routerName: string
  identity: string
  registrationKey?: string
  apiPort: number
  connectionMode: RouterConnectionMode
  radiusHost: string
  radiusSecondaryHost?: string
  radiusAuthPort: number
  radiusAccountingPort: number
  sharedSecret: string
  adminUsername?: string | null
  adminPassword?: string | null
  hotspotServerName?: string | null
  portalHosts?: string[]
  ttlAntiTetheringEnabled?: boolean
  deviceLimit?: number | null
  mode?: 'SAFE_EXISTING_ROUTER' | 'FRESH_FULL_HOTSPOT' | 'FRESH_FULL_CAPTIVE_WIFI'
  hotspotNetworkName?: string | null
  portalBaseUrl?: string | null
  dnsName?: string | null
  remoteClientName?: string | null
}

@Injectable()
export class MikrotikService {
  constructor(private readonly configService: ConfigService) { }

  async probeConnection(host: string, port: number, timeoutMs = 4000) {
    return new Promise<{
      reachable: boolean
      status: RouterStatus
      latencyMs?: number
      message: string
    }>((resolve) => {
      const socket = new net.Socket()
      const startedAt = Date.now()
      let settled = false

      const finish = (result: {
        reachable: boolean
        status: RouterStatus
        latencyMs?: number
        message: string
      }) => {
        if (settled) {
          return
        }

        settled = true
        socket.destroy()
        resolve(result)
      }

      socket.setTimeout(timeoutMs)

      socket.once('connect', () => {
        const latencyMs = Date.now() - startedAt

        finish({
          reachable: true,
          status: latencyMs <= 150 ? RouterStatus.HEALTHY : RouterStatus.DEGRADED,
          latencyMs,
          message:
            latencyMs <= 150
              ? 'RouterOS API endpoint reachable'
              : 'Router responded, but latency is elevated',
        })
      })

      socket.once('timeout', () => {
        finish({
          reachable: false,
          status: RouterStatus.OFFLINE,
          message: `Timed out after ${timeoutMs}ms while connecting to RouterOS API`,
        })
      })

      socket.once('error', (error) => {
        finish({
          reachable: false,
          status: RouterStatus.OFFLINE,
          message: error.message,
        })
      })

      socket.connect(port, host)
    })
  }

  async removeHotspotActiveSession(input: {
    host: string
    port: number
    useTls?: boolean
    username: string
    password: string
    hotspotUsername?: string | null
    macAddress?: string | null
    timeoutMs?: number
  }) {
    const client = await RouterOsApiClient.connect({
      host: input.host,
      port: input.port,
      useTls: input.useTls,
      timeoutMs: input.timeoutMs ?? 5000,
    })

    try {
      await client.login(input.username, input.password)
      const rows = await client.command([
        '/ip/hotspot/active/print',
        '=.proplist=.id,user,mac-address,address',
        ...(input.hotspotUsername ? [`?user=${input.hotspotUsername}`] : []),
        ...(input.macAddress ? [`?mac-address=${this.normalizeMac(input.macAddress) ?? input.macAddress}`] : []),
      ])
      const ids = rows.map((row) => row['.id']).filter((id): id is string => Boolean(id))

      for (const id of ids) {
        await client.command(['/ip/hotspot/active/remove', `=numbers=${id}`])
      }

      return { removed: ids.length }
    } finally {
      client.close()
    }
  }

  // Single command the operator pastes into WinBox Terminal. Built server-side
  // so it always uses the real public API host (API_PUBLIC_HOST) instead of a
  // domain hardcoded in the frontend.
  buildOneRunCommand(registrationKey: string) {
    const url = `${this.resolveApiBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    const fallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    // Many self-onboarded routers (static WAN IP, factory reset) have no DNS
    // servers configured AND have a wrong system clock (clock resets to epoch
    // after power loss). Bootstrap DNS and sync NTP first so TLS handshakes
    // succeed — a wrong clock makes every HTTPS fetch fail even with
    // check-certificate=no on some RouterOS builds.
    const dnsBootstrap =
      ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; ' +
      // RouterOS validates ALL command parameters at PARSE TIME for the outer block,
      // so "servers=" (v7-only) kills the command on v6, and "primary-ntp=" (v6-only)
      // kills it on v7 — both BEFORE on-error can catch anything. [:parse "..."]
      // defers each command string to runtime compilation, converting the unknown-
      // parameter error into a catchable runtime error instead of a fatal parse error.
      ':do { :local n [:parse "/system ntp client set enabled=yes servers=pool.ntp.org"]; $n } ' +
      'on-error={ :do { :local n [:parse "/system ntp client set enabled=yes primary-ntp=162.159.200.1"]; $n } on-error={} }; ' +
      ':delay 2s; '
    // Retry loop: up to 3 rounds with a 5-second wait between rounds.
    // Strategy: try plain HTTP fallback FIRST (no TLS, always works when TCP
    // port 80 is open) and HTTPS second. On fresh/rebooted routers the clock
    // may still be off enough to kill the TLS handshake, so HTTP is the most
    // reliable first attempt. :while exits early once a download succeeds.
    return (
      dnsBootstrap +
      ':local arofiOk 0; :local attempts 0; ' +
      ':while ($attempts < 3) do={ ' +
        ':set attempts ($attempts + 1); ' +
        ':do { /file remove [find name="arofi-setup.rsc"] } on-error={}; ' +
        // 1st attempt within each round: plain HTTP (no TLS risk)
        `:do { /tool fetch url="${fallbackUrl}" check-certificate=no dst-path="arofi-setup.rsc"; :delay 4s; :local f [/file find name="arofi-setup.rsc"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={}; ` +
        // 2nd attempt within each round: HTTPS (if HTTP failed, e.g. port 80 blocked)
        ':if ($arofiOk = 0) do={ ' +
          ':do { /file remove [find name="arofi-setup.rsc"] } on-error={}; ' +
          `:do { /tool fetch url="${url}" check-certificate=no dst-path="arofi-setup.rsc"; :delay 4s; :local f [/file find name="arofi-setup.rsc"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={} ` +
        '}; ' +
        ':if ($arofiOk = 1) do={ :set attempts 3 } else={ ' +
          ':if ($attempts < 3) do={ :put "Retrying..."; :delay 5s } ' +
        '} ' +
      '}; ' +
      ':if ($arofiOk = 0) do={ ' +
        ':put "ERROR: AROFi server unreachable after 3 attempts."; ' +
        ':put "Check: 1) WAN internet works (ping 8.8.8.8). 2) Firewall allows HTTP (port 80) AND HTTPS (port 443). 3) System clock correct (check /system clock). 4) Re-paste when WAN is stable." ' +
      '} else={ ' +
        ':local f [/file find name="arofi-setup.rsc"]; :if ([:len $f]>0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :put "AROFi setup downloaded. Installing..."; :delay 2s; /import file-name="arofi-setup.rsc"; :delay 1s; /file remove "arofi-setup.rsc"; :put "AROFi setup installed." } else={ :put "ERROR: AROFi setup file is empty. Re-paste when WAN is stable."; /file remove $f } } else={ :put "ERROR: AROFi setup file was not downloaded. Re-paste when WAN is stable." } ' +
      '}'
    )
  }

  // VPS-side tunnel gateway addresses routers see as the CoA packet source.
  // 192.168.20.1 is the live sstpd local address; 10.8.0.1 is the address in
  // options.sstpd kept for older tunnels. Override via RADIUS_COA_SOURCE_IPS.
  getCoaSourceIps(): string[] {
    const raw = this.configService.get<string>('RADIUS_COA_SOURCE_IPS') ?? '192.168.20.1,10.8.0.1'
    return raw
      .split(',')
      .map((ip) => ip.trim())
      .filter((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
  }

  getRadiusServerConfig(sharedSecret?: string) {
    const host =
      this.configService.get<string>('RADIUS_PUBLIC_HOST') ??
      this.configService.get<string>('RADIUS_SERVER_HOST') ??
      '127.0.0.1'
    const authPort = Number.parseInt(this.configService.get<string>('RADIUS_AUTH_PORT') ?? '1812', 10)
    const accountingPort = Number.parseInt(
      this.configService.get<string>('RADIUS_ACCOUNTING_PORT') ?? '1813',
      10,
    )
    const secret =
      sharedSecret ??
      this.configService.get<string>('RADIUS_SHARED_SECRET') ??
      ''
    // Optional standby FreeRADIUS instance on the same shared secret. RouterOS
    // natively supports multiple `/radius add service=hotspot` entries and
    // fails over to the next one if the first stops answering — no extra
    // logic needed on the router side, just a second config line.
    const secondaryHost = this.configService.get<string>('RADIUS_SECONDARY_HOST') || undefined

    return {
      host,
      authPort,
      accountingPort,
      sharedSecret: secret,
      secondaryHost,
    }
  }

  buildProvisioningScript(input: ProvisioningInput) {
    const apiService =
      input.connectionMode === RouterConnectionMode.ROUTEROS_API_SSL ? 'api-ssl' : 'api'

    const registrationKey = input.registrationKey ?? 'manual-test-router'
    const profileName = `arofi-${registrationKey.slice(0, 8)}`
    const ssid = (input.hotspotNetworkName || input.routerName || 'AROFi Free WiFi').slice(0, 32)
    const hotspotName = input.hotspotServerName || 'arofi-hotspot'
    const addressesPerMac = Math.min(Math.max(input.deviceLimit ?? 1, 1), 5)
    const remoteClientName = input.remoteClientName || 'AROFI_REMOTE'
    // Isolated hotspot subnet. Chosen to avoid the common 192.168.88.x / 10.0.0.x
    // ranges so it does not clash with the operator's existing LAN/management.
    const gatewayIp = '10.55.0.1'
    const subnet = '10.55.0.0/24'
    const poolRange = '10.55.0.10-10.55.0.254'

    const callbackUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const fallbackCallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const loginHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const fallbackLoginHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const statusHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/status-html/${this.escape(registrationKey)}`
    const fallbackStatusHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/status-html/${this.escape(registrationKey)}`
    const heartbeatUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/heartbeat/${this.escape(registrationKey)}`
    const fallbackHeartbeatUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/heartbeat/${this.escape(registrationKey)}`
    const callbackScript = this.buildProvisioningCallbackScript(callbackUrl, fallbackCallbackUrl, remoteClientName)
    const heartbeatScript = this.buildHeartbeatScheduler(heartbeatUrl, fallbackHeartbeatUrl)
    const loginHtmlInstallScript = this.buildLoginHtmlInstallScript(
      loginHtmlUrl,
      fallbackLoginHtmlUrl,
      statusHtmlUrl,
      fallbackStatusHtmlUrl,
      profileName,
    )

    // SAFE_EXISTING_ROUTER = the operator already has a working HotSpot; we only
    // wire it to AROFi RADIUS/portal. Any other mode builds a fresh customer
    // HotSpot, but ADDITIVELY on an isolated bridge so it never disturbs the
    // operator's WAN, management IP, or admin login.
    const radiusOnly = input.mode === 'SAFE_EXISTING_ROUTER'

    // Shared front matter: enable management access only. We deliberately do NOT
    // change the admin username/password and do NOT touch WAN or addresses.
    const header = [
      `# AROFi MikroTik onboarding script (safe / additive)`,
      `# Mode: ${radiusOnly ? 'SAFE_EXISTING_ROUTER' : 'ADD_CUSTOMER_HOTSPOT'}`,
      `# Router: ${this.escape(input.routerName.slice(0, 30))}`,
      `# Registration key: ${this.escape(registrationKey)}`,
      `# This script never changes your admin login and never reconfigures your`,
      `# WAN or management IP. You can keep using WinBox exactly as before.`,
      ``,
      `# 1. Make sure management stays reachable (no credential changes)`,
      `:do { /ip service set ${apiService} port=${input.apiPort} disabled=no } on-error={}`,
      `:do { /ip service set winbox port=8291 disabled=no } on-error={}`,
      // www = WebFig, the router's built-in browser-based admin panel. Unlike
      // WinBox, it needs no app — just a phone browser — so it's the phone
      // re-entry point for field agents without a laptop. Force it on the
      // same way winbox is, since some operators harden it off by default.
      `:do { /ip service set www disabled=no } on-error={}`,
      `# Block direct WAN access to router management; remote access should use the AROFi SSTP tunnel`,
      ...this.buildWanDetectionScript('arofiMgmtWan', remoteClientName),
      `/ip firewall filter remove [find comment="AROFi WAN mgmt block"]`,
      `:if ($arofiMgmtWan != "") do={`,
      `  /ip firewall filter add chain=input action=drop in-interface=$arofiMgmtWan protocol=tcp dst-port=80,443,8291,8728,8729,${input.apiPort} comment="AROFi WAN mgmt block"`,
      `  :foreach r in=[/ip firewall filter find comment="AROFi WAN mgmt block"] do={ /ip firewall filter move $r destination=0 }`,
      `}`,
      // Deliberately NOT touching /tool mac-server allowed-interface-list here.
      // Forcing it to "all" would expose MAC-Telnet/MAC-WinBox discovery (a
      // layer-2 protocol that bypasses IP firewall rules entirely) to the new
      // customer-facing hotspot bridge created below — an operator who had
      // already restricted this for security would have that protection
      // silently undone. IP-based WinBox/API access from the hotspot subnet
      // is blocked explicitly further down instead (see "hotspot mgmt block").
      ``,
      `# 2. AROFi RADIUS server for HotSpot auth + accounting`,
      `/radius remove [find where comment="AROFi ${this.escape(registrationKey)}"]`,
      `/radius remove [find where comment="AROFi ${this.escape(registrationKey)} standby"]`,
      `/radius add service=hotspot address=${input.radiusHost} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=5s comment="AROFi ${this.escape(registrationKey)}"`,
      ...(input.radiusSecondaryHost
        ? [
            // Same secret, second host: RouterOS tries entries in order and
            // fails over automatically if the primary stops responding.
            `/radius add service=hotspot address=${input.radiusSecondaryHost} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=5s comment="AROFi ${this.escape(registrationKey)} standby"`,
          ]
        : []),
      // CoA/Disconnect source registration: RouterOS silently DROPS incoming
      // Disconnect-Requests whose source IP is not in the /radius list. Our
      // CoA packets travel down the SSTP tunnel, so the router sees them
      // coming from the VPS-side tunnel address — not the public RADIUS host.
      // Register those tunnel gateways as radius entries. service=dhcp is
      // deliberate: it's never used for hotspot auth, so these entries can't
      // interfere with authentication failover; incoming CoA validation only
      // matches on address + secret.
      `/radius remove [find where comment="AROFi ${this.escape(registrationKey)} coa"]`,
      ...this.getCoaSourceIps().map(
        (ip) =>
          `/radius add service=dhcp address=${ip} secret="${this.escape(input.sharedSecret)}" timeout=1s comment="AROFi ${this.escape(registrationKey)} coa"`,
      ),
      `:do { /radius incoming set accept=yes } on-error={}`,
    ]

    const hotspotProfile = [
      ``,
      `# 3. HotSpot profile bound to AROFi RADIUS`,
      `:if ([:len [/ip hotspot profile find name="${profileName}"]] = 0) do={ /ip hotspot profile add name="${profileName}" }`,
      `/ip hotspot profile set [find name="${profileName}"] use-radius=yes radius-accounting=yes radius-interim-update=1m html-directory=hotspot login-by=cookie,mac-cookie,http-pap split-user-domain=no radius-location-id="${this.escape(registrationKey)}" radius-location-name="${this.escape(registrationKey)}"${input.dnsName ? ` dns-name="${this.escape(input.dnsName)}"` : ''}`,
      // keepalive-timeout=2m (MikroTik's own default) force-disconnected
      // customers for mere inactivity: phones/laptops stop answering the
      // HotSpot's ARP-based keepalive probe within 1-2 minutes of the screen
      // locking / WiFi radio idling, even though the device never left the
      // network — so a paying customer got logged out mid-package for simply
      // not touching their phone. shared-users=1 + MAC-bound RADIUS
      // credentials already prevent session sharing, so keepalive-timeout has
      // no security job to do here — only the RADIUS Session-Timeout
      // attribute (and CoA disconnect) should ever end a session, exactly at
      // package expiry. Set to 30 days: effectively never fires before any
      // real package expires (longest realistic package is nowhere close to
      // 30 days), while still bounded (not an unbounded/infinite value that
      // could behave unpredictably), so idle time is never the reason a
      // customer gets disconnected.
      `/ip hotspot user profile set [find default=yes] shared-users=1 add-mac-cookie=yes mac-cookie-timeout=1d keepalive-timeout=30d`,
      `:foreach up in=[/ip hotspot user profile find] do={ /ip hotspot user profile set $up shared-users=1 add-mac-cookie=yes mac-cookie-timeout=1d keepalive-timeout=30d }`,
      `# Remove HotSpot bypass bindings so every device must authenticate through AROFi`,
      `:do { /ip hotspot ip-binding remove [find type=bypassed] } on-error={}`,
      // dns-name on the profile only controls which name the HotSpot itself answers
      // for unauthenticated clients it already intercepted; resolving the name from
      // a fresh DNS query (e.g. a customer scanning the printed voucher QR before
      // they've been trapped) needs an explicit static record too. This must run in
      // BOTH provisioning modes — SAFE_EXISTING_ROUTER reuses the operator's own
      // hotspot, which has no reason to already know about "<tenant>.wifi".
      ...(input.dnsName ? [
        `/ip dns static remove [find name="${this.escape(input.dnsName)}"]`,
        `/ip dns static add name="${this.escape(input.dnsName)}" address=${gatewayIp} comment="AROFi hotspot DNS gateway"`,
      ] : []),
    ]

    const walledGarden = [
      ``,
      `# 4. Walled garden so the portal + payment pages load before login`,
      ...this.buildWalledGarden(input.portalHosts ?? []),
      // Also allow the raw HTTP-fallback IP by address so captive-portal
      // mini-browsers can reach the API even when HTTPS or hostname DNS fails.
      ...this.buildWalledGardenIp(this.resolveHttpCallbackBaseUrl()),
      ``,
      `# 4b. Install the AROFi captive portal redirect page`,
      ...loginHtmlInstallScript,
    ]

    const antiTether = [
      ``,
      `# Aggressive TTL anti-tethering: force TTL=1 on all packets exiting the hotspot interface.`,
      `#   Direct client device receives packets with TTL=1. This allows local apps to work.`,
      `#   If the client tries to share/tether, its sharing engine NAT/forwards the packets`,
      `#   and decrements TTL by 1. TTL becomes 0, and the client's hotspot engine drops the packets.`,
      `#   This completely blocks any second-hop tethering (WiFi hotspot, USB, Bluetooth, etc.).`,
      `/ip firewall mangle remove [find comment="AROFi anti-tether"]`,
      `/ip firewall filter remove [find comment="AROFi anti-tether-drop"]`,
      `:foreach h in=[/ip hotspot find] do={`,
      `  :local hotInterface [/ip hotspot get $h interface]`,
      `  :if ($hotInterface != "") do={`,
      `    :do { /ip firewall mangle add chain=postrouting action=change-ttl new-ttl=set:1 passthrough=no out-interface=$hotInterface comment="AROFi anti-tether" } on-error={}`,
      `  }`,
      `}`,
    ]

    const telemetry = [
      ``,
      `# 5. AROFi heartbeat (fast live/offline status, works behind NAT)`,
      ...heartbeatScript,
      ``,
      `# 6. Tell AROFi the script imported so it can learn the router NAS IP`,
      ...callbackScript,
    ]

    if (radiusOnly) {
      return [
        ...header,
        ...hotspotProfile,
        ``,
        `# Bind every existing HotSpot server on this router to the AROFi profile`,
        `:foreach h in=[/ip hotspot find] do={ /ip hotspot set $h profile="${profileName}" }`,
        `:if ([:len [/ip hotspot find]] = 0) do={ :put "Warning: no existing HotSpot server found. Re-run in Add Customer HotSpot mode to create one." }`,
        ...walledGarden,
        ...antiTether,
        ...telemetry,
        `:put "AROFi RADIUS + portal wired to your existing HotSpot."`,
      ].join('\n')
    }

    return [
      ...header,
      ...hotspotProfile,
      ``,
      `# 3b. Dedicated, isolated HotSpot bridge - keeps your WAN + management intact`,
      `:if ([:len [/interface bridge find name="arofi-hotspot"]] = 0) do={ /interface bridge add name=arofi-hotspot comment="AROFi customer hotspot" }`,
      `/ip address remove [find address="${gatewayIp}/24"]`,
      `/ip address add address=${gatewayIp}/24 interface=arofi-hotspot comment="AROFi hotspot gateway"`,
      ``,
      `# 3c. Put Wi-Fi (RouterOS v6 wireless and v7 wifi) on the hotspot bridge`,
      ...this.buildHotspotWirelessScript(ssid),
      ``,
      `# 3d. DHCP, DNS and NAT for hotspot clients (additive; your existing NAT is untouched)`,
      `/ip pool remove [find name=arofi-pool]`,
      `/ip pool add name=arofi-pool ranges=${poolRange}`,
      `/ip dhcp-server network remove [find address="${subnet}"]`,
      `/ip dhcp-server network add address=${subnet} gateway=${gatewayIp} dns-server=${gatewayIp},1.1.1.1,8.8.8.8`,
      `/ip dhcp-server remove [find name=arofi-dhcp]`,
      `/ip dhcp-server add name=arofi-dhcp interface=arofi-hotspot address-pool=arofi-pool lease-time=1h disabled=no`,
      `/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8`,
      ``,
      `# Detect WAN interface dynamically so NAT works on any router model`,
      `# Try multiple methods: default route -> PPPoE -> LTE -> any non-hotspot interface with IP`,
      `# Every fallback below also excludes our own remote-access tunnel (${this.escape(remoteClientName)})`,
      `# so customer traffic never gets masqueraded into AROFi's management VPN.`,
      ...this.buildWanDetectionScript('wanIface', remoteClientName),
      `:global arofiWanIface`,
      `:set arofiWanIface $wanIface`,
      ...this.parseGuard(
        `:global arofiWanIface; :if ($arofiWanIface = "") do={ :foreach ppp in=[/interface find type=pppoe] do={ :local pppName [/interface get $ppp name]; :if ($pppName != "${this.escape(remoteClientName)}") do={ :set arofiWanIface $pppName } } }`,
        'AROFi: PPPoE WAN scan skipped.',
      ),
      `:set wanIface $arofiWanIface`,
      ...this.parseGuard(
        `:global arofiWanIface; :if ($arofiWanIface = "") do={ :foreach lte in=[/interface lte find] do={ :set arofiWanIface [/interface lte get $lte name] } }`,
        'AROFi: LTE WAN scan skipped.',
      ),
      `:set wanIface $arofiWanIface`,
      `:if ($wanIface = "") do={`,
      `  :foreach addr in=[/ip address find] do={`,
      `    :local addrIf [/ip address get $addr interface]`,
      `    :if ($addrIf != "arofi-hotspot" && $addrIf != "" && $addrIf != "${this.escape(remoteClientName)}") do={ :set wanIface $addrIf }`,
      `  }`,
      `}`,
      ``,
      `# 3d-2. Put wired LAN ports on the captive hotspot bridge too`,
      `# Excludes the detected WAN and ether1 so upstream internet stays intact.`,
      `:foreach e in=[/interface ethernet find] do={`,
      `  :local ethName [/interface ethernet get $e name]`,
      `  :if ($ethName != "" && $ethName != "ether1" && $ethName != $wanIface && $ethName != "${this.escape(remoteClientName)}") do={`,
      `    :if ([:len [/interface bridge port find interface=$ethName]]=0) do={ /interface bridge port add bridge=arofi-hotspot interface=$ethName } else={ /interface bridge port set [find interface=$ethName] bridge=arofi-hotspot }`,
      `  }`,
      `}`,
      `/ip firewall nat remove [find comment="AROFi hotspot nat"]`,
      `:if ($wanIface != "") do={`,
      `  /ip firewall nat add chain=srcnat src-address=${subnet} out-interface=$wanIface action=masquerade comment="AROFi hotspot nat"`,
      `} else={`,
      `  :error "AROFi: WAN interface not detected. Configure your WAN (DHCP client, PPPoE, or static IP) and re-run this script."`,
      `}`,
      ``,
      `# Firewall: allow DNS and gateway access from hotspot clients (input chain, before any drop)`,
      `/ip firewall filter remove [find comment="AROFi hotspot input"]`,
      `/ip firewall filter add chain=input action=accept src-address=${subnet} protocol=udp dst-port=53 comment="AROFi hotspot input"`,
      `/ip firewall filter add chain=input action=accept src-address=${subnet} protocol=tcp dst-port=53 comment="AROFi hotspot input"`,
      `/ip firewall filter add chain=input action=accept src-address=${subnet} dst-address=${gatewayIp} comment="AROFi hotspot input"`,
      `:foreach r in=[/ip firewall filter find comment="AROFi hotspot input"] do={ /ip firewall filter move $r destination=0 }`,
      ``,
      // The broad "allow gateway access" rule just above is needed for the
      // hotspot's own captive-portal page serving (login/status pages are
      // served from the gateway IP), so we can't simply narrow it by port
      // without risking breaking the portal itself. Instead, block the
      // specific management ports explicitly and move this block ABOVE the
      // broader accept rule (added second = moved to destination=0 last =
      // ends up on top, so it is evaluated first). This closes off WinBox
      // and the RouterOS API to the untrusted customer network while leaving
      // HTTP/HTTPS (captive portal) and DNS untouched.
      `# Block WinBox/API management ports from the untrusted hotspot subnet`,
      `/ip firewall filter remove [find comment="AROFi hotspot mgmt block"]`,
      `/ip firewall filter add chain=input action=drop src-address=${subnet} dst-address=${gatewayIp} protocol=tcp dst-port=8291 comment="AROFi hotspot mgmt block"`,
      `/ip firewall filter add chain=input action=drop src-address=${subnet} dst-address=${gatewayIp} protocol=tcp dst-port=8728 comment="AROFi hotspot mgmt block"`,
      `/ip firewall filter add chain=input action=drop src-address=${subnet} dst-address=${gatewayIp} protocol=tcp dst-port=8729 comment="AROFi hotspot mgmt block"`,
      `:foreach r in=[/ip firewall filter find comment="AROFi hotspot mgmt block"] do={ /ip firewall filter move $r destination=0 }`,
      ``,
      // out-interface=$wanIface (not a bare accept-from-subnet) so hotspot
      // customers can only ever reach the internet via the detected WAN —
      // never the operator's other internal networks, if the router happens
      // to route to any (e.g. an existing LAN). Without this scoping, a
      // customer on the "isolated" hotspot bridge could reach anything the
      // router itself can route to, defeating the isolation this bridge is
      // meant to provide.
      `# Firewall: allow hotspot clients forward, WAN-bound only (must be before any DROP rule)`,
      `/ip firewall filter remove [find comment="AROFi hotspot forward"]`,
      `/ip firewall filter add chain=forward action=accept src-address=${subnet} out-interface=$wanIface comment="AROFi hotspot forward"`,
      `/ip firewall filter add chain=forward action=accept dst-address=${subnet} connection-state=established,related comment="AROFi hotspot forward"`,
      `:foreach r in=[/ip firewall filter find comment="AROFi hotspot forward"] do={ /ip firewall filter move $r destination=0 }`,
      ``,
      `# 3e. Create the HotSpot server on the isolated bridge`,
      `/ip hotspot profile set [find name="${profileName}"] hotspot-address=${gatewayIp}`,
      `/ip hotspot remove [find interface=arofi-hotspot]`,
      `/ip hotspot add name="${this.escape(hotspotName)}" interface=arofi-hotspot address-pool=arofi-pool profile="${profileName}" addresses-per-mac=${addressesPerMac} disabled=no`,
      ...walledGarden,
      ...antiTether,
      ...telemetry,
      `:put "AROFi customer HotSpot is live. Broadcasting SSID: ${this.escape(ssid)}"`,
    ].join('\n')
  }

  getOnboardingChecklist(routerName: string) {
    return [
      `Make sure ${routerName} already has working internet (WAN) and that you can reach WinBox. This script does NOT set up your WAN or change your admin login.`,
      'Run the one-run command (or import the .rsc) from WinBox Terminal. Your management session stays connected the whole time.',
      'Confirm the script prints "AROFi customer HotSpot is live" and "AROFi provisioning callback sent". A callback failure means the router has no HTTPS/DNS path to AROFi.',
      'On a phone, look for the new OPEN Wi-Fi network (your site/SSID name) and connect. The AROFi portal should pop up automatically.',
      'If no SSID appears, the board has no /interface wireless (v6) or /interface wifi (v7) radio - use an external AP on the arofi-hotspot bridge instead.',
      'Run one real voucher/payment test so MikroTik sends Access-Request + Accounting-Start to RADIUS and the router turns live here.',
      'Supported: any RouterOS 6.45+ or RouterOS 7.x MikroTik with a HotSpot license (all hAP/RB/CCR/CRS boards ship with one). AROFi remote WinBox access uses an SSTP tunnel, which works on RouterOS 6 and 7 (some RouterOS 7 consumer boards need a one-time device-mode enterprise step).',
    ]
  }

  private buildWalledGarden(hosts: string[]) {
    const normalizedHosts = Array.from(new Set(hosts.filter(Boolean)))
    if (normalizedHosts.length === 0) {
      return []
    }

    return [
      `/ip hotspot walled-garden remove [find comment="AROFi portal"]`,
      ...normalizedHosts.map(
        (host) =>
          `/ip hotspot walled-garden add dst-host="${this.escape(host)}" action=allow comment="AROFi portal"`,
      ),
    ]
  }

  // Adds raw-IP walled-garden entries (/ip hotspot walled-garden ip) for the
  // HTTP fallback host so captive-portal mini-browsers (Android/iOS NCSI) can
  // reach the API even when HTTPS fails or the DNS entry for the hostname is
  // not yet resolving. Hostname-only walled-garden entries are useless when
  // the client is asking by IP.
  private buildWalledGardenIp(httpCallbackBaseUrl: string) {
    const match = httpCallbackBaseUrl.match(/^https?:\/\/([\d.]+)(:\d+)?(\/|$)/)
    if (!match) return [] // not an IP-literal URL (e.g. it's a hostname) — hostname entry covers it
    const ip = match[1]
    return [
      `:do { /ip hotspot walled-garden ip remove [find comment="AROFi portal ip"] } on-error={}`,
      `:do { /ip hotspot walled-garden ip add dst-address=${ip}/32 action=accept comment="AROFi portal ip" } on-error={}`,
    ]
  }

  private buildHeartbeatScheduler(heartbeatUrl: string, fallbackHeartbeatUrl: string) {
    // 1s heartbeat: router-side /ip hotspot active is the fastest source of
    // truth for "who is online right now", especially when accounting stop
    // rows arrive before the router has fully removed a client.
    const intervalSeconds = 1
    const source =
      `:local arofiActiveUsers 0; ` +
      `:do { :set arofiActiveUsers [:len [/ip hotspot active find]] } on-error={}; ` +
      `:local arofiActiveMacs ""; ` +
      `:do { :foreach a in=[/ip hotspot active find] do={ :local m [/ip hotspot active get $a mac-address]; :if ($m != "") do={ :if ($arofiActiveMacs = "") do={ :set arofiActiveMacs $m } else={ :set arofiActiveMacs ($arofiActiveMacs . "," . $m) } } } } on-error={}; ` +
      `:local arofiHeartbeatUrl "${heartbeatUrl}?activeUsers=$arofiActiveUsers&activeMacs=$arofiActiveMacs"; ` +
      `:local arofiHeartbeatFallback "${fallbackHeartbeatUrl}?activeUsers=$arofiActiveUsers&activeMacs=$arofiActiveMacs"; ` +
      `:do { /tool fetch url=$arofiHeartbeatUrl check-certificate=no keep-result=no } ` +
      `on-error={ :do { /tool fetch url=$arofiHeartbeatFallback keep-result=no } on-error={} }`
    return [
      `/system script remove [find name="arofi-heartbeat"]`,
      `/system script add name="arofi-heartbeat" source="${this.escapeScriptSource(source)}"`,
      `/system scheduler remove [find name="arofi-heartbeat"]`,
      `/system scheduler add name="arofi-heartbeat" interval=${intervalSeconds}s on-event="arofi-heartbeat" comment="AROFi heartbeat"`,
    ]
  }

  private buildProvisioningCallbackScript(callbackUrl: string, fallbackCallbackUrl: string, remoteClientName: string) {
    return [
      `:delay 3s`,
      `:local nasIp ""`,
      ...this.buildWanDetectionScript('cbWanIface', remoteClientName),
      `:do {`,
      `  :if ($cbWanIface != "") do={`,
      `    :local rawAddr [/ip address get [find interface=$cbWanIface] address]`,
      `    :set nasIp [:pick $rawAddr 0 [:find $rawAddr "/"]]`,
      `  }`,
      `} on-error={}`,
      `:do {`,
      `  /tool fetch url="${callbackUrl}?nasIp=$nasIp" check-certificate=no mode=https keep-result=no`,
      `  :put "AROFi provisioning callback sent (NAS IP: $nasIp)."`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${fallbackCallbackUrl}?nasIp=$nasIp" mode=http keep-result=no`,
      `    :put "AROFi provisioning callback sent by HTTP fallback (NAS IP: $nasIp)."`,
      `  } on-error={`,
      `    :put "Warning: AROFi provisioning callback failed. Check WAN internet, DNS, HTTPS, and VPS port 4012."`,
      `  }`,
      `}`,
    ]
  }

  private buildLoginHtmlInstallScript(
    loginHtmlUrl: string,
    fallbackLoginHtmlUrl: string,
    statusHtmlUrl: string,
    fallbackStatusHtmlUrl: string,
    profileName?: string,
  ) {
    // CRITICAL: MikroTik does NOT fall back to built-in pages when html-directory
    // is set and a file is missing — it returns 404 to every connecting device.
    // We must only activate html-directory=hotspot after confirming BOTH
    // login.html AND status.html are on disk — activating on login.html alone
    // (the previous bug here) would 404 every post-login redirect if only
    // status.html failed to install, leaving the router in a broken captive
    // portal state. We also create the directory first because /tool fetch
    // will not auto-create parent directories on all RouterOS versions.
    const profileSet = profileName
      ? [
          `:if ($arofiHtmlOk = 1 && $arofiStatusOk = 1) do={`,
          `  /ip hotspot profile set [find name="${this.escape(profileName)}"] html-directory=hotspot`,
          `  :put "AROFi: custom portal page active."`,
          `} else={`,
          `  :put "AROFi: keeping default MikroTik login page (html install incomplete)."`,
          `}`,
        ]
      : []
    return [
      // Ensure the hotspot/ directory exists — /tool fetch does not create parent
      // directories on RouterOS v6, causing a silent write failure and 404.
      `:do { /file add name="hotspot" type=directory } on-error={}`,
      `:local arofiHtmlOk 0`,
      `:local arofiStatusOk 0`,
      `:do {`,
      `  /tool fetch url="${loginHtmlUrl}" check-certificate=no mode=https dst-path="hotspot/login.html"`,
      `  :if ([:len [/file find name="hotspot/login.html"]] > 0) do={`,
      `    :put "AROFi HotSpot login.html installed."`,
      `    :set arofiHtmlOk 1`,
      `  } else={`,
      `    :error "login.html not found after fetch"`,
      `  }`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${fallbackLoginHtmlUrl}" mode=http dst-path="hotspot/login.html"`,
      `    :if ([:len [/file find name="hotspot/login.html"]] > 0) do={`,
      `      :put "AROFi HotSpot login.html installed by HTTP fallback."`,
      `      :set arofiHtmlOk 1`,
      `    }`,
      `  } on-error={`,
      `    :put "WARNING: login.html install FAILED - portal will show MikroTik default UI."`,
      `    :put "Fix: /tool fetch url=\\"${loginHtmlUrl}\\" dst-path=\\"hotspot/login.html\\""`,
      `  }`,
      `}`,
      // Without a custom status.html, MikroTik falls back to its stock post-auth
      // page ("You are logged in. If nothing happens, click here") which needs a
      // manual tap on some captive-portal webviews. Our version meta-refreshes +
      // JS-redirects immediately so the customer never has to touch anything.
      `:do {`,
      `  /tool fetch url="${statusHtmlUrl}" check-certificate=no mode=https dst-path="hotspot/status.html"`,
      `  :if ([:len [/file find name="hotspot/status.html"]] > 0) do={`,
      `    :put "AROFi HotSpot status.html installed."`,
      `    :set arofiStatusOk 1`,
      `  } else={`,
      `    :error "status.html not found after fetch"`,
      `  }`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${fallbackStatusHtmlUrl}" mode=http dst-path="hotspot/status.html"`,
      `    :if ([:len [/file find name="hotspot/status.html"]] > 0) do={`,
      `      :put "AROFi HotSpot status.html installed by HTTP fallback."`,
      `      :set arofiStatusOk 1`,
      `    }`,
      `  } on-error={`,
      `    :put "WARNING: status.html install FAILED - post-login page will need a manual tap."`,
      `  }`,
      `}`,
      ...profileSet,
    ]
  }

  // Moves a Wi-Fi interface onto the isolated arofi-hotspot bridge whether or
  // not it is currently a bridge port elsewhere (e.g. the operator's LAN).
  buildLoginHtml(registrationKey: string, portalBaseUrl?: string | null) {
    const apiBaseUrl = this.escapeHtml(this.resolveApiBaseUrl())
    // HTTP fallback base URL (raw IP) so the page works when HTTPS fails in a
    // captive-portal mini-browser or when DNS hasn't resolved yet.
    const fallbackApiBaseUrl = this.escapeHtml(this.resolveHttpCallbackBaseUrl())
    const connectedUrl = this.escapeHtml(
      `${(portalBaseUrl || this.resolvePortalBaseUrl()).replace(/\/$/, '')}?connected=1`,
    )
    const escapedKey = this.escapeHtml(registrationKey)

    // Self-contained white-themed static portal served directly from the router's
    // hotspot directory. No redirect — works in Android/iOS captive portal browsers.
    // MikroTik replaces $(mac), $(ip), $(link-login-only), $(link-orig), $(server-name)
    // before sending this HTML to the device.
    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AROFi Hotspot</title>
  <style>
    /* Replicates arofi.net/portal (classic template) so the captive page
       and the hosted portal look identical. */
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:linear-gradient(180deg,#f0f9ff 0%,#f0fdf4 100%);color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;padding:24px 16px 40px}
    .card{width:100%;max-width:540px;margin:0 auto;background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:20px;box-shadow:0 8px 32px rgba(37,99,235,.10)}
    .hdr{text-align:center;display:flex;flex-direction:column;align-items:center}
    .wifi-icon{color:#10b981;margin-bottom:8px;animation:pulse 2.2s infinite ease-in-out;display:inline-flex}
    @keyframes pulse{0%,100%{opacity:.5;transform:scale(.94)}50%{opacity:1;transform:scale(1.04)}}
    .tlogo{height:40px;width:auto;margin:0 auto 8px;display:block}
    .title{font-size:14px;font-weight:600;letter-spacing:.08em;color:#2563EB;text-transform:uppercase;opacity:.6;margin-top:2px}
    .idline{margin-top:8px;font-size:12px;font-weight:500;color:#475569;opacity:.85}
    .spin-wrap{text-align:center;padding:28px 0}
    .spinner{width:30px;height:30px;border:3px solid #bfdbfe;border-top-color:#2563EB;border-radius:50%;animation:spin .8s linear infinite;display:inline-block}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spin-wrap p{color:#64748b;font-size:13px;margin-top:10px}
    .quick-row{display:flex;gap:8px;margin-top:20px}
    .quick-row input{flex:1;min-width:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:14px}
    .connect-btn{background:#2563EB;color:#fff;border:none;border-radius:8px;padding:12px 20px;font-size:14px;font-weight:700;white-space:nowrap;cursor:pointer}
    .connect-btn:disabled{background:#cbd5e1;cursor:not-allowed}
    .find-link{display:inline-flex;align-items:center;gap:6px;margin:16px auto 0;text-align:center;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:12px;font-weight:600;padding:8px 16px;border-radius:8px;cursor:pointer;width:fit-content}
    .find-wrap{display:flex;justify-content:center}
    .find-panel{display:none;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-top:12px}
    .find-panel.on{display:block}
    .tv-voucher{margin-top:12px;background:#fff;border:1px solid #bfdbfe;border-radius:12px;padding:12px}
    .tv-voucher label{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;color:#1d4ed8}
    .tv-voucher input[type=checkbox]{width:16px;height:16px}
    .tv-voucher .tv-mac-wrap{display:none;margin-top:10px}
    .tv-voucher.on .tv-mac-wrap{display:block}
    .tv-note{font-size:11px;line-height:1.45;color:#64748b;margin-top:6px}
    .section-label{text-align:center;font-size:14px;color:#334155;margin-top:20px}
    .section-sub{text-align:center;font-size:12px;line-height:1.45;color:#64748b;margin:6px auto 0;max-width:390px}
    .pkgs{display:grid;grid-template-columns:1fr;gap:12px;margin-top:24px}
    @media(min-width:520px){.pkgs{grid-template-columns:1fr 1fr}}
    .pkg{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;text-align:left;box-shadow:0 1px 2px rgba(15,23,42,.05);cursor:pointer;transition:border-color .15s}
    .pkg.sel{border-color:#2563EB}
    .tv-section{display:none;margin-top:24px;padding:16px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:16px}
    .tv-section .section-label{margin-top:0;font-weight:800;color:#1d4ed8}
    .tv-section .pkgs{margin-top:14px}
    .tv-section .pkg{border-color:#bfdbfe;background:#fff}
    .tv-section .pkg.sel{border-color:#2563EB;box-shadow:0 0 0 2px rgba(37,99,235,.12)}
    .pkg .pk-name{display:block;font-size:16px;font-weight:700;color:#334155;line-height:1.2}
    .pkg .pk-dur{display:block;font-size:12px;color:#64748b;margin-top:2px}
    .pkg .pk-price{font-size:14px;font-weight:800;color:#2563EB;white-space:nowrap}
    .pkg .pk-buy{border:1px solid rgba(29,78,216,.5);background:#2563EB;color:#fff;border-radius:12px;padding:8px 16px;font-size:14px;font-weight:800;white-space:nowrap;box-shadow:0 1px 2px rgba(15,23,42,.06)}
    .accept{margin-top:24px;text-align:center;background:#fff;border:1px solid #bfdbfe;border-radius:8px;padding:16px}
    .accept-label{font-size:14px;font-weight:700;color:#334155;margin-bottom:12px}
    .accept-logos{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
    .net{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px;padding:6px 12px;min-width:72px;box-shadow:0 1px 2px rgba(15,23,42,.06)}
    .net-mtn{background:#ffcc00}
    .net-mtn b{font-size:15px;font-weight:900;color:#001e62;line-height:1.1}
    .net-mtn i{font-size:10px;font-weight:700;color:#001e62;font-style:normal}
    .net-airtel{background:#fff;box-shadow:0 0 0 1px rgba(228,6,19,.3),0 1px 2px rgba(15,23,42,.06)}
    .net-airtel b{font-size:13px;font-weight:900;color:#e40613;line-height:1.1}
    .net-airtel i{font-size:10px;font-weight:700;color:#e40613;font-style:normal}
    .support{margin-top:24px;border-top:1px solid #cbd5e1;padding-top:20px;text-align:center;font-size:12px;color:#334155;display:none;flex-direction:column;align-items:center;gap:8px}
    .support-phone{font-weight:700;color:#2563EB}
    .wa-inline{display:inline-flex;align-items:center;gap:8px;margin-top:4px;background:#25D366;color:#fff;border-radius:12px;padding:8px 16px;font-size:12px;font-weight:700;text-decoration:none;box-shadow:0 1px 3px rgba(37,211,102,.4)}
    .wa-inline svg{width:16px;height:16px;fill:#fff}
    .modal-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:16px}
    .modal-overlay.on{display:flex}
    .message-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.38);z-index:70;align-items:center;justify-content:center;padding:16px}
    .message-overlay.on{display:flex}
    .message-box{background:#fff;border-radius:14px;padding:18px 18px 16px;width:100%;max-width:430px;box-shadow:0 24px 60px rgba(15,23,42,.28);border:1px solid #dbeafe;position:relative;color:#0f172a;font-size:14px;line-height:1.5}
    .message-box.err{border-color:#fecdd3;background:#fff7f7;color:#991b1b}
    .message-box.ok{border-color:#86efac;background:#f0fdf4;color:#166534}
    .message-box.info{border-color:#bfdbfe;background:#eff6ff;color:#1e40af}
    .message-close{position:absolute;top:10px;right:12px;border:1px solid rgba(15,23,42,.12);border-radius:8px;background:#fff;color:#334155;font-weight:900;line-height:1;padding:4px 9px;cursor:pointer}
    .message-text{padding-right:32px;font-weight:700}
    .pay-box{background:#fff;border-radius:12px;padding:20px;width:100%;max-width:384px;box-shadow:0 20px 50px rgba(15,23,42,.25);position:relative}
    .pay-box .pclose{position:absolute;top:12px;right:14px;background:none;border:1px solid #e2e8f0;border-radius:6px;color:#64748b;font-size:14px;font-weight:700;cursor:pointer;line-height:1;padding:2px 7px}
    .pay-box .pname{font-size:18px;font-weight:800;color:#020617;margin-bottom:4px;padding-right:28px}
    .pay-box .psub{font-size:13px;color:#64748b;margin-bottom:14px}
    .tv-pay-note{display:none;margin:-2px 0 12px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:10px;padding:10px;font-size:12px;line-height:1.45;font-weight:700}
    .tv-pay-fields{display:none}
    .tv-pay-fields label{display:block;font-size:12px;font-weight:800;color:#334155;margin-bottom:6px}
    .iw{position:relative;margin-bottom:13px}
    input[type=text],input[type=tel]{width:100%;background:#fff;border:1px solid #cbd5e1;padding:12px 14px;border-radius:10px;color:#020617;font-size:15px;outline:none;transition:border-color .18s}
    input:focus{border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.12)}
    .btn{width:100%;background:#059669;color:#fff;border:none;padding:14px;font-size:14px;font-weight:800;border-radius:10px;cursor:pointer;transition:background .18s}
    .btn:hover{background:#047857}
    .btn:disabled{background:#cbd5e1;color:#64748b;cursor:not-allowed}
    .st{margin-top:13px;padding:10px 13px;border-radius:10px;font-size:13px;line-height:1.4;display:none}
    .st.err{background:#fff1f2;border:1px solid #fecdd3;color:#be123c;display:block}
    .st.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;display:block}
    .st.info{background:#f8fafc;border:1px solid #e2e8f0;color:#475569;display:block}
    .tech{margin-top:20px;text-align:center;font-size:11px;color:#94a3b8}
  </style>
</head>
<body>
  <div class="card">
    <div class="hdr">
      <div class="wifi-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3"/>
        </svg>
      </div>
      <h1 id="tname" class="title">AROFi Hotspot</h1>
    </div>

    <div id="loading" class="spin-wrap"><div class="spinner"></div><p>Loading packages...</p></div>

    <div id="content" style="display:none">
      <div class="quick-row">
        <input type="text" id="vcode" placeholder="Enter your voucher code">
        <button class="connect-btn" id="vbtn" onclick="login()">Connect</button>
      </div>
      <div class="tv-voucher" id="tvVoucherBox">
        <label><input type="checkbox" id="vTvMode" onchange="toggleVoucherTv()"> Connect voucher to a Smart TV</label>
        <div class="tv-mac-wrap">
          <input type="text" id="vTvMac" placeholder="TV wireless MAC, e.g. AA:BB:CC:DD:EE:FF" oninput="this.value=fmtMac(this.value)">
          <div class="tv-note">On the TV: go to the client WiFi name, click that same WiFi name/details, then copy the Device MAC Address.</div>
        </div>
      </div>
      <div class="find-wrap">
        <div class="find-link" onclick="toggleFind()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          Already bought? Find My Voucher
        </div>
      </div>
      <div class="find-panel" id="findPanel">
        <div class="iw" style="margin-bottom:9px">
          <input type="text" id="rtxn" placeholder="Phone number or Transaction ID">
        </div>
        <button class="btn" id="rbtn" onclick="rec()">Find Voucher</button>
      </div>

      <p class="section-label">Select a package and pay with Mobile Money</p>
      <div class="pkgs" id="plist"></div>
      <div id="tvSection" class="tv-section">
        <p class="section-label">Smart TV connection</p>
        <p class="section-sub">For TVs that cannot open the portal: choose a TV package, enter the TV wireless MAC, pay from your phone, then reconnect the TV to this WiFi.</p>
        <div class="pkgs" id="tvList"></div>
      </div>
      <div id="multiSection" style="display:none">
        <p class="section-label">Multi-device packages</p>
        <div class="pkgs" id="multiList"></div>
      </div>


      <div class="accept" id="acceptBox">
        <div class="accept-label">We accept:</div>
        <div class="accept-logos">
          <span class="net net-mtn"><b>MTN</b><i>MoMo</i></span>
          <span class="net net-airtel"><b>airtel</b><i>Money</i></span>
        </div>
      </div>

      <div class="support" id="support">
        <div>Need help? Contact support:</div>
        <div class="support-phone" id="sph"></div>
        <a class="wa-inline" id="waBtn" href="#" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.706 1.458h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Chat on WhatsApp
        </a>
      </div>

      <div class="st" id="st"></div>
    </div>
  </div>

  <div class="message-overlay" id="msgOverlay" onclick="if(event.target===this)closeMsg()">
    <div class="message-box info" id="msgBox">
      <button type="button" class="message-close" onclick="closeMsg()">&times;</button>
      <div class="message-text" id="msgText"></div>
    </div>
  </div>

  <div class="modal-overlay" id="payOverlay" onclick="if(event.target===this)closePay()">
    <div class="pay-box">
      <button type="button" class="pclose" onclick="closePay()">&times;</button>
      <div class="pname" id="payPkgName"></div>
      <div class="psub" id="paySub"></div>
      <div class="tv-pay-note" id="tvPayNote">Smart TV package: this activates the TV MAC address, not this phone. Enter TV MAC first, then the Mobile Money number that will approve payment.</div>
      <div class="tv-pay-fields" id="tvPayFields">
        <label for="tvmac">Smart TV wireless MAC address</label>
        <div class="iw">
          <input type="text" id="tvmac" placeholder="AA:BB:CC:DD:EE:FF" oninput="this.value=fmtMac(this.value)">
        </div>
        <div class="tv-note" style="margin-top:-8px;margin-bottom:12px">On the TV: go to the client WiFi name, click that same WiFi name/details, then copy the Device MAC Address. After payment, select this WiFi again.</div>
      </div>
      <div class="iw">
        <input type="tel" id="phone" placeholder="07XX XXX XXX">
      </div>
      <button class="btn" id="pbtn" onclick="pay()">Pay with Mobile Money</button>
    </div>
  </div>

  <div class="tech">
    Powered By <a href="https://arofi.net" target="_blank" rel="noreferrer" style="color:#2563EB;font-weight:600;text-decoration:none">AROFi</a><br>
    Terms and Conditions Apply
  </div>

  <script>
    var API="${apiBaseUrl}",APIFB="${fallbackApiBaseUrl}",RKEY="${escapedKey}",CONNECTED="${connectedUrl}";
    var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"";
    var pkgs=[],selId=null,selTv=false;
    // Try HTTPS API first; if the captive-portal mini-browser blocks it (clock
    // wrong, cert issue, CORS), retry the same path over plain HTTP fallback IP.
    function apiCall(m,p,d,cb){ajax(m,API+p,d,function(e,r){if(e)ajax(m,APIFB+p,d,cb);else cb(null,r);});}

    window.onload=function(){
      var search=window.location.search;
      var v='';

      var _up=new URLSearchParams(search);
      if(_up.get('connected')==='1'){
        document.getElementById('loading').style.display='none';
        document.getElementById('content').style.display='block';
        return;
      }

      // Do not auto-submit MikroTik credentials into the hotspot login page here.
      // That path bypasses the AROFi payment/voucher portal and makes the user
      // appear connected without ever seeing the payment flow. We only use the
      // captive portal page for package selection, voucher redemption, and
      // payment initiation.

      // Auto-login for voucher. The code can arrive two ways:
      //   1. Directly:  /login?voucher=HT2KUQ
      //   2. Buried in the MikroTik captive-portal redirect: when a customer on
      //      the hotspot scans a voucher QR (which points at the portal URL),
      //      the router intercepts it and redirects to
      //      /login?dst=<original-url-URL-ENCODED>, so the code shows up as
      //      ...%3Fvoucher%3DHT2KUQ. Decoding the whole query string first lets
      //      us recover it and auto-redeem instead of stranding the customer.
      var hay=search||'';
      try{hay=decodeURIComponent(search);}catch(e){}
      try{hay=decodeURIComponent(hay);}catch(e){}
      var vm=hay.match(/voucher=([A-Za-z0-9\\-]+)/i);
      if(vm&&vm[1])v=vm[1];
      if(v){
        document.getElementById('vcode').value=v.toUpperCase();
        setTimeout(login, 200);
      }

      load();
    };

    function ajax(method, url, data, cb){
      var x=new XMLHttpRequest();
      x.open(method, url, true);
      if(data) x.setRequestHeader('Content-Type','application/json');
      x.onload=function(){
        try{
          var j=JSON.parse(x.responseText);
          if(x.status>=200&&x.status<300) cb(null,j);
          else cb(new Error(j.message||'HTTP '+x.status));
        }catch(e){cb(new Error('Parse err'));}
      };
      x.onerror=function(){cb(new Error('Network err'));};
      x.send(data?JSON.stringify(data):null);
    }

    function toggleFind(){
      document.getElementById('findPanel').classList.toggle('on');
    }

    function isTvPkg(p){
      var h=((p&&p.name)||'')+' '+((p&&p.code)||'')+' '+((p&&p.description)||'');
      h=h.toLowerCase();
      return h.indexOf('tv')>=0||h.indexOf('smart')>=0||h.indexOf('stream')>=0;
    }

    function normMac(v){
      var c=(v||'').replace(/[^a-fA-F0-9]/g,'').toUpperCase();
      if(!/^[A-F0-9]{12}$/.test(c))return '';
      return c.match(/.{1,2}/g).join(':');
    }

    function fmtMac(v){
      var c=(v||'').replace(/[^a-fA-F0-9]/g,'').toUpperCase().slice(0,12);
      var m=c.match(/.{1,2}/g);
      return m?m.join(':'):'';
    }

    function toggleVoucherTv(){
      var on=document.getElementById('vTvMode').checked;
      document.getElementById('tvVoucherBox').classList.toggle('on',on);
      if(on)setTimeout(function(){document.getElementById('vTvMac').focus();},50);
    }

    function load(){
      apiCall('GET', '/api/portal/context?mac='+encodeURIComponent(mac)+'&ip='+encodeURIComponent(ip)+'&routerKey='+encodeURIComponent(RKEY)+'&server='+encodeURIComponent(srv)+'&loginUrl='+encodeURIComponent(lo), null, function(err, d){
        if(err){
          document.getElementById('tname').textContent='AROFi Hotspot';
          document.getElementById('loading').style.display='none';
          document.getElementById('content').style.display='block';
          return;
        }
        var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;
        // Loop guard: if we auto-submitted credentials within the last 8s and
        // landed back here, the router bounced us (already logged in, or brief
        // race). 8s is enough to detect a true redirect loop but short enough
        // that a genuine WiFi reconnect (turn off / on) always triggers auto-login.
        var _lastAuto=0;try{_lastAuto=parseInt(sessionStorage.getItem('arofiAutoAt')||'0',10);}catch(e){}
        var loopGuard=_lastAuto&&(Date.now()-_lastAuto)<8000;
        if(autoReady&&!loopGuard){
          try{sessionStorage.setItem('arofiAutoAt',String(Date.now()));}catch(e){}
          conn(d.returningDevice.reconnect);return;
        }
        if(autoReady&&loopGuard){
          document.getElementById('loading').style.display='none';
          document.getElementById('content').style.display='block';
          return;
        }

        pkgs=d.packages||[];
        document.getElementById('tname').textContent=d.tenant?d.tenant.name:'AROFi Hotspot';
        // Prefer the operator's own logo; the default AROFi logo is already in
        // the src attribute (with onerror hide) so there's always a logo.
        // Support footer + inline WhatsApp button — mirrors arofi.net/portal.
        // Uses the operator's support number, or the AROFi platform number.
        var supPhone=(d.tenant&&(d.tenant.supportPhone||d.tenant.platformSupportPhone))||'';
        if(supPhone){
          document.getElementById('sph').textContent=supPhone;
          var waDigits=supPhone.replace(/\\D/g,'');
          if(waDigits.indexOf('0')===0)waDigits='256'+waDigits.substring(1);
          else if(waDigits&&waDigits.indexOf('256')!==0&&waDigits.length===9)waDigits='256'+waDigits;
          if(waDigits.length>=11){document.getElementById('waBtn').href='https://wa.me/'+waDigits;}
          document.getElementById('support').style.display='flex';
        }

        var el=document.getElementById('plist');el.innerHTML='';
        var tvl=document.getElementById('tvList');tvl.innerHTML='';
        var ml=document.getElementById('multiList');ml.innerHTML='';
        var mc=0,tc=0;
        pkgs.forEach(function(p){
          var limit=parseInt(p.deviceLimit||1,10)||1;
          var c=document.createElement('div');c.className='pkg';c.id='pkg-'+p.id;
          var dur=fdur(p.durationMinutes)+(limit>1?' - '+limit+' devices':'');
          c.innerHTML='<span><span class="pk-name">'+esc(p.name)+'</span><span class="pk-dur">'+esc(dur)+'</span></span><span class="pk-price">UGX '+fn(p.amountUgx)+'</span><span class="pk-buy">BUY</span>';
          c.onclick=function(){selPkg(p.id);};
          if(isTvPkg(p)){tvl.appendChild(c);tc++;}
          else if(limit>1){ml.appendChild(c);mc++;}
          else{el.appendChild(c);}
        });
        document.getElementById('tvSection').style.display=tc>0?'block':'none';
        document.getElementById('multiSection').style.display=mc>0?'block':'none';
        document.getElementById('loading').style.display='none';
        document.getElementById('content').style.display='block';
      });
    }

    function selPkg(id){
      selId=id;
      var els=document.querySelectorAll('.pkg');
      for(var i=0;i<els.length;i++){
        els[i].classList.remove('sel');
      }
      var chosen=document.getElementById('pkg-'+id);
      if(chosen)chosen.classList.add('sel');

      var pkg=null;
      for(var j=0;j<pkgs.length;j++){if(pkgs[j].id===id){pkg=pkgs[j];break;}}
      selTv=isTvPkg(pkg);
      document.getElementById('payPkgName').textContent=pkg?('Pay UGX '+fn(pkg.amountUgx)):'';
      document.getElementById('paySub').textContent=pkg?(pkg.name+' · '+fdur(pkg.durationMinutes)):'';
      document.getElementById('tvPayNote').style.display=selTv?'block':'none';
      document.getElementById('tvPayFields').style.display=selTv?'block':'none';
      document.getElementById('pbtn').disabled=false;
      document.getElementById('payOverlay').classList.add('on');
      setTimeout(function(){document.getElementById(selTv?'tvmac':'phone').focus();},50);
    }

    function closePay(){
      document.getElementById('payOverlay').classList.remove('on');
    }

    function login(){
      var code=document.getElementById('vcode').value.trim().toUpperCase().replace(/\\s+/g,'');
      if(!code){sst('Enter your voucher code.','err');return;}
      var tvMode=document.getElementById('vTvMode').checked;
      var targetMac=mac;
      if(tvMode){
        targetMac=normMac(document.getElementById('vTvMac').value);
        if(!targetMac){sst('Enter the Smart TV wireless MAC address before connecting this voucher.','err');return;}
      }
      var b=document.getElementById('vbtn');
      b.disabled=true;b.textContent='Logging in...';
      sst('Verifying voucher...','info');

      apiCall('POST', '/api/portal/redeem-voucher', {code:code,macAddress:targetMac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo,targetDevice:tvMode?'SMART_TV':undefined}, function(err, res){
        if(err){
          sst(err.message||'Failed','err');b.disabled=false;b.textContent='Login';
        } else {
          if(tvMode){
            b.disabled=false;b.textContent='Connect';
            sst('Voucher activated for Smart TV '+targetMac+'. On the TV, open WiFi settings and select this WiFi again. If it is already connected, forget/disconnect then reconnect.','ok');
            return;
          }
          sst('Success! Connecting...','ok');
          conn(res.reconnect);
        }
      });
    }

    function pay(){
      if(!selId){sst('Please select a package first.','err');return;}
      var ph=document.getElementById('phone').value.trim();
      var c=ph.replace(/\\D/g,'');
      if(c.indexOf('0')===0)c='256'+c.substring(1);else if(c.indexOf('256')!==0)c='256'+c;
      if(!/^256\\d{9}$/.test(c)){sst('Enter a valid Mobile Money number.','err');return;}
      var payMac=mac;
      if(selTv){
        payMac=normMac(document.getElementById('tvmac').value);
        if(!payMac){sst('Enter the Smart TV wireless MAC address before paying for this TV package.','err');return;}
      }
      
      sst('Initiating payment...','info');
      var b=document.getElementById('pbtn');b.disabled=true;
      
      var pfx=c.substring(3,5);
      var net=(pfx==='70'||pfx==='75'||pfx==='74')?'AIRTEL':'MTN';
      
      apiCall('POST', '/api/payments/portal/initiate', {packageId:selId,phoneNumber:c,customerReference:selTv?payMac:c,network:net,macAddress:payMac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo}, function(err, pmt){
        if(err){ sst(err.message||'Failed','err');b.disabled=false;return; }
        if(pmt.status==='FAILED'){ sst(pmt.statusMessage||'Failed','err');b.disabled=false;return; }
        
        var cu=pmt.checkoutUrl||(pmt.responsePayload&&(pmt.responsePayload.checkoutUrl||(pmt.responsePayload.gateway&&pmt.responsePayload.gateway.checkoutUrl)));
        if(cu){window.location.href=cu;return;}
        sst(selTv?'Enter your Mobile Money PIN. After approval, reconnect the Smart TV to WiFi.':'Enter your Mobile Money PIN on your phone. Waiting for approval...','info');
        poll(pmt.id,pmt.statusToken);
      });
    }

    function poll(id,tok){
      var n=0,iv=setInterval(function(){
        if(++n>200){clearInterval(iv);sst('Timed out waiting for payment.','err');document.getElementById('pbtn').disabled=false;return;}
        apiCall('POST', '/api/payments/'+id+'/check-status'+(tok?'?token='+encodeURIComponent(tok):''), null, function(err, p){
          if(err) return;
          if(p.activation){
            if(selTv){
              clearInterval(iv);
              document.getElementById('pbtn').disabled=false;
              closePay();
              var tvm=normMac(document.getElementById('tvmac').value);
              sst('Payment approved. Smart TV '+tvm+' is active. On the TV, open WiFi settings and select this WiFi again. If it is already connected, forget/disconnect then reconnect.','ok');
            }else if(p.reconnect&&p.reconnect.username){clearInterval(iv);sst('Payment Approved! Connecting...','ok');conn(p.reconnect);}else{sst('Payment approved. Finalizing login...','info');}
          }
          else if(p.status==='FAILED'){clearInterval(iv);sst(p.statusMessage||'Payment Declined.','err');document.getElementById('pbtn').disabled=false;}
        });
      },600);
    }

    function rec(){
      var txn=document.getElementById('rtxn').value.trim();
      if(!txn){sst('Enter your phone number or transaction ID.','err');return;}
      var b=document.getElementById('rbtn');b.disabled=true;b.textContent='Searching...';
      sst('Searching for voucher...','info');

      apiCall('POST', '/api/portal/recover-voucher', {transactionId:txn,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo}, function(err, res){
        if(err){ sst(err.message||'Not found','err');b.disabled=false;b.textContent='Find Voucher'; }
        else { sst('Found! Connecting...','ok');conn(res.reconnect); }
      });
    }

    function conn(rc){if(!rc||!rc.username)return;var dst=CONNECTED;var target=(rc.loginUrl||lo||'http://10.55.0.1/login');window.location.href=target+'?username='+encodeURIComponent(rc.username)+'&password='+encodeURIComponent(rc.password||rc.username)+'&dst='+encodeURIComponent(dst);}
    function closeMsg(){document.getElementById('msgOverlay').classList.remove('on');}
    function sst(m,t){var s=document.getElementById('st');var o=document.getElementById('msgOverlay');var b=document.getElementById('msgBox');var x=document.getElementById('msgText');if(m){if(s){s.style.display='none';s.textContent='';}b.className='message-box '+(t||'info');x.textContent=m;o.classList.add('on');}else{if(s)s.style.display='none';o.classList.remove('on');}}
    function fdur(m){if(m>=1440&&m%1440===0)return m/1440+' Day'+(m/1440>1?'s':'');if(m>=60&&m%60===0)return m/60+' Hour'+(m/60>1?'s':'');return m+' Min';}
    function fmb(m){return m>=1024?(m/1024).toFixed(1)+' GB':m+' MB';}
    function fn(v){var n=v.toString(),r='';for(var i=n.length-1,c=0;i>=0;i--,c++){if(c>0&&c%3===0)r=','+r;r=n[i]+r;}return r;}
    function esc(s){return!s?'':s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  </script>
</body>
</html>

`
  }

  // Post-auth confirmation page MikroTik shows right after RADIUS accepts the
  // login. Without this, MikroTik falls back to its stock status.html, which
  // requires a manual "click here" tap on some captive-portal mini-browsers
  // (Android/iOS "sign in to network") instead of redirecting immediately.
  // Meta-refresh covers webviews that block JS; the script covers the rest.
  buildStatusHtml() {
    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body>
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:40px 16px;color:#0f172a">
    <div style="font-size:22px;font-weight:800;margin-bottom:8px">Connected</div>
    <div style="font-size:14px;color:#475569">You can close this page now and return to the WiFi network.</div>
  </div>
</body>
</html>
`
  }

  // Brings up an OPEN customer SSID on whatever radios the board has and binds
  // them to the isolated arofi-hotspot bridge. Supports RouterOS v6 wireless
  // (wlan1/wlan2) and v7 wifi (wifi1/wifi2).
  //
  // CRITICAL: RouterOS v6 has no /interface wifi menu and v7-wifiwave2 boards
  // have no /interface wireless menu. A bare statement that references a missing
  // menu is a COMPILE error that ":do {} on-error" cannot catch, which aborts a
  // whole /import on the wrong RouterOS version. So every radio command is kept
  // as TEXT and only compiled at runtime via [:parse]; a missing menu then
  // becomes a catchable runtime error and the rest of the script still runs.
  private buildHotspotWirelessScript(ssid: string) {
    const escapedSsid = this.escape(ssid.slice(0, 32) || 'AROFi Free WiFi')

    const bridgePort = (iface: string) =>
      `:if ([:len [/interface bridge port find interface="${iface}"]]=0) do={/interface bridge port add bridge=arofi-hotspot interface=${iface}} else={/interface bridge port set [find interface="${iface}"] bridge=arofi-hotspot}`

    const v6Inner = (iface: string) =>
      `:if ([:len [/interface wireless find name="${iface}"]]>0) do={/interface wireless set [find name="${iface}"] disabled=no mode=ap-bridge ssid="${escapedSsid}" security-profile=arofi-open; ${bridgePort(iface)}}`

    const v7Base = (iface: string) =>
      `:if ([:len [/interface wifi find name="${iface}"]]>0) do={/interface wifi set [find name="${iface}"] disabled=no configuration.mode=ap configuration.ssid="${escapedSsid}"; ${bridgePort(iface)}}`

    const v7OpenSecurity = (iface: string) =>
      `:if ([:len [/interface wifi find name="${iface}"]]>0) do={/interface wifi set [find name="${iface}"] security.authentication-types=""}`

    const securityProfile =
      `:if ([:len [/interface wireless security-profiles find name="arofi-open"]]>0) do={/interface wireless security-profiles set [find name="arofi-open"] mode=none authentication-types=""} else={/interface wireless security-profiles add name="arofi-open" mode=none authentication-types=""}`

    return [
      ...this.parseGuard('/interface wireless cap set enabled=no', 'AROFi: no wireless CAP menu - skipped.'),
      ...this.parseGuard(securityProfile, 'AROFi: wireless security-profiles not available - skipped.'),
      ...this.parseGuard(v6Inner('wlan1'), 'AROFi: wlan1 (RouterOS 6 wireless) not available - skipped.'),
      ...this.parseGuard(v6Inner('wlan2'), 'AROFi: wlan2 not available - skipped.'),
      ...this.parseGuard(v7Base('wifi1'), 'AROFi: wifi1 (RouterOS 7 wifi) not available - skipped.'),
      ...this.parseGuard(v7OpenSecurity('wifi1'), 'AROFi: wifi1 open-security setting skipped.'),
      ...this.parseGuard(v7Base('wifi2'), 'AROFi: wifi2 not available - skipped.'),
      ...this.parseGuard(v7OpenSecurity('wifi2'), 'AROFi: wifi2 open-security setting skipped.'),
    ]
  }

  // Wraps a RouterOS command string so it is compiled at runtime via [:parse]
  // and any failure (e.g. a menu that does not exist on this RouterOS version)
  // is caught instead of aborting the import.
  private parseGuard(inner: string, putOnError: string) {
    const escaped = inner.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')
    return [`:do { :local arofiApply [:parse "${escaped}"]; $arofiApply } on-error={ :put "${putOnError}" }`]
  }

  private escape(value: string) {
    return value.replace(/"/g, '\\"')
  }

  private escapeScriptSource(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')
  }

  private normalizeMac(value?: string | null) {
    if (!value) {
      return null
    }
    const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    if (!/^[A-F0-9]{12}$/.test(compact)) {
      return null
    }
    return compact.match(/.{1,2}/g)?.join(':') ?? null
  }

  private escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  }

  private resolveApiBaseUrl() {
    const host =
      this.configService.get<string>('API_PUBLIC_HOST') ||
      this.configService.get<string>('PORTAL_PUBLIC_HOST') ||
      'arofi.net'
    return `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  }

  private resolvePortalBaseUrl(configured?: string | null) {
    if (configured) {
      return configured.replace(/\/$/, '')
    }

    const host =
      this.configService.get<string>('PORTAL_PUBLIC_HOST') ||
      this.configService.get<string>('API_PUBLIC_HOST') ||
      'arofi.net'

    return `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}/portal`
  }

  private resolveHttpCallbackBaseUrl() {
    const configured = this.configService.get<string>('MIKROTIK_CALLBACK_HTTP_URL')
    if (configured) {
      // Normalize: strip trailing slash and the internal Docker port (:4012)
      // which is not publicly accessible. This handles stale env var values.
      return configured.replace(/\/$/, '').replace(/:4012(\/|$)/, '$1').replace(/\/$/, '')
    }

    const host =
      this.configService.get<string>('API_PUBLIC_HOST') ||
      this.configService.get<string>('PORTAL_PUBLIC_HOST') ||
      this.configService.get<string>('RADIUS_PUBLIC_HOST') ||
      'arofi.net'

    // Strip scheme and any port suffix — use plain HTTP port 80 which is
    // publicly accessible via the Coolify/Traefik reverse proxy layer.
    // Port 4012 is the internal Docker nginx port and is NOT reachable externally.
    return `http://${host.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/$/, '')}`
  }

  // excludeIface MUST be skipped here: AROFi's own remote-access SSTP tunnel
  // (named excludeIface) is itself an active interface with a default route
  // back to our VPN server, and this loop used to overwrite wanIface with
  // whichever default route it saw LAST. If the tunnel's route was processed
  // after the real WAN's, every hotspot client got NAT-masqueraded into our
  // management tunnel instead of the internet — RADIUS login would succeed
  // but no real traffic ever got through.
  private buildWanDetectionScript(varName: string, excludeIface: string) {
    const excluded = this.escape(excludeIface)
    return [
      `:local ${varName} ""`,
      `:foreach r in=[/ip route find dst-address=0.0.0.0/0 active=yes] do={`,
      `  :global arofiTmpRouteId $r`,
      `  :global arofiTmpIface ""`,
      `  :do {`,
      `    :local parser [:parse ":global arofiTmpRouteId; :global arofiTmpIface [/ip route get \\$arofiTmpRouteId interface]"]`,
      `    $parser`,
      `  } on-error={}`,
      `  :if ($arofiTmpIface = "") do={`,
      `    :do {`,
      `      :local parser [:parse ":global arofiTmpRouteId; :global arofiTmpIface; :local gw [/ip route get \\$arofiTmpRouteId gateway-status]; :local via [:find \\$gw \\\"via \\\" -1]; :if (\\$via >= 0) do={ :set arofiTmpIface [:pick \\$gw (\\$via + 4) [:len \\$gw]] }"]`,
      `      $parser`,
      `    } on-error={}`,
      `  }`,
      `  :if ($arofiTmpIface != "" && $arofiTmpIface != "${excluded}") do={ :set ${varName} $arofiTmpIface }`,
      `}`,
    ]
  }
}

type RouterOsApiConnectInput = {
  host: string
  port: number
  useTls?: boolean
  timeoutMs: number
}

class RouterOsApiClient {
  private constructor(
    private readonly socket: net.Socket | tls.TLSSocket,
    private readonly timeoutMs: number,
  ) {}

  static connect(input: RouterOsApiConnectInput) {
    return new Promise<RouterOsApiClient>((resolve, reject) => {
      const socket = input.useTls
        ? tls.connect({
            host: input.host,
            port: input.port,
            rejectUnauthorized: false,
          })
        : net.createConnection({ host: input.host, port: input.port })
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('RouterOS API connection timed out'))
      }, input.timeoutMs)

      socket.once('connect', () => {
        clearTimeout(timer)
        socket.setTimeout(input.timeoutMs)
        resolve(new RouterOsApiClient(socket, input.timeoutMs))
      })
      socket.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      socket.once('timeout', () => {
        socket.destroy()
        reject(new Error('RouterOS API request timed out'))
      })
    })
  }

  async login(username: string, password: string) {
    await this.command(['/login', `=name=${username}`, `=password=${password}`])
  }

  async command(words: string[]) {
    await this.writeSentence(words)
    return this.readReply()
  }

  close() {
    this.socket.destroy()
  }

  private writeSentence(words: string[]) {
    return new Promise<void>((resolve, reject) => {
      const chunks = words.flatMap((word) => [this.encodeLength(Buffer.byteLength(word)), Buffer.from(word)])
      chunks.push(Buffer.from([0]))
      this.socket.write(Buffer.concat(chunks), (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  private async readReply() {
    const rows: Array<Record<string, string>> = []
    while (true) {
      const sentence = await this.readSentence()
      const marker = sentence[0]
      if (marker === '!done') {
        return rows
      }
      if (marker === '!trap' || marker === '!fatal') {
        const message =
          sentence
            .map((word) => word.match(/^=message=(.*)$/)?.[1])
            .find(Boolean) ?? marker
        throw new Error(`RouterOS API error: ${message}`)
      }
      if (marker === '!re') {
        const row: Record<string, string> = {}
        for (const word of sentence.slice(1)) {
          const match = word.match(/^=([^=]+)=(.*)$/)
          if (match) {
            row[match[1]] = match[2]
          }
        }
        rows.push(row)
      }
    }
  }

  private async readSentence() {
    const words: string[] = []
    while (true) {
      const length = await this.readLength()
      if (length === 0) {
        return words
      }
      words.push((await this.readBytes(length)).toString('utf8'))
    }
  }

  private async readLength() {
    const first = (await this.readBytes(1))[0]
    if ((first & 0x80) === 0x00) return first
    if ((first & 0xc0) === 0x80) return ((first & ~0xc0) << 8) + (await this.readBytes(1))[0]
    if ((first & 0xe0) === 0xc0) {
      const rest = await this.readBytes(2)
      return ((first & ~0xe0) << 16) + (rest[0] << 8) + rest[1]
    }
    if ((first & 0xf0) === 0xe0) {
      const rest = await this.readBytes(3)
      return ((first & ~0xf0) << 24) + (rest[0] << 16) + (rest[1] << 8) + rest[2]
    }
    const rest = await this.readBytes(4)
    return (rest[0] << 24) + (rest[1] << 16) + (rest[2] << 8) + rest[3]
  }

  private readBytes(length: number) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      let total = 0
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('RouterOS API read timed out'))
      }, this.timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
        this.socket.off('data', onData)
        this.socket.off('error', onError)
        this.socket.off('close', onClose)
      }
      const onData = (chunk: Buffer) => {
        chunks.push(chunk)
        total += chunk.length
        if (total >= length) {
          cleanup()
          const buffer = Buffer.concat(chunks, total)
          const wanted = buffer.subarray(0, length)
          const extra = buffer.subarray(length)
          if (extra.length > 0) {
            this.socket.unshift(extra)
          }
          resolve(wanted)
        }
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onClose = () => {
        cleanup()
        reject(new Error('RouterOS API connection closed'))
      }
      this.socket.on('data', onData)
      this.socket.once('error', onError)
      this.socket.once('close', onClose)
    })
  }

  private encodeLength(length: number) {
    if (length < 0x80) return Buffer.from([length])
    if (length < 0x4000) return Buffer.from([(length >> 8) | 0x80, length & 0xff])
    if (length < 0x200000) return Buffer.from([(length >> 16) | 0xc0, (length >> 8) & 0xff, length & 0xff])
    if (length < 0x10000000) {
      return Buffer.from([(length >> 24) | 0xe0, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff])
    }
    return Buffer.from([0xf0, (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff])
  }
}
