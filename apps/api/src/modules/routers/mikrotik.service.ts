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
  deviceLimit?: number | null
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
    const fallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    return `:do { /tool fetch url="${url}" check-certificate=no dst-path="arofi-setup.rsc" } on-error={ :do { /tool fetch url="${fallbackUrl}" dst-path="arofi-setup.rsc" } on-error={ :put "Error: AROFi setup download failed." } }; :if ([:len [/file find name="arofi-setup.rsc"]]>0) do={ /import file-name="arofi-setup.rsc"; /file remove "arofi-setup.rsc" }`
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
    const addressesPerMac = Math.min(Math.max(input.deviceLimit ?? 1, 1), 5)
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
    const loginHtmlInstallScript = this.buildLoginHtmlInstallScript(loginHtmlUrl, fallbackLoginHtmlUrl, profileName)

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

    const antiTether = [
      ``,
      `# TTL anti-tethering (always on — prevents hotspot-behind-hotspot NAT abuse)`,
      `/ip firewall mangle remove [find comment="AROFi anti-tether"]`,
      `/ip firewall mangle add chain=prerouting action=change-ttl new-ttl=decrement:1 passthrough=yes in-interface=arofi-hotspot comment="AROFi anti-tether"`,
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
      `:local wanIface ""`,
      `:do { :set wanIface [/ip route get [find dst-address=0.0.0.0/0] gateway-interface] } on-error={}`,
      `/ip firewall nat remove [find comment="AROFi hotspot nat"]`,
      `:if ($wanIface != "") do={`,
      `  /ip firewall nat add chain=srcnat src-address=${subnet} out-interface=$wanIface action=masquerade comment="AROFi hotspot nat"`,
      `} else={`,
      `  /ip firewall nat add chain=srcnat src-address=${subnet} action=masquerade comment="AROFi hotspot nat"`,
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

  private buildProvisioningCallbackScript(callbackUrl: string, fallbackCallbackUrl: string) {
    return [
      `:delay 3s`,
      `:local nasIp ""`,
      `:do {`,
      `  :local wanIface [/ip route get [find dst-address=0.0.0.0/0] gateway-interface]`,
      `  :local rawAddr [/ip address get [find interface=$wanIface] address]`,
      `  :set nasIp [:pick $rawAddr 0 [:find $rawAddr "/"]]`,
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

  private buildLoginHtmlInstallScript(loginHtmlUrl: string, fallbackLoginHtmlUrl: string, profileName?: string) {
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
      ...profileSet,
    ]
  }

  // Moves a Wi-Fi interface onto the isolated arofi-hotspot bridge whether or
  // not it is currently a bridge port elsewhere (e.g. the operator's LAN).
  buildLoginHtml(registrationKey: string, portalBaseUrl?: string | null) {
    const apiBaseUrl = this.escapeHtml(this.resolveApiBaseUrl())
    const escapedKey = this.escapeHtml(registrationKey)

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect to WiFi</title>
  <style>
    :root {
      --bg-gradient: radial-gradient(circle at 50% 0%, #1e293b, #0f172a, #020617);
      --card-bg: rgba(30, 41, 59, 0.45);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent-color: #10b981;
      --accent-gradient: linear-gradient(135deg, #10b981, #059669);
      --mtn-yellow: #ffcc00;
      --airtel-red: #ff0000;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: var(--bg-gradient);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow-x: hidden;
      position: relative;
    }
    .glow-1 {
      position: absolute;
      top: -100px;
      left: -50px;
      width: 300px;
      height: 300px;
      background: rgba(16, 185, 129, 0.15);
      filter: blur(80px);
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .glow-2 {
      position: absolute;
      bottom: -80px;
      right: -50px;
      width: 250px;
      height: 250px;
      background: rgba(59, 130, 246, 0.12);
      filter: blur(80px);
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 24px;
      padding: 32px 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      z-index: 10;
      position: relative;
    }
    .wifi-pulse-container {
      display: flex;
      justify-content: center;
      margin-bottom: 12px;
    }
    .wifi-pulse-icon {
      width: 42px;
      height: 42px;
      color: var(--accent-color);
      animation: wifi-pulse 2.2s infinite ease-in-out;
    }
    @keyframes wifi-pulse {
      0% {
        transform: scale(0.92);
        opacity: 0.45;
        filter: drop-shadow(0 0 0px rgba(16, 185, 129, 0));
      }
      50% {
        transform: scale(1.06);
        opacity: 1;
        filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.6));
      }
      100% {
        transform: scale(0.92);
        opacity: 0.45;
        filter: drop-shadow(0 0 0px rgba(16, 185, 129, 0));
      }
    }
    .logo-container {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo-container img {
      max-height: 48px;
      margin-bottom: 8px;
      border-radius: 8px;
    }
    .logo-container h1 {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 0.05em;
      opacity: 0.65;
      margin-top: 4px;
      background: linear-gradient(to right, #ffffff, #94a3b8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .logo-container p {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
      opacity: 0.8;
    }
    .tabs {
      display: flex;
      background: rgba(15, 23, 42, 0.6);
      padding: 4px;
      border-radius: 12px;
      margin-bottom: 20px;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }
    .tab {
      flex: 1;
      text-align: center;
      padding: 10px 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.2s ease;
    }
    .tab.active {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .packages-list {
      max-height: 220px;
      overflow-y: auto;
      margin-bottom: 20px;
      padding-right: 4px;
    }
    .packages-list::-webkit-scrollbar {
      width: 4px;
    }
    .packages-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
    .package-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 10px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .package-card:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(16, 185, 129, 0.3);
      transform: translateY(-1px);
    }
    .package-card.selected {
      background: rgba(16, 185, 129, 0.08);
      border-color: var(--accent-color);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.1);
    }
    .pkg-info h3 {
      font-size: 15px;
      font-weight: 700;
    }
    .pkg-info p {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .pkg-price {
      font-size: 15px;
      font-weight: 800;
      color: var(--accent-color);
    }
    .networks {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .network {
      flex: 1;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      text-align: center;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .network.mtn {
      background: rgba(255, 204, 0, 0.03);
    }
    .network.mtn.selected {
      border-color: var(--mtn-yellow);
      background: rgba(255, 204, 0, 0.12);
      color: var(--mtn-yellow);
    }
    .network.airtel {
      background: rgba(255, 0, 0, 0.03);
    }
    .network.airtel.selected {
      border-color: var(--airtel-red);
      background: rgba(255, 0, 0, 0.12);
      color: var(--airtel-red);
    }
    .network-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .network.mtn.selected .network-dot {
      background: var(--mtn-yellow);
    }
    .network.airtel.selected .network-dot {
      background: var(--airtel-red);
    }
    .input-group {
      margin-bottom: 16px;
      position: relative;
    }
    .input-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .input-container-rel {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }
    input {
      width: 100%;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 14px 16px;
      border-radius: 12px;
      color: #fff;
      font-size: 15px;
      outline: none;
      transition: all 0.2s ease;
    }
    input:focus {
      border-color: var(--accent-color);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
      background: rgba(15, 23, 42, 0.7);
    }
    .carrier-badge {
      position: absolute;
      right: 12px;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      display: none;
      pointer-events: none;
      letter-spacing: 0.05em;
    }
    .btn {
      width: 100%;
      background: var(--accent-gradient);
      color: #fff;
      border: none;
      padding: 14px;
      font-size: 15px;
      font-weight: 700;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
    }
    .btn:hover {
      opacity: 0.95;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(16, 185, 129, 0.3);
    }
    .btn:active {
      transform: translateY(0);
    }
    .btn:disabled {
      background: rgba(255,255,255,0.08);
      color: var(--text-muted);
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .status-box {
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
      display: none;
    }
    .status-box.error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #fca5a5;
      display: block;
    }
    .status-box.success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: #a7f3d0;
      display: block;
    }
    .status-box.info {
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      color: #bfdbfe;
      display: block;
    }
    .loading-spinner {
      border: 2px solid rgba(255, 255, 255, 0.1);
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border-left-color: #fff;
      animation: spin 0.8s linear infinite;
      display: inline-block;
      vertical-align: middle;
      margin-right: 8px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .loading-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 0;
    }
    .loading-overlay p {
      color: var(--text-muted);
      font-size: 14px;
      margin-top: 12px;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    .support-footer {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .support-footer a {
      color: var(--accent-color);
      text-decoration: none;
      font-weight: 600;
    }
    .whatsapp-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #25D366;
      color: #fff !important;
      text-decoration: none;
      font-weight: 700;
      padding: 10px 18px;
      border-radius: 10px;
      margin-top: 8px;
      font-size: 13px;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(37, 211, 102, 0.2);
    }
    .whatsapp-btn:hover {
      background: #20ba5a;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(37, 211, 102, 0.3);
    }
    .whatsapp-icon {
      width: 18px;
      height: 18px;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <div class="glow-1"></div>
  <div class="glow-2"></div>
  
  <div class="card">
    <div class="logo-container" id="logo-sec">
      <div class="wifi-pulse-container">
        <svg class="wifi-pulse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
          <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3"></line>
        </svg>
      </div>
      <img id="tenant-logo" src="" style="display:none;" />
      <h1 id="tenant-name">AROFi Hotspot</h1>
      <p id="tenant-tag">Instant high-speed internet access</p>
      <div id="device-info" style="font-size: 11px; color: var(--text-muted); margin-top: 10px; opacity: 0.8; font-family: monospace;">
        IP: $(ip) &nbsp;|&nbsp; MAC: $(mac)
      </div>
    </div>
    
    <div id="catalog-loading" class="loading-overlay">
      <div class="loading-spinner" style="border-width: 3px; width: 32px; height: 32px; border-left-color: var(--accent-color);"></div>
      <p>Loading package catalog...</p>
    </div>
    
    <div id="catalog-content" style="display:none;">
      <div class="tabs">
        <div class="tab active" onclick="switchTab('momo')">Buy Package</div>
        <div class="tab" onclick="switchTab('voucher')">Redeem Voucher</div>
      </div>
      
      <div id="tab-momo" class="tab-content active">
        <div class="packages-list" id="packages-list-container"></div>
        
        <div class="networks" style="display:none;">
          <div class="network mtn selected" onclick="selectNetwork('MTN')">
            <span class="network-dot"></span>
            MTN MoMo
          </div>
          <div class="network airtel" onclick="selectNetwork('AIRTEL')">
            <span class="network-dot"></span>
            Airtel Money
          </div>
        </div>
        
        <div class="input-group">
          <label>Phone Number (MTN/Airtel)</label>
          <div class="input-container-rel">
            <input type="tel" id="momo-phone" placeholder="e.g. 0771234567" required style="padding-right: 110px;">
            <span id="carrier-badge" class="carrier-badge"></span>
          </div>
        </div>
        
        <button class="btn" id="btn-pay" onclick="initiatePayment()">Pay and Connect</button>
      </div>
      
      <div id="tab-voucher" class="tab-content">
        <div class="input-group">
          <label>Voucher Code</label>
          <input type="text" id="voucher-code" placeholder="Enter voucher code" required>
        </div>
        
        <button class="btn" id="btn-voucher" onclick="redeemVoucher()">Connect to Internet</button>
      </div>
      
      <div class="status-box" id="status-message"></div>
    </div>
  </div>
  
  <div class="support-footer" id="support-footer-sec" style="display:none;">
    <div style="margin-bottom: 8px;">Need help? Contact support: <span id="support-phone"></span></div>
    <a id="whatsapp-btn" href="#" target="_blank" class="whatsapp-btn" style="display:none;">
      <svg class="whatsapp-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.706 1.458h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      Chat on WhatsApp
    </a>
    <div style="margin-top: 12px; font-size: 11px; opacity: 0.8;">
      Powered by <a href="https://arosoftlabs.com" target="_blank" style="color: var(--accent-color); text-decoration: none; font-weight: 600;">arosoftlabs.com</a>
    </div>
  </div>

  <form id="login-form" method="POST" action="$(link-login-only)" style="display:none;">
    <input type="hidden" id="login-username" name="username">
    <input type="hidden" id="login-password" name="password">
    <input type="hidden" name="dst" value="$(link-orig)">
    <input type="hidden" name="popup" value="false">
  </form>

  <script>
    const apiBaseUrl = "${apiBaseUrl}";
    const routerKey = "${escapedKey}";
    const mac = "$(mac)" || "";
    const ip = "$(ip)" || "";
    const linkLoginOnly = "$(link-login-only)" || "";
    const serverName = "$(server-name)" || "";
    
    let packagesList = [];
    let selectedPackageId = null;
    let selectedNetwork = 'MTN';
    
    window.onload = function() {
      const urlParams = new URLSearchParams(window.location.search);
      const u = urlParams.get("username");
      const p = urlParams.get("password");
      if (u && p) {
        document.getElementById("login-username").value = u;
        document.getElementById("login-password").value = p;
        document.getElementById("login-form").submit();
      } else {
        loadPortalCatalog();
      }

      // Carrier auto-detection logic
      const phoneInput = document.getElementById("momo-phone");
      if (phoneInput) {
        phoneInput.addEventListener("input", function(e) {
          const val = e.target.value.trim();
          let clean = val.replace(/\D/g, "");
          let check = "";
          if (clean.startsWith("256")) {
            check = "0" + clean.slice(3, 5);
          } else if (clean.startsWith("0")) {
            check = "0" + clean.slice(1, 3);
          } else if (clean.length === 9) {
            check = "0" + clean.slice(0, 2);
          } else {
            check = "0" + clean.slice(0, 2);
          }
          
          const mtnPrefixes = ["077", "078", "076", "079", "031", "039"];
          const airtelPrefixes = ["070", "075", "074"];
          const badge = document.getElementById("carrier-badge");
          
          if (mtnPrefixes.includes(check)) {
            selectedNetwork = 'MTN';
            phoneInput.style.borderColor = "var(--mtn-yellow)";
            if (badge) {
              badge.style.display = "inline-block";
              badge.style.backgroundColor = "var(--mtn-yellow)";
              badge.style.color = "#0b1f3a";
              badge.innerText = "MTN MoMo";
            }
          } else if (airtelPrefixes.includes(check)) {
            selectedNetwork = 'AIRTEL';
            phoneInput.style.borderColor = "var(--airtel-red)";
            if (badge) {
              badge.style.display = "inline-block";
              badge.style.backgroundColor = "var(--airtel-red)";
              badge.style.color = "#ffffff";
              badge.innerText = "Airtel Money";
            }
          } else {
            selectedNetwork = 'MTN'; // Fallback
            phoneInput.style.borderColor = "rgba(255, 255, 255, 0.1)";
            if (badge) {
              badge.style.display = "none";
            }
          }
        });
      }
    };
    
    async function loadPortalCatalog() {
      try {
        const url = apiBaseUrl + "/api/portal/context?mac=" + encodeURIComponent(mac) + 
                    "&ip=" + encodeURIComponent(ip) + 
                    "&routerKey=" + encodeURIComponent(routerKey) + 
                    "&server=" + encodeURIComponent(serverName) + 
                    "&loginUrl=" + encodeURIComponent(linkLoginOnly);
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("HTTP error " + response.status);
        }
        
        const data = await response.json();
        packagesList = data.packages || [];
        
        if (data.tenant) {
          document.getElementById("tenant-name").innerText = data.tenant.name || "AROFi Hotspot";
          if (data.tenant.logoUrl) {
            const logo = document.getElementById("tenant-logo");
            logo.src = data.tenant.logoUrl;
            logo.style.display = "inline-block";
          }
          if (data.tenant.supportPhone) {
            document.getElementById("support-phone").innerText = data.tenant.supportPhone;
            document.getElementById("support-footer-sec").style.display = "block";
            
            // Format WhatsApp Support Link
            let waPhone = data.tenant.supportPhone.replace(/\D/g, "");
            if (waPhone.startsWith("0")) {
              waPhone = "256" + waPhone.slice(1);
            } else if (!waPhone.startsWith("256") && waPhone.length === 9) {
              waPhone = "256" + waPhone;
            }
            const waBtn = document.getElementById("whatsapp-btn");
            if (waBtn) {
              waBtn.href = "https://wa.me/" + waPhone;
              waBtn.style.display = "inline-flex";
            }
          }
        }
        
        const container = document.getElementById("packages-list-container");
        container.innerHTML = "";
        
        if (packagesList.length === 0) {
          container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No packages available.</div>';
        } else {
          packagesList.forEach((pkg, index) => {
            const card = document.createElement("div");
            card.className = "package-card" + (index === 0 ? " selected" : "");
            card.id = "pkg-" + pkg.id;
            card.onclick = () => selectPackage(pkg.id);
            
            let desc = pkg.description || "";
            if (!desc) {
              desc = formatDuration(pkg.durationMinutes) + (pkg.dataLimitMb ? " • " + formatMegabytes(pkg.dataLimitMb) : " • Unlimited Data");
            }
            
            card.innerHTML = \`
              <div class="pkg-info">
                <h3>\${escapeHtml(pkg.name)}</h3>
                <p>\&nbsp;\${escapeHtml(desc)}</p>
              </div>
              <div class="pkg-price">UGX \${formatPrice(pkg.amountUgx)}</div>
            \`;
            container.appendChild(card);
          });
          
          selectedPackageId = packagesList[0].id;
        }
        
        document.getElementById("catalog-loading").style.display = "none";
        document.getElementById("catalog-content").style.display = "block";
      } catch (error) {
        console.error("Failed to load catalog", error);
        document.getElementById("catalog-loading").style.display = "none";
        document.getElementById("catalog-content").style.display = "block";
        switchTab('voucher');
        const momoTabBtn = document.querySelectorAll(".tab")[0];
        if (momoTabBtn) momoTabBtn.style.display = "none";
        showStatus("Offline mode. If you have a voucher, redeem it below.", "info");
      }
    }
    
    function switchTab(tab) {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      
      if (tab === 'momo') {
        document.querySelectorAll(".tab")[0].classList.add("active");
        document.getElementById("tab-momo").classList.add("active");
      } else {
        const voucherTabBtn = document.querySelectorAll(".tab")[1] || document.querySelectorAll(".tab")[0];
        if (voucherTabBtn) voucherTabBtn.classList.add("active");
        document.getElementById("tab-voucher").classList.add("active");
      }
    }
    
    function selectPackage(pkgId) {
      selectedPackageId = pkgId;
      document.querySelectorAll(".package-card").forEach(c => c.classList.remove("selected"));
      const selected = document.getElementById("pkg-" + pkgId);
      if (selected) selected.classList.add("selected");
    }
    
    function selectNetwork(net) {
      selectedNetwork = net;
      document.querySelectorAll(".network").forEach(n => n.classList.remove("selected"));
      if (net === 'MTN') {
        document.querySelector(".network.mtn").classList.add("selected");
      } else {
        document.querySelector(".network.airtel").classList.add("selected");
      }
    }
    
    function showStatus(msg, type) {
      const box = document.getElementById("status-message");
      box.className = "status-box " + type;
      box.innerHTML = msg;
      box.style.display = "block";
    }
    
    async function initiatePayment() {
      const phoneInput = document.getElementById("momo-phone").value.trim();
      if (!selectedPackageId) {
        showStatus("Please select a package first.", "error");
        return;
      }
      if (!phoneInput) {
        showStatus("Please enter your phone number.", "error");
        return;
      }
      
      let cleanPhone = phoneInput.replace(/\\D/g, "");
      if (cleanPhone.startsWith("0")) {
        cleanPhone = "256" + cleanPhone.slice(1);
      } else if (!cleanPhone.startsWith("256")) {
        cleanPhone = "256" + cleanPhone;
      }
      
      if (!/^256\\d{9}$/.test(cleanPhone)) {
        showStatus("Enter a valid Uganda mobile number (e.g. 0771234567).", "error");
        return;
      }
      
      const payBtn = document.getElementById("btn-pay");
      payBtn.disabled = true;
      payBtn.innerHTML = '<div class="loading-spinner"></div>Sending request...';
      showStatus("Initiating payment. Please enter your Mobile Money PIN on your phone.", "info");
      
      try {
        const response = await fetch(apiBaseUrl + "/api/payments/portal/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: selectedPackageId,
            phoneNumber: cleanPhone,
            customerReference: cleanPhone,
            network: selectedNetwork,
            macAddress: mac,
            clientIp: ip,
            routerKey: routerKey,
            hotspotServerName: serverName,
            loginUrl: linkLoginOnly
          })
        });
        
        const payment = await response.json();
        if (!response.ok) {
          throw new Error(payment.message || "Payment initiation failed.");
        }
        
        if (payment.status === "FAILED") {
          throw new Error(payment.statusMessage || "The payment request could not be started.");
        }
        
        const checkoutUrl = payment.checkoutUrl || (payment.responsePayload && (payment.responsePayload.checkoutUrl || (payment.responsePayload.gateway && payment.responsePayload.gateway.checkoutUrl)));
        if (checkoutUrl) {
          showStatus("Redirecting to secure payment checkout...", "info");
          window.location.href = checkoutUrl;
          return;
        }
        
        pollPaymentStatus(payment.id, payment.statusToken);
      } catch (error) {
        showStatus(error.message || "Unable to start the payment request. Please try again.", "error");
        payBtn.disabled = false;
        payBtn.innerText = "Pay and Connect";
      }
    }
    
    function pollPaymentStatus(paymentId, token) {
      const payBtn = document.getElementById("btn-pay");
      let attempts = 0;
      const maxAttempts = 120;
      
      const interval = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(interval);
          showStatus("Payment check timed out. If you approved the payment, reconnect to internet in a moment.", "error");
          payBtn.disabled = false;
          payBtn.innerText = "Pay and Connect";
          return;
        }
        
        try {
          const url = apiBaseUrl + "/api/payments/" + paymentId + "/check-status" + (token ? "?token=" + encodeURIComponent(token) : "");
          const response = await fetch(url, { method: "POST" });
          if (!response.ok) return;
          
          const payment = await response.json();
          if (payment.activation) {
            clearInterval(interval);
            showStatus("Payment approved! Connecting you to the internet...", "success");
            connectHotspot(payment.reconnect);
          } else if (payment.status === "FAILED") {
            clearInterval(interval);
            showStatus("Payment failed: " + (payment.statusMessage || "Declined or timed out."), "error");
            payBtn.disabled = false;
            payBtn.innerText = "Pay and Connect";
          }
        } catch (error) {
          // keep polling
        }
      }, 1500);
    }
    
    async function redeemVoucher() {
      const codeInput = document.getElementById("voucher-code").value.trim();
      if (!codeInput) {
        showStatus("Please enter your voucher code.", "error");
        return;
      }
      
      const voucherBtn = document.getElementById("btn-voucher");
      voucherBtn.disabled = true;
      voucherBtn.innerHTML = '<div class="loading-spinner"></div>Redeeming...';
      showStatus("Connecting to authentication server...", "info");
      
      try {
        const response = await fetch(apiBaseUrl + "/api/portal/redeem-voucher", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: codeInput.toUpperCase().replace(/\\s+/g, ""),
            macAddress: mac,
            clientIp: ip,
            routerKey: routerKey,
            hotspotServerName: serverName,
            loginUrl: linkLoginOnly
          })
        });
        
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.message || "Voucher redemption failed.");
        }
        
        showStatus("Voucher redeemed! Connecting you to the internet...", "success");
        connectHotspot(body.reconnect);
      } catch (error) {
        showStatus(error.message || "Voucher redemption failed. Please try again.", "error");
        voucherBtn.disabled = false;
        voucherBtn.innerText = "Connect to Internet";
      }
    }
    
    function connectHotspot(reconnect) {
      if (!reconnect || !reconnect.username || !reconnect.password) {
        showStatus("Connected! Reconnecting to the internet...", "success");
        return;
      }
      
      document.getElementById("login-username").value = reconnect.username;
      document.getElementById("login-password").value = reconnect.password;
      document.getElementById("login-form").submit();
    }
    
    function formatDuration(mins) {
      if (mins >= 1440 && mins % 1440 === 0) return (mins/1440) + " Day" + (mins/1440 > 1 ? "s" : "");
      if (mins >= 60 && mins % 60 === 0) return (mins/60) + " Hour" + (mins/60 > 1 ? "s" : "");
      return mins + " Min";
    }
    
    function formatMegabytes(mb) {
      if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
      return mb + " MB";
    }
    
    function formatPrice(val) {
      return new Intl.NumberFormat('en-UG').format(val);
    }
    
    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`
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
