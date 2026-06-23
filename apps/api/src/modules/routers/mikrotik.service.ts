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
  dnsName?: string | null
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
      `/ip hotspot profile set [find name="${profileName}"] use-radius=yes radius-accounting=yes radius-interim-update=1m html-directory=hotspot login-by=http-pap split-user-domain=no radius-location-id="${this.escape(registrationKey)}" radius-location-name="${this.escape(registrationKey)}"${input.dnsName ? ` dns-name="${this.escape(input.dnsName)}"` : ''}`,
      `/ip hotspot user profile set [find default=yes] shared-users=1 keepalive-timeout=30s`,
      `# Enforce shared-users=1 and keepalive-timeout=30s on all user profiles to prevent concurrent session sharing`,
      `:foreach up in=[/ip hotspot user profile find] do={ /ip hotspot user profile set $up shared-users=1 keepalive-timeout=30s }`,
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
      ...(input.dnsName ? [
        `/ip dns static remove [find name="${this.escape(input.dnsName)}"]`,
        `/ip dns static add name="${this.escape(input.dnsName)}" address=${gatewayIp} comment="AROFi hotspot DNS gateway"`,
      ] : []),
      ``,
      `# Detect WAN interface dynamically so NAT works on any router model`,
      `# Try multiple methods: default route → PPPoE → LTE → any non-hotspot interface with IP`,
      ...this.buildWanDetectionScript('wanIface'),
      `:if ($wanIface = "") do={`,
      `  :foreach ppp in=[/interface find type=pppoe] do={ :set wanIface [/interface get $ppp name] }`,
      `}`,
      `:if ($wanIface = "") do={`,
      `  :foreach lte in=[/interface lte find] do={ :set wanIface [/interface lte get $lte name] }`,
      `}`,
      `:if ($wanIface = "") do={`,
      `  :foreach addr in=[/ip address find] do={`,
      `    :local addrIf [/ip address get $addr interface]`,
      `    :if ($addrIf != "arofi-hotspot" && $addrIf != "") do={ :set wanIface $addrIf }`,
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

  private buildProvisioningCallbackScript(callbackUrl: string, fallbackCallbackUrl: string) {
    return [
      `:delay 3s`,
      `:local nasIp ""`,
      ...this.buildWanDetectionScript('cbWanIface'),
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
    .card{width:100%;max-width:420px;background:#fff;border:1px solid #bfdbfe;border-radius:12px;padding:24px 20px;box-shadow:0 8px 32px rgba(37,99,235,.10);position:relative}
    .logo{text-align:center;margin-bottom:16px}
    .wifi-icon{color:#22c55e;margin-bottom:8px;animation:pulse 2.2s infinite ease-in-out;display:inline-block}
    @keyframes pulse{0%,100%{opacity:.6;transform:scale(.95)}50%{opacity:1;transform:scale(1.05)}}
    .logo h1{font-size:22px;font-weight:800;letter-spacing:.02em;color:#22c55e;margin-top:0;text-transform:uppercase}
    
    .login-row{display:flex;gap:10px;margin-bottom:16px}
    .login-row input{flex:1;background:#f8fafc;border:1px solid #cbd5e1;padding:12px 14px;border-radius:8px;color:#0f172a;font-size:14px;outline:none;transition:all .2s}
    .login-row input:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15)}
    .login-row button{background:#22c55e;color:#fff;border:none;padding:0 20px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;transition:all .2s}
    .login-row button:hover{background:#16a34a}
    .login-row button:disabled{background:#94a3b8;cursor:not-allowed}

    .find-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;background:#eff6ff;color:#2563EB;border:none;padding:10px;font-size:13px;font-weight:600;border-radius:8px;cursor:pointer;transition:all .2s;margin-bottom:16px}
    .find-btn:hover{background:#dbeafe}

    .pkg-title{text-align:center;font-size:13px;color:#64748b;margin-bottom:12px}

    .pkgs{max-height:280px;overflow-y:auto;margin-bottom:16px}
    .pkg{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;transition:all .2s}
    .pkg:hover{border-color:#cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,.04)}
    .pkg-info h3{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:2px}
    .pkg-info p{font-size:12px;color:#64748b}
    .pkg-action{display:flex;align-items:center;gap:12px}
    .price{font-size:14px;font-weight:800;color:#22c55e;white-space:nowrap}
    .buy-btn{background:#22c55e;color:#fff;border:none;padding:8px 16px;font-size:13px;font-weight:700;border-radius:6px;cursor:pointer;transition:all .2s}
    .buy-btn:hover{background:#16a34a}

    .accept{text-align:center;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:16px}
    .accept p{font-size:12px;color:#0f172a;font-weight:600;margin-bottom:8px}
    .accept-logos{display:flex;justify-content:center;gap:12px;align-items:center}
    .accept-logos span{font-size:12px;font-weight:700;color:#e60012;background:#fff;border:1px solid #fecaca;padding:2px 6px;border-radius:4px}
    .accept-logos span.momo{color:#0b1f3a;background:#fef08a;border-color:#fde047}

    .footer{text-align:center;margin-top:16px;font-size:12px;color:#64748b}
    .footer a{color:#10b981;text-decoration:none}
    .tech{font-size:10px;color:#94a3b8;margin-top:16px}
    .tech span{display:inline-block;margin:0 4px}

    /* Modals */
    .modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,.6);display:none;align-items:center;justify-content:center;z-index:50;padding:16px}
    .modal-overlay.on{display:flex}
    .modal{background:#fff;width:100%;max-width:360px;border-radius:12px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.2)}
    .modal-hdr{display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid #f1f5f9}
    .modal-hdr h2{font-size:16px;font-weight:700}
    .modal-hdr button{background:none;border:none;font-size:20px;color:#94a3b8;cursor:pointer}
    .modal-body{padding:16px}
    .modal-body p{font-size:13px;color:#64748b;margin-bottom:12px}
    .modal-body input{width:100%;background:#fff;border:1px solid #cbd5e1;padding:12px 14px;border-radius:8px;color:#0f172a;font-size:14px;outline:none;margin-bottom:12px}
    .modal-body input:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15)}
    .mbtn{width:100%;background:#22c55e;color:#fff;border:none;padding:12px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;display:flex;justify-content:center;align-items:center;gap:6px}
    .mbtn:hover{background:#16a34a}
    .mbtn:disabled{background:#94a3b8;cursor:not-allowed}

    .st{margin-top:12px;padding:10px;border-radius:8px;font-size:13px;display:none}
    .st.err{background:#fef2f2;border:1px solid #fecaca;color:#ef4444;display:block}
    .st.ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#22c55e;display:block}
    .st.info{background:#eff6ff;border:1px solid #bfdbfe;color:#3b82f6;display:block}
    
    #loading{text-align:center;padding:30px 0}
    .spinner{width:30px;height:30px;border:3px solid #e2e8f0;border-top-color:#22c55e;border-radius:50%;animation:spin .8s linear infinite;display:inline-block}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="wifi-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3"/>
        </svg>
      </div>
      <h1 id="tname">Loading...</h1>
    </div>

    <div id="loading"><div class="spinner"></div><p style="margin-top:10px;color:#64748b;font-size:13px">Preparing hotspot...</p></div>

    <div id="content" style="display:none">
      <div class="login-row">
        <input type="text" id="vcode" placeholder="Enter your voucher code">
        <button id="lbtn" onclick="login()">Login</button>
      </div>

      <button class="find-btn" onclick="openModal('recModal')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        Already bought? Find My Voucher
      </button>

      <div class="pkg-title">Select a package and pay with Mobile Money</div>
      <div class="pkgs" id="plist"></div>

      <div class="accept">
        <p>We accept:</p>
        <div class="accept-logos">
          <span>airtel money</span>
          <span class="momo">MoMo MTN</span>
        </div>
      </div>
    </div>
  </div>

  <div class="footer" id="footer" style="display:none">
    Need help? Contact support:<br>
    <span id="sph" style="font-weight:700;color:#22c55e"></span>
  </div>

  <div class="tech">
    <span id="tip">IP: </span> | <span id="tmac">MAC: </span>
    <br><br>
    Powered By <span style="color:#22c55e;font-weight:600">XenFi</span><br>
    Terms and Conditions Apply
  </div>

  <!-- Buy Modal -->
  <div class="modal-overlay" id="buyModal">
    <div class="modal">
      <div class="modal-hdr">
        <h2>Pay with Mobile Money</h2>
        <button onclick="closeModal('buyModal')">&times;</button>
      </div>
      <div class="modal-body">
        <p id="bdesc">Enter your number to buy this package.</p>
        <input type="tel" id="bphone" placeholder="e.g. 0771234567">
        <button class="mbtn" id="bbtn" onclick="pay()">Pay Now</button>
        <div id="bst" class="st"></div>
      </div>
    </div>
  </div>

  <!-- Recover Modal -->
  <div class="modal-overlay" id="recModal">
    <div class="modal">
      <div class="modal-hdr">
        <h2>Find My Voucher</h2>
        <button onclick="closeModal('recModal')">&times;</button>
      </div>
      <div class="modal-body">
        <p>Enter your transaction ID or mobile number to recover your connection.</p>
        <input type="text" id="rtxn" placeholder="Enter transaction ID or number">
        <button class="mbtn" id="rbtn" onclick="rec()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          Search Voucher
        </button>
        <div id="rst" class="st"></div>
      </div>
    </div>
  </div>

  <form id="lf" method="POST" action="$(link-login-only)" style="display:none">
    <input type="hidden" id="lu" name="username">
    <input type="hidden" id="lp" name="password">
    <input type="hidden" name="dst" value="$(link-orig)">
    <input type="hidden" name="popup" value="false">
  </form>

  <script>
    var API="${apiBaseUrl}",RKEY="${escapedKey}";
    var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"";
    var pkgs=[],selId=null;
    
    window.onload=function(){
      var search=window.location.search;
      var v='';
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

    function load(){
      fetch(API+'/api/portal/context?mac='+encodeURIComponent(mac)+'&ip='+encodeURIComponent(ip)+'&routerKey='+encodeURIComponent(RKEY)+'&server='+encodeURIComponent(srv)+'&loginUrl='+encodeURIComponent(lo))
      .then(function(r){
        if(!r.ok)throw new Error('HTTP '+r.status);
        return r.json();
      })
      .then(function(d){
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
        if(pkgs.length){
          pkgs.forEach(function(p){
            var d2=p.description||(fdur(p.durationMinutes)+(p.dataLimitMb?' · '+fmb(p.dataLimitMb):' · Unlimited data'));
            var c=document.createElement('div');c.className='pkg';
            c.innerHTML='<div class="pkg-info"><h3>'+esc(p.name)+'</h3><p>'+esc(d2)+'</p></div><div class="pkg-action"><div class="price">UGX '+fn(p.amountUgx)+'</div><button class="buy-btn" onclick="openBuy(\\\\''+p.id+'\\\\')">BUY</button></div>';
            el.appendChild(c);
          });
        }
        document.getElementById('loading').style.display='none';
        document.getElementById('content').style.display='block';
      })
      .catch(function(e){
        document.getElementById('tname').textContent='AROFi Hotspot';
        document.getElementById('loading').style.display='none';
        document.getElementById('content').style.display='block';
      });
    }

    function openModal(id){document.getElementById(id).classList.add('on');}
    function closeModal(id){
      document.getElementById(id).classList.remove('on');
      sst('bst','','');sst('rst','','');
    }

    function openBuy(id){
      selId=id;
      var p=pkgs.filter(function(x){return x.id===id;})[0];
      if(p)document.getElementById('bdesc').textContent='Buy '+p.name+' for UGX '+fn(p.amountUgx)+'.';
      openModal('buyModal');
    }

    function login(){
      var code=document.getElementById('vcode').value.trim().toUpperCase().replace(/\\\\s+/g,'');
      if(!code){alert('Enter your voucher code.');return;}
      var b=document.getElementById('lbtn');
      b.disabled=true;b.textContent='...';
      
      fetch(API+'/api/portal/redeem-voucher',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code:code,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo})
      })
      .then(function(r){
        return r.json().then(function(res){
          if(!r.ok)throw new Error(res.message||'Failed');
          return res;
        });
      })
      .then(function(res){
        conn(res.reconnect);
      })
      .catch(function(e){
        alert(e.message);b.disabled=false;b.textContent='Login';
      });
    }

    function pay(){
      var ph=document.getElementById('bphone').value.trim();
      var c=ph.replace(/\\\\D/g,'');
      if(c.indexOf('0')===0)c='256'+c.substring(1);else if(c.indexOf('256')!==0)c='256'+c;
      if(!/^256\\\\d{9}$/.test(c)){sst('bst','Enter a valid number.','err');return;}
      
      sst('bst','Initiating payment...','info');
      var b=document.getElementById('bbtn');b.disabled=true;
      
      var pfx=c.substring(3,5);
      var net=(pfx==='70'||pfx==='75'||pfx==='74')?'AIRTEL':'MTN';
      
      fetch(API+'/api/payments/portal/initiate',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({packageId:selId,phoneNumber:c,customerReference:c,network:net,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo})
      })
      .then(function(r){
        return r.json().then(function(pmt){
          if(!r.ok)throw new Error(pmt.message||'Failed');
          if(pmt.status==='FAILED')throw new Error(pmt.statusMessage||'Failed');
          return pmt;
        });
      })
      .then(function(pmt){
        var cu=pmt.checkoutUrl||(pmt.responsePayload&&(pmt.responsePayload.checkoutUrl||(pmt.responsePayload.gateway&&pmt.responsePayload.gateway.checkoutUrl)));
        if(cu){window.location.href=cu;return;}
        sst('bst','Enter your Mobile Money PIN. Waiting for approval...','info');
        poll(pmt.id,pmt.statusToken);
      })
      .catch(function(e){
        sst('bst',e.message,'err');b.disabled=false;
      });
    }

    function poll(id,tok){
      var n=0,iv=setInterval(function(){
        if(++n>120){clearInterval(iv);sst('bst','Timed out.','err');document.getElementById('bbtn').disabled=false;return;}
        fetch(API+'/api/payments/'+id+'/check-status'+(tok?'?token='+encodeURIComponent(tok):''),{method:'POST'})
        .then(function(r){if(!r.ok)throw new Error(); return r.json();})
        .then(function(p){
          if(p.activation){clearInterval(iv);sst('bst','Approved! Connecting...','ok');conn(p.reconnect);}
          else if(p.status==='FAILED'){clearInterval(iv);sst('bst',p.statusMessage||'Declined.','err');document.getElementById('bbtn').disabled=false;}
        })
        .catch(function(){});
      },1500);
    }

    function rec(){
      var txn=document.getElementById('rtxn').value.trim();
      if(!txn){sst('rst','Enter your transaction ID.','err');return;}
      var b=document.getElementById('rbtn');b.disabled=true;
      sst('rst','Searching...','info');
      fetch(API+'/api/portal/recover-voucher',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({transactionId:txn,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo})
      })
      .then(function(r){
        return r.json().then(function(res){
          if(!r.ok)throw new Error(res.message||'Not found');
          return res;
        });
      })
      .then(function(res){
        sst('rst','Found! Connecting...','ok');
        conn(res.reconnect);
      })
      .catch(function(e){
        sst('rst',e.message,'err');b.disabled=false;
      });
    }

    function conn(rc){if(!rc||!rc.username)return;var dst=document.querySelector('#lf input[name=dst]').value||'http://google.com';window.location.href=lo+'?username='+encodeURIComponent(rc.username)+'&password='+encodeURIComponent(rc.password||rc.username)+'&dst='+encodeURIComponent(dst);}
    function sst(id,m,t){var s=document.getElementById(id);if(m){s.className='st '+t;s.textContent=m;}else{s.style.display='none';}}
    function fdur(m){if(m>=1440&&m%1440===0)return m/1440+' Day'+(m/1440>1?'s':'');if(m>=60&&m%60===0)return m/60+' Hour'+(m/60>1?'s':'');return m+' Min';}
    function fmb(m){return m>=1024?(m/1024).toFixed(1)+' GB':m+' MB';}
    function fn(v){var n=v.toString(),r='';for(var i=n.length-1,c=0;i>=0;i--,c++){if(c>0&&c%3===0)r=','+r;r=n[i]+r;}return r;}
    function esc(s){return!s?'':s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
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

  private buildWanDetectionScript(varName: string) {
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
      `  :if ($arofiTmpIface != "") do={ :set ${varName} $arofiTmpIface }`,
      `}`,
    ]
  }
}
