import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  RouterConnectionMode,
  RouterStatus,
} from '@prisma/client'
import * as net from 'net'

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

  // Single command the operator pastes into WinBox Terminal. Built server-side
  // so it always uses the real public API host (API_PUBLIC_HOST) instead of a
  // domain hardcoded in the frontend.
  buildOneRunCommand(registrationKey: string) {
    const url = `${this.resolveApiBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    const fallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    // Many self-onboarded routers (static WAN IP, factory reset) have no DNS
    // servers configured, so this very first fetch-by-hostname fails before
    // any AROFi script ever runs. Bootstrap public DNS first, but only if
    // none is already set, so an operator's existing resolver is untouched.
    const dnsBootstrap = ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; '
    return `${dnsBootstrap}:do { /tool fetch url="${url}" check-certificate=no dst-path="arofi-setup.rsc" } on-error={ :do { /tool fetch url="${fallbackUrl}" dst-path="arofi-setup.rsc" } on-error={ :put "Error: AROFi setup download failed." } }; :if ([:len [/file find name="arofi-setup.rsc"]]>0) do={ /import file-name="arofi-setup.rsc"; /file remove "arofi-setup.rsc" }`
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
      `:do { /tool mac-server set allowed-interface-list=all } on-error={}`,
      `:do { /tool mac-server mac-winbox set allowed-interface-list=all } on-error={}`,
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
      `:do { /radius incoming set accept=yes } on-error={}`,
    ]

    const hotspotProfile = [
      ``,
      `# 3. HotSpot profile bound to AROFi RADIUS`,
      `:if ([:len [/ip hotspot profile find name="${profileName}"]] = 0) do={ /ip hotspot profile add name="${profileName}" }`,
      `/ip hotspot profile set [find name="${profileName}"] use-radius=yes radius-accounting=yes radius-interim-update=1m html-directory=hotspot login-by=http-pap split-user-domain=no radius-location-id="${this.escape(registrationKey)}" radius-location-name="${this.escape(registrationKey)}"${input.dnsName ? ` dns-name="${this.escape(input.dnsName)}"` : ''}`,
      // keepalive-timeout=30s was too aggressive: captive-portal mini-browsers
      // (Android/iOS/Windows "sign in to network") auto-close themselves right
      // after showing "You are logged in", which stops the heartbeat and got
      // the device logged out ~30s later even though it never left the WiFi.
      // shared-users=1 + MAC-bound RADIUS credentials already prevent sharing,
      // so this only needs to reclaim genuinely abandoned sessions, not police
      // normal logins. 2m matches MikroTik's own default. Package-expiry
      // disconnection is unaffected — that's enforced separately via the
      // RADIUS Session-Timeout attribute, which still cuts off instantly.
      `/ip hotspot user profile set [find default=yes] shared-users=1 keepalive-timeout=2m`,
      `:foreach up in=[/ip hotspot user profile find] do={ /ip hotspot user profile set $up shared-users=1 keepalive-timeout=2m }`,
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
      `# 3b. Dedicated, isolated HotSpot bridge — keeps your WAN + management intact`,
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
      `# Try multiple methods: default route → PPPoE → LTE → any non-hotspot interface with IP`,
      `# Every fallback below also excludes our own remote-access tunnel (${this.escape(remoteClientName)})`,
      `# so customer traffic never gets masqueraded into AROFi's management VPN.`,
      ...this.buildWanDetectionScript('wanIface', remoteClientName),
      `:if ($wanIface = "") do={`,
      `  :foreach ppp in=[/interface find type=pppoe] do={ :local pppName [/interface get $ppp name]; :if ($pppName != "${this.escape(remoteClientName)}") do={ :set wanIface $pppName } }`,
      `}`,
      `:if ($wanIface = "") do={`,
      `  :foreach lte in=[/interface lte find] do={ :set wanIface [/interface lte get $lte name] }`,
      `}`,
      `:if ($wanIface = "") do={`,
      `  :foreach addr in=[/ip address find] do={`,
      `    :local addrIf [/ip address get $addr interface]`,
      `    :if ($addrIf != "arofi-hotspot" && $addrIf != "" && $addrIf != "${this.escape(remoteClientName)}") do={ :set wanIface $addrIf }`,
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
      `# Firewall: allow hotspot clients forward (must be before any DROP rule)`,
      `/ip firewall filter remove [find comment="AROFi hotspot forward"]`,
      `/ip firewall filter add chain=forward action=accept src-address=${subnet} comment="AROFi hotspot forward"`,
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

  private buildHeartbeatScheduler(heartbeatUrl: string, fallbackHeartbeatUrl: string) {
    const intervalSeconds = Math.max(
      5,
      Number.parseInt(process.env.ROUTER_HEARTBEAT_SECONDS ?? '15', 10),
    )
    // URLs contain no spaces, so they need no inner quoting inside the script
    // source — this keeps the generated .rsc free of fragile nested escapes.
    const source = `:do { /tool fetch url=${heartbeatUrl} check-certificate=no mode=https keep-result=no } on-error={ :do { /tool fetch url=${fallbackHeartbeatUrl} mode=http keep-result=no } on-error={} }`
    return [
      `/system script remove [find name="arofi-heartbeat"]`,
      `/system script add name="arofi-heartbeat" source="${source}"`,
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
    const profileSet = profileName
      ? [`/ip hotspot profile set [find name="${this.escape(profileName)}"] html-directory=hotspot`]
      : []
    return [
      `:do {`,
      `  /tool fetch url="${loginHtmlUrl}" check-certificate=no mode=https dst-path="hotspot/login.html"`,
      `  :if ([:len [/file find name="hotspot/login.html"]] > 0) do={`,
      `    :put "AROFi HotSpot login.html installed."`,
      `  } else={`,
      `    :error "login.html not found after fetch"`,
      `  }`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${fallbackLoginHtmlUrl}" mode=http dst-path="hotspot/login.html"`,
      `    :put "AROFi HotSpot login.html installed by HTTP fallback."`,
      `  } on-error={`,
      `    :put "WARNING: login.html install FAILED — portal will show MikroTik default UI."`,
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
      `  } else={`,
      `    :error "status.html not found after fetch"`,
      `  }`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${fallbackStatusHtmlUrl}" mode=http dst-path="hotspot/status.html"`,
      `    :put "AROFi HotSpot status.html installed by HTTP fallback."`,
      `  } on-error={`,
      `    :put "WARNING: status.html install FAILED — post-login page will need a manual tap."`,
      `  }`,
      `}`,
      ...profileSet,
    ]
  }

  // Moves a Wi-Fi interface onto the isolated arofi-hotspot bridge whether or
  // not it is currently a bridge port elsewhere (e.g. the operator's LAN).
  buildLoginHtml(registrationKey: string, portalBaseUrl?: string | null) {
    const apiBaseUrl = this.escapeHtml(this.resolveApiBaseUrl())
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
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#eff6ff;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px}
    .card{width:100%;max-width:420px;background:#fff;border:1px solid #bfdbfe;border-radius:20px;padding:26px 22px;box-shadow:0 8px 32px rgba(37,99,235,.10)}
    .logo{text-align:center;margin-bottom:18px}
    .wifi-icon{color:#2563EB;margin-bottom:8px;animation:pulse 2.2s infinite ease-in-out;display:inline-block}
    @keyframes pulse{0%,100%{opacity:.4;transform:scale(.92)}50%{opacity:1;transform:scale(1.05)}}
    .logo h1{font-size:16px;font-weight:800;letter-spacing:.08em;color:#2563EB;margin-top:4px;text-transform:uppercase}
    .logo p{font-size:11px;color:#64748b;margin-top:2px}
    .spin-wrap{text-align:center;padding:28px 0}
    .spinner{width:30px;height:30px;border:3px solid #bfdbfe;border-top-color:#2563EB;border-radius:50%;animation:spin .8s linear infinite;display:inline-block}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spin-wrap p{color:#64748b;font-size:13px;margin-top:10px}
    .quick-row{display:flex;gap:8px;margin-bottom:10px}
    .quick-row input{flex:1}
    .quick-row button{width:auto;padding:11px 18px;white-space:nowrap}
    .find-link{display:block;width:100%;text-align:center;background:#eff6ff;border:1px solid #bfdbfe;color:#2563EB;font-size:12.5px;font-weight:700;padding:9px;border-radius:9px;cursor:pointer;margin-bottom:16px}
    .find-panel{display:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:16px}
    .find-panel.on{display:block}
    .section-label{text-align:center;font-size:12.5px;color:#64748b;margin-bottom:12px}
    .pkgs{max-height:280px;overflow-y:auto;margin-bottom:14px}
    .pkg{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:11px 13px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;transition:border-color .18s}
    .pkg.sel{border-color:#2563EB;background:#eff6ff}
    .pkg h3{font-size:14px;font-weight:700;color:#0f172a}
    .pkg p{font-size:12px;color:#64748b;margin-top:1px}
    .price{font-size:13px;font-weight:800;color:#2563EB;white-space:nowrap}
    .buy-btn{background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#fff;border:none;padding:9px 16px;font-size:13px;font-weight:800;border-radius:9px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(37,99,235,.22)}
    .modal-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:16px}
    .modal-overlay.on{display:flex}
    .pay-box{background:#fff;border-radius:16px;padding:20px;width:100%;max-width:360px;box-shadow:0 20px 50px rgba(15,23,42,.25);position:relative}
    .pay-box .pclose{position:absolute;top:12px;right:14px;background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;line-height:1}
    .pay-box .pname{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px;padding-right:20px}
    lbl{display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
    .iw{position:relative;margin-bottom:13px}
    input[type=text],input[type=tel]{width:100%;background:#f8fafc;border:1px solid #e2e8f0;padding:11px 13px;border-radius:10px;color:#0f172a;font-size:15px;outline:none;transition:border-color .18s}
    input:focus{border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,.15)}
    .btn{width:100%;background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#fff;border:none;padding:13px;font-size:15px;font-weight:700;border-radius:10px;cursor:pointer;box-shadow:0 3px 10px rgba(37,99,235,.22);transition:all .18s}
    .btn:hover{opacity:.92;transform:translateY(-1px)}
    .btn:disabled{background:#e2e8f0;color:#94a3b8;cursor:not-allowed;transform:none;box-shadow:none}
    .st{margin-top:13px;padding:10px 13px;border-radius:10px;font-size:13px;line-height:1.4;display:none}
    .st.err{background:#fff1f2;border:1px solid #fecdd3;color:#be123c;display:block}
    .st.ok{background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;display:block}
    .st.info{background:#f8fafc;border:1px solid #e2e8f0;color:#475569;display:block}
    .accept{text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-top:6px}
    .accept-label{font-size:12px;font-weight:700;color:#475569;margin-bottom:8px}
    .accept-logos{display:flex;justify-content:center;gap:8px}
    .net-badge{font-size:11px;font-weight:800;padding:5px 12px;border-radius:999px;color:#fff}
    .net-mtn{background:#ffcc00;color:#0b1f3a}
    .net-airtel{background:#e60012}
    .footer{text-align:center;margin-top:18px;font-size:12px;color:#64748b;display:none}
    .tech{margin-top:20px;text-align:center;font-size:11px;color:#94a3b8}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="wifi-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3"/>
        </svg>
      </div>
      <h1 id="tname">AROFi Hotspot</h1>
      <p id="ttag">Instant high-speed internet access</p>
    </div>

    <div id="loading" class="spin-wrap"><div class="spinner"></div><p>Loading packages...</p></div>

    <div id="content" style="display:none">
      <div class="quick-row">
        <input type="text" id="vcode" placeholder="Enter your voucher code">
        <button class="btn" id="vbtn" onclick="login()">Login</button>
      </div>
      <div class="find-link" onclick="toggleFind()">Already bought? Find My Voucher</div>
      <div class="find-panel" id="findPanel">
        <div class="iw" style="margin-bottom:9px">
          <input type="text" id="rtxn" placeholder="Phone number or Transaction ID">
        </div>
        <button class="btn" id="rbtn" onclick="rec()">Find Voucher</button>
      </div>

      <p class="section-label">Select a package and pay with Mobile Money</p>
      <div class="pkgs" id="plist"></div>

      <div class="accept">
        <div class="accept-label">We accept:</div>
        <div class="accept-logos">
          <span class="net-badge net-mtn">MTN MoMo</span>
          <span class="net-badge net-airtel">Airtel Money</span>
        </div>
      </div>

      <div class="st" id="st"></div>
    </div>
  </div>

  <div class="modal-overlay" id="payOverlay" onclick="if(event.target===this)closePay()">
    <div class="pay-box">
      <button type="button" class="pclose" onclick="closePay()">&times;</button>
      <div class="pname" id="payPkgName"></div>
      <div class="iw" style="margin-bottom:9px">
        <input type="tel" id="phone" placeholder="e.g. 0771234567">
      </div>
      <button class="btn" id="pbtn" onclick="pay()">Pay Now</button>
    </div>
  </div>

  <div class="footer" id="footer">
    <div>Need help? Contact support: <span id="sph" style="color:#2563EB;font-weight:700"></span></div>
  </div>
  <div class="tech">
    <span id="tip">IP: </span> | <span id="tmac">MAC: </span><br><br>
    Powered By <a href="https://arofi.arosoftlabs.com" target="_blank" rel="noreferrer" style="color:#2563EB;font-weight:600;text-decoration:none">AROFi</a><br>
    Terms and Conditions Apply
  </div>

  <script>
    var API="${apiBaseUrl}",RKEY="${escapedKey}";
    var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"";
    var pkgs=[],selId=null;

    window.onload=function(){
      var search=window.location.search;
      var v='';
      
      // Auto-redirect for mikrotik username/password
      if(search&&search.indexOf('username=')!==-1&&search.indexOf('password=')!==-1){
        var parts=search.split('&');
        var u='',p='',dst='';
        for(var i=0;i<parts.length;i++){
          var kv=parts[i].split('=');
          if(kv[0]==='username'||kv[0]==='?username') u=kv[1];
          if(kv[0]==='password') p=kv[1];
          if(kv[0]==='dst') dst=kv[1];
        }
        if(u&&p){
          window.location.href=lo+'?username='+u+'&password='+p+'&dst='+(dst||encodeURIComponent('http://google.com'));
          return;
        }
      }
      
      // Auto-login for voucher
      if(search&&search.indexOf('voucher=')!==-1){
        var parts=search.split('voucher=');
        if(parts.length>1)v=parts[1].split('&')[0];
      }
      if(v){
        document.getElementById('vcode').value=decodeURIComponent(v);
        setTimeout(login, 200);
      }

      if(ip)document.getElementById('tip').textContent='IP: '+ip;
      if(mac)document.getElementById('tmac').textContent='MAC: '+mac.toUpperCase();
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

    function load(){
      ajax('GET', API+'/api/portal/context?mac='+encodeURIComponent(mac)+'&ip='+encodeURIComponent(ip)+'&routerKey='+encodeURIComponent(RKEY)+'&server='+encodeURIComponent(srv)+'&loginUrl='+encodeURIComponent(lo), null, function(err, d){
        if(err){
          document.getElementById('tname').textContent='AROFi Hotspot';
          document.getElementById('loading').style.display='none';
          document.getElementById('content').style.display='block';
          return;
        }
        if(d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect){
          conn(d.returningDevice.reconnect);return;
        }

        pkgs=d.packages||[];
        document.getElementById('tname').textContent=d.tenant?d.tenant.name:'AROFi Hotspot';
        if(d.tenant&&d.tenant.supportPhone){
          document.getElementById('sph').textContent=d.tenant.supportPhone;
          document.getElementById('footer').style.display='block';
        }

        var el=document.getElementById('plist');el.innerHTML='';
        pkgs.forEach(function(p){
          var d2=p.description||(fdur(p.durationMinutes)+(p.dataLimitMb?' · '+fmb(p.dataLimitMb):' · Unlimited data'));
          var c=document.createElement('div');c.className='pkg';c.id='pkg-'+p.id;
          c.innerHTML='<div class="pkg-info"><h3>'+esc(p.name)+'</h3><p>'+esc(d2)+'</p></div><div class="price">UGX '+fn(p.amountUgx)+'</div><button type="button" class="buy-btn" data-id="'+esc(p.id)+'">BUY</button>';
          c.querySelector('.buy-btn').onclick=function(){selPkg(p.id);};
          el.appendChild(c);
        });
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
      document.getElementById('payPkgName').textContent=pkg?(pkg.name+' · UGX '+fn(pkg.amountUgx)):'';
      document.getElementById('pbtn').disabled=false;
      document.getElementById('payOverlay').classList.add('on');
      document.getElementById('phone').focus();
    }

    function closePay(){
      document.getElementById('payOverlay').classList.remove('on');
    }

    function login(){
      var code=document.getElementById('vcode').value.trim().toUpperCase().replace(/\\s+/g,'');
      if(!code){sst('Enter your voucher code.','err');return;}
      var b=document.getElementById('vbtn');
      b.disabled=true;b.textContent='Logging in...';
      sst('Verifying voucher...','info');

      ajax('POST', API+'/api/portal/redeem-voucher', {code:code,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo}, function(err, res){
        if(err){
          sst(err.message||'Failed','err');b.disabled=false;b.textContent='Login';
        } else {
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
      
      sst('Initiating payment...','info');
      var b=document.getElementById('pbtn');b.disabled=true;
      
      var pfx=c.substring(3,5);
      var net=(pfx==='70'||pfx==='75'||pfx==='74')?'AIRTEL':'MTN';
      
      ajax('POST', API+'/api/payments/portal/initiate', {packageId:selId,phoneNumber:c,customerReference:c,network:net,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo}, function(err, pmt){
        if(err){ sst(err.message||'Failed','err');b.disabled=false;return; }
        if(pmt.status==='FAILED'){ sst(pmt.statusMessage||'Failed','err');b.disabled=false;return; }
        
        var cu=pmt.checkoutUrl||(pmt.responsePayload&&(pmt.responsePayload.checkoutUrl||(pmt.responsePayload.gateway&&pmt.responsePayload.gateway.checkoutUrl)));
        if(cu){window.location.href=cu;return;}
        sst('Enter your Mobile Money PIN on your phone. Waiting for approval...','info');
        poll(pmt.id,pmt.statusToken);
      });
    }

    function poll(id,tok){
      var n=0,iv=setInterval(function(){
        if(++n>120){clearInterval(iv);sst('Timed out waiting for payment.','err');document.getElementById('pbtn').disabled=false;return;}
        ajax('POST', API+'/api/payments/'+id+'/check-status'+(tok?'?token='+encodeURIComponent(tok):''), null, function(err, p){
          if(err) return;
          if(p.activation){clearInterval(iv);sst('Payment Approved! Connecting...','ok');conn(p.reconnect);}
          else if(p.status==='FAILED'){clearInterval(iv);sst(p.statusMessage||'Payment Declined.','err');document.getElementById('pbtn').disabled=false;}
        });
      },1500);
    }

    function rec(){
      var txn=document.getElementById('rtxn').value.trim();
      if(!txn){sst('Enter your phone number or transaction ID.','err');return;}
      var b=document.getElementById('rbtn');b.disabled=true;b.textContent='Searching...';
      sst('Searching for voucher...','info');

      ajax('POST', API+'/api/portal/recover-voucher', {transactionId:txn,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo}, function(err, res){
        if(err){ sst(err.message||'Not found','err');b.disabled=false;b.textContent='Find Voucher'; }
        else { sst('Found! Connecting...','ok');conn(res.reconnect); }
      });
    }

    function conn(rc){if(!rc||!rc.username)return;var dst='http://neverssl.com/';window.location.href=lo+'?username='+encodeURIComponent(rc.username)+'&password='+encodeURIComponent(rc.password||rc.username)+'&dst='+encodeURIComponent(dst);}
    function sst(m,t){var s=document.getElementById('st');if(m){s.className='st '+t;s.textContent=m;}else{s.style.display='none';}}
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
  <meta http-equiv="refresh" content="0;url=$(link-orig-esc)">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connected</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#eff6ff;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center}
    .spinner{width:30px;height:30px;border:3px solid #bfdbfe;border-top-color:#2563EB;border-radius:50%;animation:spin .8s linear infinite;display:inline-block;margin-bottom:14px}
    @keyframes spin{to{transform:rotate(360deg)}}
    p{color:#475569;font-size:14px}
    a{color:#2563EB;font-weight:700}
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>You're connected. Redirecting&hellip;</p>
  <p style="margin-top:10px"><a href="$(link-orig-esc)">Click here if nothing happens</a></p>
  <script>
    window.location.replace("$(link-orig-esc)");
  </script>
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
      `:if ([:len [/interface wireless find name="${iface}"]]>0) do={/interface wireless set [find name="${iface}"] disabled=no mode=ap-bridge band=2ghz-b/g/n ssid="${escapedSsid}" security-profile=arofi-open; ${bridgePort(iface)}}`

    const v7Inner = (iface: string) =>
      `:if ([:len [/interface wifi find name="${iface}"]]>0) do={/interface wifi set [find name="${iface}"] disabled=no configuration.mode=ap configuration.ssid="${escapedSsid}" security.authentication-types=""; ${bridgePort(iface)}}`

    const securityProfile =
      `:if ([:len [/interface wireless security-profiles find name="arofi-open"]]>0) do={/interface wireless security-profiles set [find name="arofi-open"] mode=none authentication-types=""} else={/interface wireless security-profiles add name="arofi-open" mode=none authentication-types=""}`

    return [
      ...this.parseGuard('/interface wireless cap set enabled=no', 'AROFi: no wireless CAP menu - skipped.'),
      ...this.parseGuard(securityProfile, 'AROFi: wireless security-profiles not available - skipped.'),
      ...this.parseGuard(v6Inner('wlan1'), 'AROFi: wlan1 (RouterOS 6 wireless) not available - skipped.'),
      ...this.parseGuard(v6Inner('wlan2'), 'AROFi: wlan2 not available - skipped.'),
      ...this.parseGuard(v7Inner('wifi1'), 'AROFi: wifi1 (RouterOS 7 wifi) not available - skipped.'),
      ...this.parseGuard(v7Inner('wifi2'), 'AROFi: wifi2 not available - skipped.'),
    ]
  }

  // Wraps a RouterOS command string so it is compiled at runtime via [:parse]
  // and any failure (e.g. a menu that does not exist on this RouterOS version)
  // is caught instead of aborting the import.
  private parseGuard(inner: string, putOnError: string) {
    const escaped = inner.replace(/"/g, '\\"')
    return [`:do { :local arofiApply [:parse "${escaped}"]; $arofiApply } on-error={ :put "${putOnError}" }`]
  }

  private escape(value: string) {
    return value.replace(/"/g, '\\"')
  }

  private escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  }

  private resolveApiBaseUrl() {
    const host =
      this.configService.get<string>('API_PUBLIC_HOST') ||
      this.configService.get<string>('PORTAL_PUBLIC_HOST') ||
      'arofi.arosoft.io'
    return `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  }

  private resolvePortalBaseUrl(configured?: string | null) {
    if (configured) {
      return configured.replace(/\/$/, '')
    }

    const host =
      this.configService.get<string>('PORTAL_PUBLIC_HOST') ||
      this.configService.get<string>('API_PUBLIC_HOST') ||
      'arofi.arosoft.io'

    return `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}/portal`
  }

  private resolveHttpCallbackBaseUrl() {
    const configured = this.configService.get<string>('MIKROTIK_CALLBACK_HTTP_URL')
    if (configured) {
      return configured.replace(/\/$/, '')
    }

    const host =
      this.configService.get<string>('RADIUS_PUBLIC_HOST') ||
      this.configService.get<string>('API_PUBLIC_HOST') ||
      this.configService.get<string>('PORTAL_PUBLIC_HOST') ||
      'arofi.arosoft.io'

    return `http://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}:4012`
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
