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
  radiusAuthPort: number
  radiusAccountingPort: number
  sharedSecret: string
  adminUsername?: string | null
  adminPassword?: string | null
  hotspotServerName?: string | null
  portalHosts?: string[]
  ttlAntiTetheringEnabled?: boolean
  mode?: 'SAFE_EXISTING_ROUTER' | 'FRESH_FULL_HOTSPOT' | 'FRESH_FULL_CAPTIVE_WIFI'
  hotspotNetworkName?: string | null
  portalBaseUrl?: string | null
}

@Injectable()
export class MikrotikService {
  constructor(private readonly configService: ConfigService) {}

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
    return `/tool fetch url="${url}" check-certificate=no dst-path="arofi-setup.rsc" mode=https; /import file-name="arofi-setup.rsc"; /file remove "arofi-setup.rsc"`
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

    return {
      host,
      authPort,
      accountingPort,
      sharedSecret: secret,
    }
  }

  buildProvisioningScript(input: ProvisioningInput) {
    const apiService =
      input.connectionMode === RouterConnectionMode.ROUTEROS_API_SSL ? 'api-ssl' : 'api'

    const registrationKey = input.registrationKey ?? 'manual-test-router'
    const profileName = `arofi-${registrationKey.slice(0, 8)}`
    const ssid = (input.hotspotNetworkName || input.routerName || 'AROFi Free WiFi').slice(0, 32)
    const hotspotName = input.hotspotServerName || 'arofi-hotspot'
    // Isolated hotspot subnet. Chosen to avoid the common 192.168.88.x / 10.0.0.x
    // ranges so it does not clash with the operator's existing LAN/management.
    const gatewayIp = '10.55.0.1'
    const subnet = '10.55.0.0/24'
    const poolRange = '10.55.0.10-10.55.0.254'

    const callbackUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const fallbackCallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const loginHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const fallbackLoginHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const heartbeatUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/heartbeat/${this.escape(registrationKey)}`
    const fallbackHeartbeatUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/heartbeat/${this.escape(registrationKey)}`
    const callbackScript = this.buildProvisioningCallbackScript(callbackUrl, fallbackCallbackUrl)
    const heartbeatScript = this.buildHeartbeatScheduler(heartbeatUrl, fallbackHeartbeatUrl)
    const loginHtmlInstallScript = this.buildLoginHtmlInstallScript(loginHtmlUrl, fallbackLoginHtmlUrl)

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
      `:do { /tool mac-server set allowed-interface-list=all } on-error={}`,
      `:do { /tool mac-server mac-winbox set allowed-interface-list=all } on-error={}`,
      ``,
      `# 2. AROFi RADIUS server for HotSpot auth + accounting`,
      `/radius remove [find where comment="AROFi ${this.escape(registrationKey)}"]`,
      `/radius add service=hotspot address=${input.radiusHost} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=5s comment="AROFi ${this.escape(registrationKey)}"`,
      `:do { /radius incoming set accept=yes } on-error={}`,
    ]

    const hotspotProfile = [
      ``,
      `# 3. HotSpot profile bound to AROFi RADIUS`,
      `:if ([:len [/ip hotspot profile find name="${profileName}"]] = 0) do={ /ip hotspot profile add name="${profileName}" }`,
      `/ip hotspot profile set [find name="${profileName}"] use-radius=yes radius-accounting=yes radius-interim-update=5m html-directory=hotspot login-by=http-pap split-user-domain=no radius-location-id="${this.escape(registrationKey)}" radius-location-name="${this.escape(registrationKey)}"`,
      `/ip hotspot user profile set [find default=yes] shared-users=1`,
    ]

    const walledGarden = [
      ``,
      `# 4. Walled garden so the portal + payment pages load before login`,
      ...this.buildWalledGarden(input.portalHosts ?? []),
      ``,
      `# 4b. Install the AROFi captive portal redirect page`,
      ...loginHtmlInstallScript,
    ]

    const antiTether = input.ttlAntiTetheringEnabled
      ? [
          ``,
          `# Optional TTL anti-tethering`,
          `/ip firewall mangle remove [find comment="AROFi anti-tether"]`,
          `/ip firewall mangle add chain=forward action=change-ttl new-ttl=set:1 passthrough=yes comment="AROFi anti-tether"`,
        ]
      : []

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
      `/ip dns set allow-remote-requests=yes`,
      `/ip dns set servers=1.1.1.1,8.8.8.8`,
      `/ip firewall nat remove [find comment="AROFi hotspot nat"]`,
      `/ip firewall nat add chain=srcnat src-address=${subnet} action=masquerade comment="AROFi hotspot nat"`,
      `# Allow authenticated hotspot clients to actually reach the internet. On`,
      `# boards with a default drop-everything-else forward firewall, hotspot`,
      `# traffic would otherwise be dropped and a logged-in customer sees`,
      `# "address unreachable" instead of the web.`,
      `/ip firewall filter remove [find comment="AROFi hotspot forward"]`,
      `:do { /ip firewall filter add chain=forward action=accept src-address=${subnet} comment="AROFi hotspot forward" place-before=0 } on-error={ /ip firewall filter add chain=forward action=accept src-address=${subnet} comment="AROFi hotspot forward" }`,
      `:do { /ip firewall filter add chain=forward action=accept dst-address=${subnet} connection-state=established,related comment="AROFi hotspot forward" place-before=0 } on-error={ /ip firewall filter add chain=forward action=accept dst-address=${subnet} connection-state=established,related comment="AROFi hotspot forward" }`,
      ``,
      `# 3e. Create the HotSpot server on the isolated bridge`,
      `/ip hotspot profile set [find name="${profileName}"] hotspot-address=${gatewayIp}`,
      `/ip hotspot remove [find interface=arofi-hotspot]`,
      `/ip hotspot add name="${this.escape(hotspotName)}" interface=arofi-hotspot address-pool=arofi-pool profile="${profileName}" addresses-per-mac=2 disabled=no`,
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

  private buildProvisioningCallbackScript(callbackUrl: string, fallbackCallbackUrl: string) {
    return [
      `:delay 3s`,
      `:do {`,
      `  /tool fetch url="${callbackUrl}" check-certificate=no mode=https keep-result=no`,
      `  :put "AROFi provisioning callback sent."`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${fallbackCallbackUrl}" mode=http keep-result=no`,
      `    :put "AROFi provisioning callback sent by HTTP fallback."`,
      `  } on-error={`,
      `    :put "Warning: AROFi provisioning callback failed. Check WAN internet, DNS, HTTPS, and VPS port 4012."`,
      `  }`,
      `}`,
    ]
  }

  private buildLoginHtmlInstallScript(loginHtmlUrl: string, fallbackLoginHtmlUrl: string) {
    return [
      `:do {`,
      `  /tool fetch url="${loginHtmlUrl}" check-certificate=no mode=https dst-path="hotspot/login.html"`,
      `  :put "AROFi HotSpot login.html installed."`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${fallbackLoginHtmlUrl}" mode=http dst-path="hotspot/login.html"`,
      `    :put "AROFi HotSpot login.html installed by HTTP fallback."`,
      `  } on-error={`,
      `    :put "Warning: could not install AROFi hotspot/login.html. Customers will not auto-open the AROFi portal until this file is installed."`,
      `  }`,
      `}`,
    ]
  }

  // Moves a Wi-Fi interface onto the isolated arofi-hotspot bridge whether or
  // not it is currently a bridge port elsewhere (e.g. the operator's LAN).
  buildLoginHtml(registrationKey: string, portalBaseUrl?: string | null) {
    const target = this.resolvePortalBaseUrl(portalBaseUrl)
    const escapedTarget = this.escapeHtml(target)
    const escapedKey = this.escapeHtml(registrationKey)

    return [
      '<!doctype html>',
      '<html>',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>Connecting to AROFi...</title>',
      '</head>',
      '<body>',
      '  <script>',
      '    var urlParams = new URLSearchParams(window.location.search);',
      '    var u = urlParams.get("username");',
      '    var p = urlParams.get("password");',
      '    if (u && p) {',
      '      var form = document.createElement("form");',
      '      form.method = "POST";',
      '      form.action = "$(link-login-only)";',
      '      ',
      '      var usernameInput = document.createElement("input");',
      '      usernameInput.type = "hidden";',
      '      usernameInput.name = "username";',
      '      usernameInput.value = u;',
      '      form.appendChild(usernameInput);',
      '      ',
      '      var passwordInput = document.createElement("input");',
      '      passwordInput.type = "hidden";',
      '      passwordInput.name = "password";',
      '      passwordInput.value = p;',
      '      form.appendChild(passwordInput);',
      '      ',
      '      var dstInput = document.createElement("input");',
      '      dstInput.type = "hidden";',
      '      dstInput.name = "dst";',
      '      dstInput.value = urlParams.get("dst") || "http://neverssl.com/";',
      '      form.appendChild(dstInput);',
      '      ',
      '      var popupInput = document.createElement("input");',
      '      popupInput.type = "hidden";',
      '      popupInput.name = "popup";',
      '      popupInput.value = "false";',
      '      form.appendChild(popupInput);',
      '      ',
      '      document.body.appendChild(form);',
      '      form.submit();',
      '    } else {',
      `      var target = "${escapedTarget}";`,
      '      var params = new URLSearchParams();',
      '      params.set("mac", "$(mac)");',
      '      params.set("ip", "$(ip)");',
      '      params.set("link-login", "$(link-login-only)");',
      '      params.set("server", "$(server-name)");',
      `      params.set("routerKey", "${escapedKey}");`,
      '      function pickVoucher(value) {',
      '        if (!value) return "";',
      '        try {',
      '          var parsed = new URL(value, window.location.href);',
      '          return parsed.searchParams.get("voucher") || parsed.searchParams.get("code") || "";',
      '        } catch (error) {',
      '          var query = String(value).split("?")[1] || "";',
      '          return new URLSearchParams(query).get("voucher") || new URLSearchParams(query).get("code") || "";',
      '        }',
      '      }',
      '      var voucher = pickVoucher(window.location.href) || pickVoucher("$(link-orig)");',
      '      if (voucher) params.set("voucher", voucher);',
      '      window.location.replace(target + "?" + params.toString());',
      '    }',
      '  </script>',
      '</body>',
      '</html>',
    ].join('\n')
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
}
