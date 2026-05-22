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
    const hotspotName = input.hotspotServerName || input.hotspotNetworkName || 'hotspot1'
    const ssid = input.hotspotNetworkName || hotspotName || 'AROFi Free WiFi'
    const callbackUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const fallbackCallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const loginHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const fallbackLoginHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const callbackScript = this.buildProvisioningCallbackScript(callbackUrl, fallbackCallbackUrl)
    const loginHtmlInstallScript = this.buildLoginHtmlInstallScript(loginHtmlUrl, fallbackLoginHtmlUrl)
    const isFreshCaptiveWifi =
      input.mode === 'FRESH_FULL_CAPTIVE_WIFI' || input.mode === 'FRESH_FULL_HOTSPOT'

    const safeScript = [
      `# AROFi MikroTik onboarding script`,
      `# Mode: ${input.mode ?? 'SAFE_EXISTING_ROUTER'}`,
      `# Router: ${this.escape(input.routerName.slice(0, 30))}`,
      `# Registration key: ${this.escape(registrationKey)}`,
      ``,
      `# 1. Identity and RouterOS API service`,
      `/system identity set name="${this.escape(input.identity.slice(0, 30))}"`,
      `/ip service enable ${apiService}`,
      `/ip service set ${apiService} port=${input.apiPort} disabled=no`,
      `/ip service enable winbox`,
      `/ip service set winbox port=8291 disabled=no`,
      `:do { /tool mac-server set allowed-interface-list=all } on-error={}`,
      `:do { /tool mac-server mac-winbox set allowed-interface-list=all } on-error={}`,
      ...(input.adminPassword
        ? [
            `:do { /user set [find name="${this.escape(input.adminUsername || 'admin')}"] password="${this.escape(input.adminPassword)}" } on-error={ :put "Warning: could not set RouterOS admin password." }`,
          ]
        : []),
      ``,
      `# 2. RADIUS server for HotSpot auth and acct`,
      `/radius remove [find where comment="AROFi ${this.escape(registrationKey)}"]`,
      `/radius remove [find address=${input.radiusHost}]`,
      `/radius add service=hotspot address=${input.radiusHost} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=3s comment="AROFi ${this.escape(registrationKey)}"`,
      ``,
      `# 3. HotSpot profile integration`,
      `:if ([:len [/ip hotspot profile find name="${profileName}"]] = 0) do={`,
      `  /ip hotspot profile add name="${profileName}"`,
      `}`,
      `/ip hotspot profile set [find name="${profileName}"] use-radius=yes`,
      `/ip hotspot profile set [find name="${profileName}"] radius-accounting=yes`,
      `/ip hotspot profile set [find name="${profileName}"] radius-interim-update=5m`,
      `/ip hotspot profile set [find name="${profileName}"] html-directory=hotspot`,
      `/ip hotspot profile set [find name="${profileName}"] login-by=http-pap,cookie`,
      `/ip hotspot profile set [find name="${profileName}"] radius-location-name="${this.escape(registrationKey)}"`,
      `/ip hotspot profile set [find name="${profileName}"] radius-location-id="${this.escape(registrationKey)}"`,
      `/ip hotspot profile set [find name="${profileName}"] split-user-domain=no`,
      `/ip hotspot user profile set [find default=yes] shared-users=1`,
      ``,
      `:if ([:len [/ip hotspot find name="${this.escape(hotspotName)}"]] > 0) do={`,
      `  /ip hotspot set [find name="${this.escape(hotspotName)}"] profile="${profileName}"`,
      `} else={`,
      `  :put "Warning: HotSpot server ${this.escape(hotspotName)} not found."`,
      `}`,
      ``,
      `# 4. Walled garden for portal and payment access`,
      ...this.buildWalledGarden(input.portalHosts ?? []),
      ``,
      `# 4b. Install AROFi captive portal redirect page`,
      ...loginHtmlInstallScript,
      `/ip hotspot profile set [find name="${profileName}"] html-directory=hotspot`,
      ...(input.ttlAntiTetheringEnabled
        ? [
            ``,
            `# Optional TTL anti-tethering`,
            `/ip firewall mangle remove [find comment="AROFi anti-tether"]`,
            `/ip firewall mangle add chain=forward action=change-ttl new-ttl=set:1 passthrough=yes comment="AROFi anti-tether"`,
          ]
        : []),
      ``,
      `# 5. Router AAA accounting`,
      `/user aaa set use-radius=yes accounting=yes default-group=read`,
      `/snmp set enabled=yes`,
    ]

    if (!isFreshCaptiveWifi) {
      return [
        ...safeScript,
        ``,
        `# 6. Tell AROFi this script was imported. This lets AROFi learn the router public/NAT IP for RADIUS.`,
        ...callbackScript,
        `:put "AROFi router configured."`,
      ].join('\n')
    }

    return [
      ...safeScript,
      ``,
      `# Fresh RouterOS 6/7 captive Wi-Fi setup`,
      `# This creates bridgeLocal as LAN and ether1 as WAN. Use WinBox MAC login from a LAN port while importing.`,
      `:if ([:len [/interface bridge find name="bridgeLocal"]] = 0) do={ /interface bridge add name=bridgeLocal comment="AROFi LAN bridge" }`,
      `/interface bridge port remove [find interface=ether1]`,
      `/ip dhcp-client remove [find interface=bridgeLocal]`,
      `/ip dhcp-client remove [find interface=ether1]`,
      `/ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes disabled=no comment="AROFi WAN"`,
      `/ip address remove [find address="192.168.1.2/24"]`,
      `/ip address remove [find address="10.50.0.1/24"]`,
      `/ip address add address=10.50.0.1/24 interface=bridgeLocal`,
      ...this.buildBridgeLocalPortSetup(['ether2', 'ether3', 'ether4', 'ether5', 'ether6', 'ether7', 'ether8', 'ether9', 'ether10']),
      ``,
      `# Fresh captive Wi-Fi setup. Supports RouterOS v7 /interface wifi and legacy /interface wireless.`,
      ...this.buildOpenWifiScript(ssid),
      ``,
      `# Device-mode note: if RouterOS blocks HotSpot/Wi-Fi changes, confirm the device-mode prompt physically and reboot, then import this script again.`,
      `/ip pool remove [find name=arofi-pool]`,
      `/ip pool add name=arofi-pool ranges=10.50.0.10-10.50.0.254`,
      `/ip dhcp-server remove [find name=arofi-dhcp]`,
      `/ip dhcp-server network remove [find address="10.50.0.0/24"]`,
      `/ip dhcp-server network add address=10.50.0.0/24 gateway=10.50.0.1 dns-server=1.1.1.1,8.8.8.8`,
      `/ip dhcp-server add name=arofi-dhcp interface=bridgeLocal address-pool=arofi-pool disabled=no`,
      `/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8`,
      `/ip firewall nat remove [find comment="AROFi nat"]`,
      `/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="AROFi nat"`,
      `/ip hotspot profile set [find name="${profileName}"] hotspot-address=10.50.0.1`,
      `/ip hotspot remove [find name="${this.escape(hotspotName)}"]`,
      `/ip hotspot add name="${this.escape(hotspotName)}" interface=bridgeLocal address-pool=arofi-pool profile="${profileName}" disabled=no`,
      ``,
      `# 6. Tell AROFi this script was imported. This lets AROFi learn the router public/NAT IP for RADIUS.`,
      ...callbackScript,
      `:put "AROFi fresh setup completed."`,
    ].join('\n')
  }

  getOnboardingChecklist(routerName: string) {
    return [
      `Paste/import the provisioning script into ${routerName} from WinBox, WebFig, or SSH Terminal.`,
      'Confirm the script prints "AROFi provisioning callback sent." If it fails, the router has no HTTPS/DNS internet path to AROFi.',
      'Fresh captive Wi-Fi mode should create an OPEN SSID and install hotspot/login.html automatically. If no SSID appears, the router has no supported /interface wifi or /interface wireless interface.',
      'If the router is behind another modem/router, forward UDP 1812 and 1813 traffic outbound to the VPS. No inbound forwarding is needed for RADIUS.',
      'For AROFi API management checks only, forward TCP 8728/8729 from the public management IP to the MikroTik, or enter a reachable VPN/private IP. HotSpot/RADIUS can work even when this is not reachable.',
      'Restart FreeRADIUS after the first callback if the router was registered without a real public NAS IP: docker compose restart freeradius.',
      'Run one real customer login/payment/voucher test so MikroTik sends Access-Request and Accounting-Start packets.',
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

  private buildProvisioningCallbackScript(callbackUrl: string, fallbackCallbackUrl: string) {
    return [
      `:delay 3s`,
      `:do {`,
      `  /tool fetch url="${callbackUrl}" mode=https keep-result=no`,
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
      `  /tool fetch url="${loginHtmlUrl}" mode=https dst-path="hotspot/login.html"`,
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

  private buildBridgeLocalPortSetup(ports: string[]) {
    return ports.flatMap((port) => [
      `:if ([:len [/interface ethernet find name="${port}"]] > 0) do={`,
      `  :if ([:len [/interface bridge port find interface="${port}"]] = 0) do={ /interface bridge port add bridge=bridgeLocal interface=${port} }`,
      `}`,
    ])
  }

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
      '  <title>Opening AROFi Portal</title>',
      '</head>',
      '<body>',
      '  <p>Opening AROFi portal...</p>',
      '  <script>',
      `    var target = "${escapedTarget}";`,
      '    var params = new URLSearchParams();',
      '    params.set("mac", "$(mac)");',
      '    params.set("ip", "$(ip)");',
      '    params.set("link-login", "$(link-login-only)");',
      '    params.set("server", "$(server-name)");',
      `    params.set("routerKey", "${escapedKey}");`,
      '    window.location.replace(target + "?" + params.toString());',
      '  </script>',
      '</body>',
      '</html>',
    ].join('\n')
  }

  private buildOpenWifiScript(ssid: string) {
    const escapedSsid = this.escape(ssid.slice(0, 32) || 'AROFi Free WiFi')

    return [
      `:do { /interface wireless cap set enabled=no } on-error={ :put "AROFi: CAP wireless mode not enabled or not available." }`,
      `:do { /interface wireless security-profiles remove [find name="arofi-open"] } on-error={}`,
      `:do { /interface wireless security-profiles add name="arofi-open" mode=none authentication-types="" } on-error={}`,
      `:do {`,
      `  :if ([:len [/interface wireless find name="wlan1"]] > 0) do={`,
      `    /interface wireless set [find name="wlan1"] disabled=no mode=ap-bridge ssid="${escapedSsid}" security-profile=arofi-open`,
      `    /interface bridge port remove [find interface=wlan1]`,
      `    /interface bridge port add bridge=bridgeLocal interface=wlan1`,
      `  }`,
      `} on-error={ :put "AROFi: RouterOS 6 wlan1 setup skipped." }`,
      `:do {`,
      `  :if ([:len [/interface wireless find name="wlan2"]] > 0) do={`,
      `    /interface wireless set [find name="wlan2"] disabled=no mode=ap-bridge ssid="${escapedSsid}" security-profile=arofi-open`,
      `    /interface bridge port remove [find interface=wlan2]`,
      `    /interface bridge port add bridge=bridgeLocal interface=wlan2`,
      `  }`,
      `} on-error={}`,
      `:do {`,
      `  :if ([:len [/interface wifi find name="wifi1"]] > 0) do={`,
      `    /interface wifi set [find name="wifi1"] disabled=no configuration.mode=ap configuration.ssid="${escapedSsid}" security.authentication-types=""`,
      `    /interface bridge port remove [find interface=wifi1]`,
      `    /interface bridge port add bridge=bridgeLocal interface=wifi1`,
      `  }`,
      `} on-error={ :put "AROFi: RouterOS 7 wifi1 setup skipped." }`,
      `:do {`,
      `  :if ([:len [/interface wifi find name="wifi2"]] > 0) do={`,
      `    /interface wifi set [find name="wifi2"] disabled=no configuration.mode=ap configuration.ssid="${escapedSsid}" security.authentication-types=""`,
      `    /interface bridge port remove [find interface=wifi2]`,
      `    /interface bridge port add bridge=bridgeLocal interface=wifi2`,
      `  }`,
      `} on-error={}`,
    ]
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
