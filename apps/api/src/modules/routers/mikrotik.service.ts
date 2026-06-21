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
      `# foreach is safe on empty set; "interface" is the correct property in RouterOS 6 and 7`,
      `:local wanIface ""`,
      `:foreach r in=[/ip route find dst-address=0.0.0.0/0 active=yes] do={ :set wanIface [/ip route get $r interface] }`,
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
      `:local cbWanIface ""`,
      `:foreach r in=[/ip route find dst-address=0.0.0.0/0 active=yes] do={ :set cbWanIface [/ip route get $r interface] }`,
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
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AROFi Hotspot</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#f0fdf4;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px}
    .card{width:100%;max-width:420px;background:#fff;border:1px solid #d1fae5;border-radius:20px;padding:26px 22px;box-shadow:0 8px 32px rgba(16,185,129,.10)}
    .logo{text-align:center;margin-bottom:18px}
    .wifi-icon{color:#10b981;margin-bottom:8px;animation:pulse 2.2s infinite ease-in-out;display:inline-block}
    @keyframes pulse{0%,100%{opacity:.4;transform:scale(.92)}50%{opacity:1;transform:scale(1.05)}}
    .logo img{max-height:42px;margin-bottom:6px;border-radius:8px;display:none}
    .logo h1{font-size:14px;font-weight:700;letter-spacing:.08em;color:#10b981;margin-top:4px;text-transform:uppercase}
    .logo p{font-size:11px;color:#64748b;margin-top:2px}
    .dev{font-size:11px;color:#94a3b8;font-family:monospace;margin-top:6px}
    .spin-wrap{text-align:center;padding:28px 0}
    .spinner{width:30px;height:30px;border:3px solid #d1fae5;border-top-color:#10b981;border-radius:50%;animation:spin .8s linear infinite;display:inline-block}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spin-wrap p{color:#64748b;font-size:13px;margin-top:10px}
    .tabs{display:flex;background:#f1f5f9;padding:3px;border-radius:10px;margin-bottom:16px;gap:3px}
    .tab{flex:1;text-align:center;padding:9px 0;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;border-radius:8px;transition:all .18s}
    .tab.on{background:#fff;color:#0f172a;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    .pkgs{max-height:196px;overflow-y:auto;margin-bottom:16px}
    .pkg{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:11px 13px;margin-bottom:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:border-color .18s}
    .pkg.sel{border-color:#10b981;background:#f0fdf4}
    .pkg h3{font-size:14px;font-weight:700;color:#0f172a}
    .pkg p{font-size:12px;color:#64748b;margin-top:1px}
    .price{font-size:13px;font-weight:800;color:#10b981;white-space:nowrap;margin-left:10px}
    lbl{display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
    .iw{position:relative;margin-bottom:13px}
    input[type=text],input[type=tel]{width:100%;background:#f8fafc;border:1px solid #e2e8f0;padding:11px 13px;border-radius:10px;color:#0f172a;font-size:15px;outline:none;transition:border-color .18s}
    input:focus{border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.12)}
    .badge{position:absolute;right:9px;top:50%;transform:translateY(-50%);padding:3px 7px;border-radius:5px;font-size:10px;font-weight:800;display:none;pointer-events:none}
    .btn{width:100%;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:13px;font-size:15px;font-weight:700;border-radius:10px;cursor:pointer;box-shadow:0 3px 10px rgba(16,185,129,.22);transition:all .18s}
    .btn:hover{opacity:.92;transform:translateY(-1px)}
    .btn:disabled{background:#e2e8f0;color:#94a3b8;cursor:not-allowed;transform:none;box-shadow:none}
    .st{margin-top:13px;padding:10px 13px;border-radius:10px;font-size:13px;line-height:1.4;display:none}
    .st.err{background:#fff1f2;border:1px solid #fecdd3;color:#be123c;display:block}
    .st.ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;display:block}
    .st.info{background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;display:block}
    .pane{display:none}.pane.on{display:block}
    .footer{text-align:center;margin-top:18px;font-size:12px;color:#64748b;display:none}
    .wa{display:inline-flex;align-items:center;gap:6px;background:#25D366;color:#fff!important;text-decoration:none;font-weight:700;padding:8px 15px;border-radius:9px;margin-top:7px;font-size:12px;box-shadow:0 2px 8px rgba(37,211,102,.2)}
    .pwr{margin-top:9px;font-size:10px;color:#94a3b8}
    .pwr a{color:#10b981;font-weight:600;text-decoration:none}
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
      <img id="tlogo" src="" alt="logo">
      <h1 id="tname">AROFi Hotspot</h1>
      <p id="ttag">Instant high-speed internet access</p>
      <div class="dev" id="dinfo"></div>
    </div>
    <div id="loading" class="spin-wrap"><div class="spinner"></div><p>Loading packages...</p></div>
    <div id="content" style="display:none">
      <div class="tabs">
        <div class="tab on" onclick="sw('momo')">Buy Package</div>
        <div class="tab" onclick="sw('voucher')">Redeem Voucher</div>
      </div>
      <div id="pane-momo" class="pane on">
        <div class="pkgs" id="plist"></div>
        <div class="iw">
          <lbl>Mobile Money Number</lbl>
          <input type="tel" id="phone" placeholder="e.g. 0771234567" oninput="dnet(this.value)" style="padding-right:110px">
          <span id="badge" class="badge"></span>
        </div>
        <button class="btn" id="pbtn" onclick="pay()">Pay and Connect</button>
      </div>
      <div id="pane-voucher" class="pane">
        <div class="iw">
          <lbl>Voucher Code</lbl>
          <input type="text" id="vcode" placeholder="Enter voucher code">
        </div>
        <button class="btn" id="vbtn" onclick="rdm()">Connect to Internet</button>
      </div>
      <div class="st" id="st"></div>
    </div>
  </div>
  <div class="footer" id="footer">
    <div>Need help? Contact support: <span id="sph"></span></div>
    <a id="wa" href="#" target="_blank" class="wa" style="display:none">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.706 1.458h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Chat on WhatsApp
    </a>
    <div class="pwr">Powered by <a href="https://arosoftlabs.com" target="_blank">arosoftlabs.com</a></div>
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
    var pkgs=[],selId=null,selNet='MTN';
    window.onload=function(){
      var sp=new URLSearchParams(window.location.search);
      var u=sp.get('username'),p=sp.get('password');
      if(u&&p){document.getElementById('lu').value=u;document.getElementById('lp').value=p;document.getElementById('lf').submit();return;}
      if(ip||mac)document.getElementById('dinfo').textContent=(ip?'IP: '+ip:'')+(ip&&mac?'  |  ':'')+(mac?'MAC: '+mac.toUpperCase():'');
      load();
    };
    async function load(){
      try{
        var r=await fetch(API+'/api/portal/context?mac='+encodeURIComponent(mac)+'&ip='+encodeURIComponent(ip)+'&routerKey='+encodeURIComponent(RKEY)+'&server='+encodeURIComponent(srv)+'&loginUrl='+encodeURIComponent(lo));
        if(!r.ok)throw new Error('HTTP '+r.status);
        var d=await r.json();
        pkgs=d.packages||[];
        if(d.tenant){
          document.getElementById('tname').textContent=d.tenant.name||'AROFi Hotspot';
          if(d.tenant.logoUrl){var img=document.getElementById('tlogo');img.src=d.tenant.logoUrl;img.style.display='inline-block';}
          if(d.tenant.supportPhone){
            document.getElementById('sph').textContent=d.tenant.supportPhone;
            document.getElementById('footer').style.display='block';
            var ph=d.tenant.supportPhone.replace(/\\D/g,'');
            if(ph.startsWith('0'))ph='256'+ph.slice(1);else if(!ph.startsWith('256')&&ph.length===9)ph='256'+ph;
            var wa=document.getElementById('wa');wa.href='https://wa.me/'+ph;wa.style.display='inline-flex';
          }
        }
        var el=document.getElementById('plist');el.innerHTML='';
        if(!pkgs.length){el.innerHTML='<p style="text-align:center;padding:14px;color:#94a3b8">No packages available.</p>';}
        else{pkgs.forEach(function(p,i){
          var d2=p.description||(fdur(p.durationMinutes)+(p.dataLimitMb?' · '+fmb(p.dataLimitMb):' · Unlimited data'));
          var c=document.createElement('div');c.className='pkg'+(i===0?' sel':'');c.id='p-'+p.id;
          c.onclick=function(){selP(p.id);};
          c.innerHTML='<div><h3>'+esc(p.name)+'</h3><p>'+esc(d2)+'</p></div><div class="price">UGX '+fn(p.amountUgx)+'</div>';
          el.appendChild(c);
        });selId=pkgs[0].id;}
        document.getElementById('loading').style.display='none';document.getElementById('content').style.display='block';
      }catch(e){
        document.getElementById('loading').style.display='none';document.getElementById('content').style.display='block';
        sw('voucher');document.querySelectorAll('.tab')[0].style.display='none';
        sst('Offline mode — enter your voucher code to connect.','info');
      }
    }
    function sw(t){
      document.querySelectorAll('.tab').forEach(function(x,i){x.classList.toggle('on',(t==='momo'&&i===0)||(t==='voucher'&&i===1));});
      document.querySelectorAll('.pane').forEach(function(x){x.classList.remove('on');});
      document.getElementById('pane-'+t).classList.add('on');
    }
    function selP(id){selId=id;document.querySelectorAll('.pkg').forEach(function(c){c.classList.toggle('sel',c.id==='p-'+id);});}
    function dnet(v){
      var c=v.replace(/\\D/g,''),p2=c.startsWith('256')?c.slice(3,5):c.startsWith('0')?c.slice(1,3):c.slice(0,2);
      var b=document.getElementById('badge'),mtn=['77','78','76','79','31','39'].includes(p2),airt=['70','75','74'].includes(p2);
      selNet=airt?'AIRTEL':'MTN';
      if(mtn||airt){b.style.display='inline-block';b.style.background=mtn?'#ffcc00':'#e60012';b.style.color=mtn?'#0b1f3a':'#fff';b.textContent=mtn?'MTN MoMo':'Airtel Money';}
      else b.style.display='none';
    }
    async function pay(){
      if(!selId){sst('Select a package first.','err');return;}
      var ph=document.getElementById('phone').value.trim();
      if(!ph){sst('Enter your Mobile Money number.','err');return;}
      var c=ph.replace(/\\D/g,'');
      if(c.startsWith('0'))c='256'+c.slice(1);else if(!c.startsWith('256'))c='256'+c;
      if(!/^256\\d{9}$/.test(c)){sst('Enter a valid Uganda number (e.g. 0771234567).','err');return;}
      setbtn('pbtn',true,'Sending request...');sst('Initiating payment. Enter your Mobile Money PIN when prompted.','info');
      try{
        var r=await fetch(API+'/api/payments/portal/initiate',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({packageId:selId,phoneNumber:c,customerReference:c,network:selNet,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo})});
        var pmt=await r.json();
        if(!r.ok)throw new Error(pmt.message||'Payment initiation failed.');
        if(pmt.status==='FAILED')throw new Error(pmt.statusMessage||'Payment failed.');
        var cu=pmt.checkoutUrl||(pmt.responsePayload&&(pmt.responsePayload.checkoutUrl||(pmt.responsePayload.gateway&&pmt.responsePayload.gateway.checkoutUrl)));
        if(cu){window.location.href=cu;return;}
        poll(pmt.id,pmt.statusToken);
      }catch(e){sst(e.message||'Unable to start payment. Try again.','err');setbtn('pbtn',false,'Pay and Connect');}
    }
    function poll(id,tok){
      var n=0,iv=setInterval(async function(){
        if(++n>120){clearInterval(iv);sst('Timed out. If payment was approved, reconnect to WiFi.','err');setbtn('pbtn',false,'Pay and Connect');return;}
        try{
          var r=await fetch(API+'/api/payments/'+id+'/check-status'+(tok?'?token='+encodeURIComponent(tok):''),{method:'POST'});
          if(!r.ok)return;
          var p=await r.json();
          if(p.activation){clearInterval(iv);sst('Payment approved! Connecting...','ok');conn(p.reconnect);}
          else if(p.status==='FAILED'){clearInterval(iv);sst('Payment failed: '+(p.statusMessage||'Declined.'),'err');setbtn('pbtn',false,'Pay and Connect');}
        }catch(e){}
      },1500);
    }
    async function rdm(){
      var code=document.getElementById('vcode').value.trim().toUpperCase().replace(/\\s+/g,'');
      if(!code){sst('Enter your voucher code.','err');return;}
      setbtn('vbtn',true,'Redeeming...');sst('Connecting to authentication server...','info');
      try{
        var r=await fetch(API+'/api/portal/redeem-voucher',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({code,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo})});
        var b=await r.json();
        if(!r.ok)throw new Error(b.message||'Voucher redemption failed.');
        sst('Voucher redeemed! Connecting you to the internet...','ok');conn(b.reconnect);
      }catch(e){sst(e.message||'Voucher redemption failed. Please try again.','err');setbtn('vbtn',false,'Connect to Internet');}
    }
    function conn(rc){if(!rc||!rc.username||!rc.password)return;document.getElementById('lu').value=rc.username;document.getElementById('lp').value=rc.password;document.getElementById('lf').submit();}
    function setbtn(id,dis,txt){var b=document.getElementById(id);b.disabled=dis;b.innerHTML=dis?'<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px"></span>'+txt:txt;}
    function sst(m,t){var s=document.getElementById('st');s.className='st '+t;s.textContent=m;}
    function fdur(m){if(m>=1440&&m%1440===0)return m/1440+' Day'+(m/1440>1?'s':'');if(m>=60&&m%60===0)return m/60+' Hour'+(m/60>1?'s':'');return m+' Min';}
    function fmb(m){return m>=1024?(m/1024).toFixed(1)+' GB':m+' MB';}
    function fn(v){return new Intl.NumberFormat('en-UG').format(v);}
    function esc(s){return!s?'':s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
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
