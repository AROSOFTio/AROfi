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
    // SAFE_EXISTING_ROUTER = the operator already has a working HotSpot; we only
    // wire it to AROFi RADIUS/portal. Any other mode builds a fresh customer
    // HotSpot, but ADDITIVELY on an isolated bridge so it never disturbs the
    // operator's WAN, management IP, or admin login.
    const radiusOnly = input.mode === 'SAFE_EXISTING_ROUTER'

    const callbackUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const fallbackCallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const loginHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const fallbackLoginHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const heartbeatUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/heartbeat/${this.escape(registrationKey)}`
    const fallbackHeartbeatUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/heartbeat/${this.escape(registrationKey)}`
    const selfTestUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/self-test/${this.escape(registrationKey)}`
    const fallbackSelfTestUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/self-test/${this.escape(registrationKey)}`
    const callbackScript = this.buildProvisioningCallbackScript({
      callbackUrl,
      fallbackCallbackUrl,
      selfTestUrl,
      fallbackSelfTestUrl,
      hotspotName,
      profileName,
      registrationKey,
      radiusHost: input.radiusHost,
      radiusOnly,
    })
    const heartbeatScript = this.buildHeartbeatScheduler(heartbeatUrl, fallbackHeartbeatUrl)
    const loginHtmlInstallScript = this.buildLoginHtmlInstallScript(loginHtmlUrl, fallbackLoginHtmlUrl, profileName)

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
      `:global arofiProvisionErrors ""`,
      `:global arofiProvisionNotes ""`,
      `:global arofiCheckSummary ""`,
      `:global arofiSelfTestStatus "pending"`,
      `:global arofiRollbackNeeded false`,
      `:global arofiCreatedHotspot false`,
      `:global arofiCreatedBridge false`,
      `:global arofiWirelessInterfaces 0`,
      `:global arofiWirelessAttached 0`,
      `:global arofiEthernetAttached 0`,
      `:global arofiBridgePorts 0`,
      `:put "AROFi: provisioning started."`,
      ``,
      `# 1. Make sure management stays reachable (no credential changes)`,
      `:do { /ip service set ${apiService} port=${input.apiPort} disabled=no } on-error={}`,
      `:do { /ip service set winbox port=8291 disabled=no } on-error={}`,
      `:do { /tool mac-server set allowed-interface-list=all } on-error={}`,
      `:do { /tool mac-server mac-winbox set allowed-interface-list=all } on-error={}`,
      ``,
      `# 2. AROFi RADIUS server for HotSpot auth + accounting`,
      `:do { /radius remove [/radius find comment="AROFi ${this.escape(registrationKey)}"] } on-error={}`,
      `:do {`,
      `  /radius add service=hotspot address=${input.radiusHost} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=5s comment="AROFi ${this.escape(registrationKey)}"`,
      `} on-error={ :put "Error: failed to add RADIUS server" }`,
      `:do { /radius incoming set accept=yes } on-error={}`,
    ]

    const hotspotProfile = [
      ``,
      `# 3. HotSpot profile bound to AROFi RADIUS`,
      `:do {`,
      `  :if ([:len [/ip hotspot profile find name="${profileName}"]] = 0) do={ /ip hotspot profile add name="${profileName}" }`,
      `  /ip hotspot profile set [/ip hotspot profile find name="${profileName}"] use-radius=yes radius-accounting=yes radius-interim-update=5m html-directory=hotspot login-by=http-pap split-user-domain=no radius-location-id="${this.escape(registrationKey)}" radius-location-name="${this.escape(registrationKey)}"`,
      `} on-error={ :put "Error: failed to configure HotSpot profile" }`,
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
      `/ip firewall mangle remove [/ip firewall mangle find comment="AROFi anti-tether"]`,
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
        `:do {`,
        `  :foreach h in=[/ip hotspot find] do={ /ip hotspot set $h profile="${profileName}" }`,
        `} on-error={ :put "WARNING: failed to bind existing Hotspot servers to AROFi profile" }`,
        `:if ([:len [/ip hotspot find]] = 0) do={ :put "Warning: no existing HotSpot server found. Re-run in Add Customer HotSpot mode to create one." }`,
        ...walledGarden,
        ...antiTether,
        ...telemetry,
        `:if ($arofiSelfTestStatus = "ok") do={ :put "AROFi RADIUS + portal wired to your existing HotSpot." } else={ :put "AROFi existing HotSpot provisioning failed local self-test." }`,
      ].join('\n')
    }

    return [
      ...header,
      ...hotspotProfile,
      ``,
      `# 3b. Dedicated, isolated HotSpot bridge — keeps your WAN + management intact`,
      `:do {`,
      `  :if ([:len [/interface bridge find name="arofi-hotspot"]] = 0) do={ /interface bridge add name=arofi-hotspot comment="AROFi customer hotspot"; :global arofiCreatedBridge; :set arofiCreatedBridge true }`,
      `} on-error={ :put "Error: failed to create bridge arofi-hotspot" }`,
      `:do { /ip address remove [/ip address find address="${gatewayIp}/24"] } on-error={}`,
      `:do {`,
      `  :local bridgeId [/interface find name="arofi-hotspot"]`,
      `  :if ([:len $bridgeId] > 0) do={`,
      `    /ip address add address=${gatewayIp}/24 interface=$bridgeId comment="AROFi hotspot gateway"`,
      `  } else={`,
      `    /ip address add address=${gatewayIp}/24 interface=arofi-hotspot comment="AROFi hotspot gateway"`,
      `  }`,
      `} on-error={ :put "Error: failed to assign IP to bridge arofi-hotspot" }`,
      ``,
      `# 3c. Put Wi-Fi (RouterOS v6 wireless and v7 wifi) on the hotspot bridge`,
      ...this.buildHotspotWirelessScript(ssid),
      ``,
      `# 3d. DHCP, DNS and NAT for hotspot clients (additive; your existing NAT is untouched)`,
      `:do { /ip pool remove [/ip pool find name=arofi-pool] } on-error={}`,
      `:do { /ip pool add name=arofi-pool ranges=${poolRange} } on-error={ :put "Error: failed to add IP pool" }`,
      `:do { /ip dhcp-server network remove [/ip dhcp-server network find address="${subnet}"] } on-error={}`,
      `:do { /ip dhcp-server network add address=${subnet} gateway=${gatewayIp} dns-server=${gatewayIp},1.1.1.1,8.8.8.8 } on-error={ :put "Error: failed to add DHCP network" }`,
      `:do { /ip dhcp-server remove [/ip dhcp-server find name=arofi-dhcp] } on-error={}`,
      `:do {`,
      `  :local bridgeId [/interface find name="arofi-hotspot"]`,
      `  :if ([:len $bridgeId] > 0) do={`,
      `    /ip dhcp-server add name=arofi-dhcp interface=$bridgeId address-pool=arofi-pool lease-time=1h disabled=no`,
      `  } else={`,
      `    /ip dhcp-server add name=arofi-dhcp interface=arofi-hotspot address-pool=arofi-pool lease-time=1h disabled=no`,
      `  }`,
      `} on-error={ :put "Error: failed to add DHCP server" }`,
      `:do { /ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8 } on-error={}`,
      ``,
      `# Detect WAN interface dynamically so NAT works on any router model`,
      `# Works on RouterOS 6 (parses gateway-status) and RouterOS 7 (direct interface route property),`,
      `# with fallback checks for active DHCP, PPPoE, or LTE clients.`,
      `:local wanIface ""`,
      `:do {`,
      `  :foreach r in=[/ip route find dst-address=0.0.0.0/0 active=yes] do={`,
      `    :local gwStatus ""`,
      `    :do { :set gwStatus [:tostr [/ip route get $r gateway-status]] } on-error={}`,
      `    :if ($gwStatus != "") do={`,
      `      :local viaIndex [:find $gwStatus "via "]`,
      `      :if ($viaIndex >= 0) do={`,
      `        :local tmpIface [:pick $gwStatus ($viaIndex + 4) [:len $gwStatus]]`,
      `        :local spaceIndex [:find $tmpIface " "]`,
      `        :if ($spaceIndex >= 0) do={`,
      `          :set wanIface [:pick $tmpIface 0 $spaceIndex]`,
      `        } else={`,
      `          :set wanIface $tmpIface`,
      `        }`,
      `      }`,
      `    }`,
      `    :if ($wanIface = "") do={`,
      `      :do { :set wanIface [/ip route get $r interface] } on-error={`,
      `        :do { :set wanIface [/ip route get $r gateway-interface] } on-error={}`,
      `      }`,
      `    }`,
      `  }`,
      `} on-error={}`,
      `:if ($wanIface = "") do={`,
      `  :do {`,
      `    :local boundDhcp [/ip dhcp-client find status=bound]`,
      `    :if ([:len $boundDhcp] > 0) do={`,
      `      :set wanIface [/ip dhcp-client get [:pick $boundDhcp 0] interface]`,
      `    }`,
      `  } on-error={}`,
      `}`,
      `:if ($wanIface = "") do={`,
      `  :do {`,
      `    :local activePppoe [/interface pppoe-client find running=yes]`,
      `    :if ([:len $activePppoe] > 0) do={`,
      `      :set wanIface [/interface pppoe-client get [:pick $activePppoe 0] name]`,
      `    }`,
      `  } on-error={}`,
      `}`,
      `:if ($wanIface = "") do={`,
      `  :do {`,
      `    :local activeLte [/interface lte find running=yes]`,
      `    :if ([:len $activeLte] > 0) do={`,
      `      :set wanIface [/interface lte get [:pick $activeLte 0] name]`,
      `    }`,
      `  } on-error={}`,
      `}`,
      `:if ($wanIface != "") do={`,
      `  :local cleanIface ""`,
      `  :local hasComma false`,
      `  :for i from=0 to=([:len $wanIface] - 1) do={`,
      `    :local char [:pick $wanIface $i ($i + 1)]`,
      `    :if ($char = ",") do={ :set hasComma true }`,
      `    :if ($char != " " && $char != "," && $hasComma = false) do={`,
      `      :set cleanIface ($cleanIface . $char)`,
      `    }`,
      `  }`,
      `  :set wanIface $cleanIface`,
      `}`,
      ``,
      `# If the router has no usable wireless radio, attach a non-WAN Ethernet port`,
      `# so an external AP or wired test client can still use the HotSpot bridge.`,
      ...this.buildEthernetHotspotFallbackScript(),
      `:do {`,
      `  /ip firewall nat remove [/ip firewall nat find comment="AROFi hotspot nat"]`,
      `  :if ($wanIface != "") do={`,
      `    :local wanIfaceId [/interface find name=$wanIface]`,
      `    :if ([:len $wanIfaceId] > 0) do={`,
      `      /ip firewall nat add chain=srcnat src-address=${subnet} out-interface=$wanIfaceId action=masquerade comment="AROFi hotspot nat"`,
      `    } else={`,
      `      /ip firewall nat add chain=srcnat src-address=${subnet} out-interface=$wanIface action=masquerade comment="AROFi hotspot nat"`,
      `    }`,
      `  } else={`,
      `    :put "WARNING: WAN interface not detected. Skipping NAT masquerade. Add manually after checking /ip route print."`,
      `  }`,
      `} on-error={ :put "WARNING: Failed to add NAT masquerade rule" }`,
      ``,
      `# Firewall: allow DNS and gateway access from hotspot clients (input chain, before any drop)`,
      `:do { /ip firewall filter remove [/ip firewall filter find comment="AROFi hotspot input"] } on-error={}`,
      `:do {`,
      `  /ip firewall filter add chain=input action=accept src-address=${subnet} protocol=udp dst-port=53 comment="AROFi hotspot input"`,
      `  /ip firewall filter add chain=input action=accept src-address=${subnet} protocol=tcp dst-port=53 comment="AROFi hotspot input"`,
      `  /ip firewall filter add chain=input action=accept src-address=${subnet} dst-address=${gatewayIp} comment="AROFi hotspot input"`,
      `  :foreach r in=[/ip firewall filter find comment="AROFi hotspot input"] do={ /ip firewall filter move $r destination=0 }`,
      `} on-error={ :put "WARNING: Failed to add firewall input rules" }`,
      ``,
      `# Firewall: allow hotspot clients forward (must be before any DROP rule)`,
      `:do { /ip firewall filter remove [/ip firewall filter find comment="AROFi hotspot forward"] } on-error={}`,
      `:do {`,
      `  /ip firewall filter add chain=forward action=accept src-address=${subnet} comment="AROFi hotspot forward"`,
      `  /ip firewall filter add chain=forward action=accept dst-address=${subnet} connection-state=established,related comment="AROFi hotspot forward"`,
      `  :foreach r in=[/ip firewall filter find comment="AROFi hotspot forward"] do={ /ip firewall filter move $r destination=0 }`,
      `} on-error={ :put "WARNING: Failed to add firewall forward rules" }`,
      ``,
      `# 3e. Create the HotSpot server on the isolated bridge`,
      `:do {`,
      `  /ip hotspot profile set [/ip hotspot profile find name="${profileName}"] hotspot-address=${gatewayIp}`,
      `} on-error={ :put "Error: failed to set hotspot profile address" }`,
      `:do {`,
      `  :local bridgeId [/interface find name="arofi-hotspot"]`,
      `  :if ([:len $bridgeId] > 0) do={`,
      `    :local existingHotspot [/ip hotspot find name="${this.escape(hotspotName)}"]`,
      `    :if ([:len $existingHotspot] > 0) do={`,
      `      /ip hotspot set $existingHotspot interface=$bridgeId address-pool=arofi-pool profile="${profileName}" addresses-per-mac=${addressesPerMac} disabled=no`,
      `    } else={`,
      `      /ip hotspot add name="${this.escape(hotspotName)}" interface=$bridgeId address-pool=arofi-pool profile="${profileName}" addresses-per-mac=${addressesPerMac} disabled=no`,
      `      :global arofiCreatedHotspot`,
      `      :set arofiCreatedHotspot true`,
      `    }`,
      `  } else={`,
      `    :local existingHotspot [/ip hotspot find name="${this.escape(hotspotName)}"]`,
      `    :if ([:len $existingHotspot] > 0) do={`,
      `      /ip hotspot set $existingHotspot interface=arofi-hotspot address-pool=arofi-pool profile="${profileName}" addresses-per-mac=${addressesPerMac} disabled=no`,
      `    } else={`,
      `      /ip hotspot add name="${this.escape(hotspotName)}" interface=arofi-hotspot address-pool=arofi-pool profile="${profileName}" addresses-per-mac=${addressesPerMac} disabled=no`,
      `      :global arofiCreatedHotspot`,
      `      :set arofiCreatedHotspot true`,
      `    }`,
      `  }`,
      `} on-error={ :global arofiProvisionErrors; :global arofiRollbackNeeded; :set arofiProvisionErrors ($arofiProvisionErrors . "hotspot_create,"); :set arofiRollbackNeeded true; :put "Error: failed to create HotSpot server" }`,
      ...walledGarden,
      ...antiTether,
      ...telemetry,
      `:if ($arofiSelfTestStatus = "ok") do={ :put "AROFi customer HotSpot is live. Broadcasting SSID: ${this.escape(ssid)}" } else={ :put "AROFi customer HotSpot was not marked live because local self-test failed." }`,
    ].join('\n')
  }

  getOnboardingChecklist(routerName: string) {
    return [
      `Make sure ${routerName} already has working internet (WAN) and that you can reach WinBox. This script does NOT set up your WAN or change your admin login.`,
      'Run the one-run command (or import the .rsc) from WinBox Terminal. Your management session stays connected the whole time.',
      'Confirm the script prints "AROFi provisioning self-test passed" before the callback message. A failed self-test means AROFi did not mark onboarding successful.',
      'On a phone, look for the new OPEN Wi-Fi network (your site/SSID name) and connect. The AROFi portal should pop up automatically.',
      'If no SSID appears on a non-wireless router, connect an external AP or test client to the Ethernet port the self-test selected for the arofi-hotspot bridge.',
      'Run one real voucher/payment test so MikroTik sends Access-Request + Accounting-Start to RADIUS and the router turns live here.',
    ]
  }

  private buildWalledGarden(hosts: string[]) {
    const normalizedHosts = Array.from(new Set(hosts.filter(Boolean)))
    if (normalizedHosts.length === 0) {
      return []
    }

    return [
      `:do { /ip hotspot walled-garden remove [/ip hotspot walled-garden find comment="AROFi portal"] } on-error={}`,
      ...normalizedHosts.map(
        (host) =>
          `:do { /ip hotspot walled-garden add dst-host="${this.escape(host)}" action=allow comment="AROFi portal" } on-error={}`,
      ),
    ]
  }

  private buildHeartbeatScheduler(heartbeatUrl: string, fallbackHeartbeatUrl: string) {
    const intervalSeconds = Math.max(
      5,
      Number.parseInt(process.env.ROUTER_HEARTBEAT_SECONDS ?? '15', 10),
    )
    const source = `:do { /tool fetch url=\\"${heartbeatUrl}\\" check-certificate=no mode=https keep-result=no } on-error={ :do { /tool fetch url=\\"${fallbackHeartbeatUrl}\\" mode=http keep-result=no } on-error={} }`
    return [
      `:do { /system script remove [/system script find name="arofi-heartbeat"] } on-error={}`,
      `:do { /system script add name="arofi-heartbeat" source="${source}" } on-error={ :global arofiProvisionErrors; :set arofiProvisionErrors ($arofiProvisionErrors . "scheduler_script,"); :put "Error: failed to create AROFi heartbeat script" }`,
      `:do { /system scheduler remove [/system scheduler find name="arofi-heartbeat"] } on-error={}`,
      `:do { /system scheduler add name="arofi-heartbeat" interval=${intervalSeconds}s on-event="arofi-heartbeat" comment="AROFi heartbeat" } on-error={ :global arofiProvisionErrors; :set arofiProvisionErrors ($arofiProvisionErrors . "scheduler_create,"); :put "Error: failed to create AROFi heartbeat scheduler" }`,
    ]
  }

  private buildProvisioningCallbackScript(input: {
    callbackUrl: string
    fallbackCallbackUrl: string
    selfTestUrl: string
    fallbackSelfTestUrl: string
    hotspotName: string
    profileName: string
    registrationKey: string
    radiusHost: string
    radiusOnly: boolean
  }) {
    return [
      `:delay 3s`,
      `:local nasIp ""`,
      `:local cbWanIface ""`,
      `:do {`,
      `  :foreach r in=[/ip route find dst-address=0.0.0.0/0 active=yes] do={`,
      `    :local gwStatus ""`,
      `    :do { :set gwStatus [:tostr [/ip route get $r gateway-status]] } on-error={}`,
      `    :if ($gwStatus != "") do={`,
      `      :local viaIndex [:find $gwStatus "via "]`,
      `      :if ($viaIndex >= 0) do={`,
      `        :local tmpIface [:pick $gwStatus ($viaIndex + 4) [:len $gwStatus]]`,
      `        :local spaceIndex [:find $tmpIface " "]`,
      `        :if ($spaceIndex >= 0) do={`,
      `          :set cbWanIface [:pick $tmpIface 0 $spaceIndex]`,
      `        } else={`,
      `          :set cbWanIface $tmpIface`,
      `        }`,
      `      }`,
      `    }`,
      `    :if ($cbWanIface = "") do={`,
      `      :do { :set cbWanIface [/ip route get $r interface] } on-error={`,
      `        :do { :set cbWanIface [/ip route get $r gateway-interface] } on-error={}`,
      `      }`,
      `    }`,
      `  }`,
      `} on-error={}`,
      `:if ($cbWanIface = "") do={`,
      `  :do {`,
      `    :local boundDhcp [/ip dhcp-client find status=bound]`,
      `    :if ([:len $boundDhcp] > 0) do={`,
      `      :set cbWanIface [/ip dhcp-client get [:pick $boundDhcp 0] interface]`,
      `    }`,
      `  } on-error={}`,
      `}`,
      `:if ($cbWanIface = "") do={`,
      `  :do {`,
      `    :local activePppoe [/interface pppoe-client find running=yes]`,
      `    :if ([:len $activePppoe] > 0) do={`,
      `      :set cbWanIface [/interface pppoe-client get [:pick $activePppoe 0] name]`,
      `    }`,
      `  } on-error={}`,
      `}`,
      `:if ($cbWanIface = "") do={`,
      `  :do {`,
      `    :local activeLte [/interface lte find running=yes]`,
      `    :if ([:len $activeLte] > 0) do={`,
      `      :set cbWanIface [/interface lte get [:pick $activeLte 0] name]`,
      `    }`,
      `  } on-error={}`,
      `}`,
      `:if ($cbWanIface != "") do={`,
      `  :local cleanCbIface ""`,
      `  :local cbHasComma false`,
      `  :for i from=0 to=([:len $cbWanIface] - 1) do={`,
      `    :local char [:pick $cbWanIface $i ($i + 1)]`,
      `    :if ($char = ",") do={ :set cbHasComma true }`,
      `    :if ($char != " " && $char != "," && $cbHasComma = false) do={`,
      `      :set cleanCbIface ($cleanCbIface . $char)`,
      `    }`,
      `  }`,
      `  :set cbWanIface $cleanCbIface`,
      `}`,
      `:do {`,
      `  :if ($cbWanIface != "") do={`,
      `    :local cbWanIfaceId [/interface find name=$cbWanIface]`,
      `    :local rawAddr ""`,
      `    :do {`,
      `      :if ($cbWanIfaceId != "") do={`,
      `        :set rawAddr [/ip address get [/ip address find interface=$cbWanIfaceId] address]`,
      `      } else={`,
      `        :set rawAddr [/ip address get [/ip address find interface=$cbWanIface] address]`,
      `      }`,
      `    } on-error={}`,
      `    :if ($rawAddr != "") do={`,
      `      :set nasIp [:pick $rawAddr 0 [:find $rawAddr "/"]]`,
      `    }`,
      `  }`,
      `} on-error={}`,
      ...this.buildProvisioningSelfTestScript(input),
      `:local arofiStatus $arofiSelfTestStatus`,
      `:local arofiErrors $arofiProvisionErrors`,
      `:local arofiNotes $arofiProvisionNotes`,
      `:local arofiChecks $arofiCheckSummary`,
      `:do {`,
      `  /tool fetch url="${input.selfTestUrl}?nasIp=$nasIp&status=$arofiStatus&checks=$arofiChecks&errors=$arofiErrors&notes=$arofiNotes" check-certificate=no mode=https keep-result=no`,
      `  :put "AROFi self-test report sent."`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${input.fallbackSelfTestUrl}?nasIp=$nasIp&status=$arofiStatus&checks=$arofiChecks&errors=$arofiErrors&notes=$arofiNotes" mode=http keep-result=no`,
      `    :put "AROFi self-test report sent by HTTP fallback."`,
      `  } on-error={`,
      `    :put "Warning: AROFi self-test report failed. Check WAN internet, DNS, HTTPS, and VPS port 4012."`,
      `  }`,
      `}`,
      `:do {`,
      `  /tool fetch url="${input.callbackUrl}?nasIp=$nasIp&status=$arofiStatus&checks=$arofiChecks&errors=$arofiErrors&notes=$arofiNotes" check-certificate=no mode=https keep-result=no`,
      `  :if ($arofiStatus = "ok") do={`,
      `    :put "AROFi provisioning callback sent (NAS IP: $nasIp)."` ,
      `  } else={`,
      `    :put "AROFi provisioning failure report sent (NAS IP: $nasIp)."` ,
      `  }`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${input.fallbackCallbackUrl}?nasIp=$nasIp&status=$arofiStatus&checks=$arofiChecks&errors=$arofiErrors&notes=$arofiNotes" mode=http keep-result=no`,
      `    :if ($arofiStatus = "ok") do={`,
      `      :put "AROFi provisioning callback sent by HTTP fallback (NAS IP: $nasIp)."` ,
      `    } else={`,
      `      :put "AROFi provisioning failure report sent by HTTP fallback (NAS IP: $nasIp)."` ,
      `    }`,
      `  } on-error={`,
      `    :put "Warning: AROFi provisioning callback failed. Check WAN internet, DNS, HTTPS, and VPS port 4012."`,
      `  }`,
      `}`,
      `:if ($arofiStatus = "ok") do={`,
      `  :put "AROFi provisioning verified locally. Waiting for first customer RADIUS login."`,
      `} else={`,
      `  :put "AROFi provisioning did not pass local self-test. Errors: $arofiErrors"`,
      `}`,
    ]
  }

  private buildProvisioningSelfTestScript(input: {
    hotspotName: string
    profileName: string
    registrationKey: string
    radiusHost: string
    radiusOnly: boolean
  }) {
    const hotspotName = this.escape(input.hotspotName)
    const profileName = this.escape(input.profileName)
    const registrationKey = this.escape(input.registrationKey)
    const radiusHost = this.escape(input.radiusHost)

    const fail = (check: string, code: string, rollback = false) =>
      `:set arofiCheckSummary ($arofiCheckSummary . "${check}=fail,"); :set arofiProvisionErrors ($arofiProvisionErrors . "${code},")${rollback ? '; :set arofiRollbackNeeded true' : ''}`

    const lines = [
      ``,
      `# 6. Local self-test before reporting provisioning success`,
      `:global arofiProvisionErrors`,
      `:global arofiProvisionNotes`,
      `:global arofiCheckSummary`,
      `:global arofiSelfTestStatus`,
      `:global arofiRollbackNeeded`,
      `:global arofiWirelessInterfaces`,
      `:global arofiWirelessAttached`,
      `:global arofiEthernetAttached`,
      `:global arofiBridgePorts`,
      `:set arofiCheckSummary ""`,
      `:put "AROFi: running provisioning self-test."`,
    ]

    if (input.radiusOnly) {
      lines.push(
        `:if ([:len [/ip hotspot find]] > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "hotspot=ok,") } else={ ${fail('hotspot', 'existing_hotspot_missing')} }`,
        `:set arofiCheckSummary ($arofiCheckSummary . "bridge=skip,bridge_port=skip,dhcp=skip,nat=skip,wireless=existing,")`,
      )
    } else {
      lines.push(
        `:local arofiBridgeId [/interface bridge find name="arofi-hotspot"]`,
        `:if ([:len $arofiBridgeId] > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "bridge=ok,") } else={ ${fail('bridge', 'bridge_missing', true)} }`,
        `:if ([:len $arofiBridgeId] > 0) do={ :set arofiBridgePorts [:len [/interface bridge port find bridge=$arofiBridgeId]] }`,
        `:if ($arofiBridgePorts > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "bridge_port=ok,") } else={ ${fail('bridge_port', 'no_hotspot_interface', true)} }`,
        `:if ([:len [/ip dhcp-server find name=arofi-dhcp]] > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "dhcp=ok,") } else={ ${fail('dhcp', 'dhcp_missing', true)} }`,
        `:if ([:len [/ip firewall nat find comment="AROFi hotspot nat"]] > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "nat=ok,") } else={ ${fail('nat', 'nat_missing', true)} }`,
        `:if ([:len [/ip hotspot find name="${hotspotName}"]] > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "hotspot=ok,") } else={ ${fail('hotspot', 'hotspot_missing', true)} }`,
        `:if ($arofiWirelessAttached > 0) do={`,
        `  :set arofiCheckSummary ($arofiCheckSummary . "wireless=ok,")`,
        `} else={`,
        `  :if ($arofiEthernetAttached > 0) do={`,
        `    :set arofiCheckSummary ($arofiCheckSummary . "wireless=ethernet,")`,
        `    :set arofiProvisionNotes ($arofiProvisionNotes . "ethernet_fallback,")`,
        `  } else={`,
        `    ${fail('wireless', 'no_wireless_or_ethernet_attached', true)}`,
        `  }`,
        `}`,
      )
    }

    lines.push(
      `:if ([:len [/radius find comment="AROFi ${registrationKey}"]] > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "radius_config=ok,") } else={ ${fail('radius_config', 'radius_config_missing')} }`,
      `:local arofiRadiusReplies 0`,
      `:do { :set arofiRadiusReplies [/ping address=${radiusHost} count=2] } on-error={}`,
      `:if ($arofiRadiusReplies > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "radius=ok,") } else={ ${fail('radius', 'radius_unreachable')} }`,
      `:if ([:len [/system script find name="arofi-heartbeat"]] > 0 && [:len [/system scheduler find name="arofi-heartbeat"]] > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "scheduler=ok,") } else={ ${fail('scheduler', 'scheduler_missing')} }`,
      `:if ([:len [/file find name="hotspot/login.html"]] > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "files=ok,") } else={ ${fail('files', 'login_html_missing')} }`,
      `:if ([:len [/ip hotspot profile find name="${profileName}"]] > 0) do={ :set arofiCheckSummary ($arofiCheckSummary . "profile=ok,") } else={ ${fail('profile', 'profile_missing')} }`,
      `:if ($arofiProvisionErrors = "") do={ :set arofiSelfTestStatus "ok" } else={ :set arofiSelfTestStatus "failed" }`,
      `:if ($arofiSelfTestStatus = "failed") do={`,
      `  :put "AROFi provisioning self-test FAILED: $arofiProvisionErrors"`,
      `  :if ($arofiRollbackNeeded = true) do={`,
      ...this.buildHotspotRollbackScript(hotspotName).map((line) => `    ${line}`),
      `  }`,
      `} else={`,
      `  :put "AROFi provisioning self-test passed."`,
      `}`,
    )

    return lines
  }

  private buildHotspotRollbackScript(hotspotName: string) {
    return [
      `:put "AROFi: rolling back generated HotSpot resources."`,
      `:global arofiCreatedHotspot`,
      `:if ($arofiCreatedHotspot = true) do={ :do { /ip hotspot remove [/ip hotspot find name="${hotspotName}"] } on-error={} }`,
      `:do { /ip dhcp-server remove [/ip dhcp-server find name=arofi-dhcp] } on-error={}`,
      `:do { /ip pool remove [/ip pool find name=arofi-pool] } on-error={}`,
      `:do { /ip address remove [/ip address find comment="AROFi hotspot gateway"] } on-error={}`,
      `:do { /ip firewall nat remove [/ip firewall nat find comment="AROFi hotspot nat"] } on-error={}`,
      `:do { /ip firewall filter remove [/ip firewall filter find comment="AROFi hotspot input"] } on-error={}`,
      `:do { /ip firewall filter remove [/ip firewall filter find comment="AROFi hotspot forward"] } on-error={}`,
      `:do { /ip firewall mangle remove [/ip firewall mangle find comment="AROFi anti-tether"] } on-error={}`,
      `:global arofiCreatedBridge`,
      `:if ($arofiCreatedBridge = true) do={ :do { :local rb [/interface bridge find name="arofi-hotspot"]; :if ([:len $rb] > 0) do={ /interface bridge port remove [/interface bridge port find bridge=$rb] } } on-error={} }`,
      `:if ($arofiCreatedBridge = true) do={ :do { /interface bridge remove [/interface bridge find name="arofi-hotspot"] } on-error={} }`,
    ]
  }

  private buildLoginHtmlInstallScript(loginHtmlUrl: string, fallbackLoginHtmlUrl: string, profileName?: string) {
    const profileSet = profileName
      ? [`:do { /ip hotspot profile set [/ip hotspot profile find name="${this.escape(profileName)}"] html-directory=hotspot } on-error={ :global arofiProvisionErrors; :set arofiProvisionErrors ($arofiProvisionErrors . "profile_html_directory,"); :put "WARNING: failed to bind hotspot profile to html-directory=hotspot" }`]
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
      `    :if ([:len [/file find name="hotspot/login.html"]] > 0) do={`,
      `      :put "AROFi HotSpot login.html installed by HTTP fallback."`,
      `    } else={`,
      `      :error "login.html not found after HTTP fallback fetch"`,
      `    }`,
      `  } on-error={`,
      `    :global arofiProvisionErrors`,
      `    :set arofiProvisionErrors ($arofiProvisionErrors . "login_html_fetch,")`,
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
      var u=sp.get('username'),p=sp.get('password'),ql=sp.get('loginUrl');
      if(u&&p){var f=document.getElementById('lf');if(ql)f.action=ql;document.getElementById('lu').value=u;document.getElementById('lp').value=p;f.submit();return;}
      if(ip||mac)document.getElementById('dinfo').textContent=(ip?'IP: '+ip:'')+(ip&&mac?'  |  ':'')+(mac?'MAC: '+mac.toUpperCase():'');
      load();
    };
    async function load(){
      try{
        var r=await fetch(API+'/api/portal/context?mac='+encodeURIComponent(mac)+'&ip='+encodeURIComponent(ip)+'&routerKey='+encodeURIComponent(RKEY)+'&server='+encodeURIComponent(srv)+'&loginUrl='+encodeURIComponent(lo));
        if(!r.ok)throw new Error('HTTP '+r.status);
        var d=await r.json();
        pkgs=d.packages||[];
        if(d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect){
          sst('Welcome back! Your access is still active. Reconnecting...','ok');
          setTimeout(function(){conn(d.returningDevice.reconnect);},800);
        }
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
        sst('Voucher redeemed! Connecting you to the internet...','ok');
        conn(b.reconnect);
      }catch(e){sst(e.message||'Voucher redemption failed. Please try again.','err');setbtn('vbtn',false,'Connect to Internet');}
    }
    function conn(rc){
      if(!rc||!rc.username||!rc.password){sst('Connection failed: no credentials returned. Contact support.','err');return;}
      var f=document.getElementById('lf');
      var target=rc.loginUrl||lo;
      if(target)f.action=target;
      document.getElementById('lu').value=rc.username;
      document.getElementById('lp').value=rc.password;
      f.submit();
    }
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
  // them to the isolated arofi-hotspot bridge. The interface names are detected
  // dynamically because RouterOS models/packages use wlan*, wifi*, radio*, and
  // other names under the wireless/wifi menus.
  //
  // CRITICAL: RouterOS v6 has no /interface wifi menu and v7-wifiwave2 boards
  // have no /interface wireless menu. A bare statement that references a missing
  // menu is a COMPILE error that ":do {} on-error" cannot catch, which aborts a
  // whole /import on the wrong RouterOS version. So every radio command is kept
  // as TEXT and only compiled at runtime via [:parse]; a missing menu then
  // becomes a catchable runtime error and the rest of the script still runs.
  private buildHotspotWirelessScript(ssid: string) {
    const escapedSsid = this.escape(ssid.slice(0, 32) || 'AROFi Free WiFi')

    const bridgePort = [
      `:local ifaceId [/interface find name=$arofiRadioName]`,
      `:local bridgeId [/interface bridge find name="arofi-hotspot"]`,
      `:if ([:len $ifaceId] > 0 && [:len $bridgeId] > 0) do={`,
      `  :local bridgePortId [/interface bridge port find interface=$ifaceId]`,
      `  :if ([:len $bridgePortId] = 0) do={`,
      `    /interface bridge port add bridge=$bridgeId interface=$ifaceId`,
      `  } else={`,
      `    /interface bridge port set $bridgePortId bridge=$bridgeId`,
      `  }`,
      `  :global arofiWirelessAttached`,
      `  :set arofiWirelessAttached ($arofiWirelessAttached + 1)`,
      `  :put ("AROFi: attached wireless interface " . $arofiRadioName . " to hotspot bridge.")`,
      `} else={`,
      `  :global arofiProvisionErrors`,
      `  :set arofiProvisionErrors ($arofiProvisionErrors . "wireless_bridge_attach,")`,
      `}`,
    ].join(' ')

    const v6Inner = [
      `:foreach arofiRadio in=[/interface wireless find] do={`,
      `  :global arofiWirelessInterfaces`,
      `  :set arofiWirelessInterfaces ($arofiWirelessInterfaces + 1)`,
      `  :local arofiRadioName [/interface wireless get $arofiRadio name]`,
      `  :do {`,
      `    /interface wireless set $arofiRadio disabled=no mode=ap-bridge ssid="${escapedSsid}" security-profile=arofi-open`,
      `    ${bridgePort}`,
      `  } on-error={`,
      `    :global arofiProvisionErrors`,
      `    :set arofiProvisionErrors ($arofiProvisionErrors . "wireless_set_failed,")`,
      `    :put ("AROFi: failed to configure wireless interface " . $arofiRadioName)`,
      `  }`,
      `}`,
    ].join(' ')

    const v7Inner = [
      `:foreach arofiRadio in=[/interface wifi find] do={`,
      `  :global arofiWirelessInterfaces`,
      `  :set arofiWirelessInterfaces ($arofiWirelessInterfaces + 1)`,
      `  :local arofiRadioName [/interface wifi get $arofiRadio name]`,
      `  :do {`,
      `    /interface wifi set $arofiRadio disabled=no configuration.mode=ap configuration.ssid="${escapedSsid}" security.authentication-types=""`,
      `    ${bridgePort}`,
      `  } on-error={`,
      `    :global arofiProvisionErrors`,
      `    :set arofiProvisionErrors ($arofiProvisionErrors . "wifi_set_failed,")`,
      `    :put ("AROFi: failed to configure wifi interface " . $arofiRadioName)`,
      `  }`,
      `}`,
    ].join(' ')

    const wifiWave2Inner = [
      `:foreach arofiRadio in=[/interface wifiwave2 find] do={`,
      `  :global arofiWirelessInterfaces`,
      `  :set arofiWirelessInterfaces ($arofiWirelessInterfaces + 1)`,
      `  :local arofiRadioName [/interface wifiwave2 get $arofiRadio name]`,
      `  :do {`,
      `    /interface wifiwave2 set $arofiRadio disabled=no configuration.mode=ap configuration.ssid="${escapedSsid}" security.authentication-types=""`,
      `    ${bridgePort}`,
      `  } on-error={`,
      `    :global arofiProvisionErrors`,
      `    :set arofiProvisionErrors ($arofiProvisionErrors . "wifiwave2_set_failed,")`,
      `    :put ("AROFi: failed to configure wifiwave2 interface " . $arofiRadioName)`,
      `  }`,
      `}`,
    ].join(' ')

    const securityProfile =
      `:if ([:len [/interface wireless security-profiles find name="arofi-open"]]>0) do={/interface wireless security-profiles set [/interface wireless security-profiles find name="arofi-open"] mode=none authentication-types=""} else={/interface wireless security-profiles add name="arofi-open" mode=none authentication-types=""}`

    return [
      ...this.parseGuard('/interface wireless cap set enabled=no', 'AROFi: no wireless CAP menu - skipped.'),
      ...this.parseGuard(securityProfile, 'AROFi: wireless security-profiles not available - skipped.'),
      ...this.parseGuard(v6Inner, 'AROFi: RouterOS wireless menu not available - skipped.'),
      ...this.parseGuard(v7Inner, 'AROFi: RouterOS wifi menu not available - skipped.'),
      ...this.parseGuard(wifiWave2Inner, 'AROFi: RouterOS wifiwave2 menu not available - skipped.'),
      `:if ($arofiWirelessInterfaces = 0) do={ :put "AROFi: no wireless interfaces detected; Ethernet fallback will be attempted." }`,
    ]
  }

  private buildEthernetHotspotFallbackScript() {
    return [
      `:if ($arofiWirelessAttached = 0) do={`,
      `  :put "AROFi: no wireless interface is attached; searching for a non-WAN Ethernet hotspot port."`,
      `  :local selectedEther ""`,
      `  :do {`,
      `    :foreach e in=[/interface ethernet find] do={`,
      `      :local eName [/interface ethernet get $e name]`,
      `      :local eDisabled false`,
      `      :do { :set eDisabled [/interface ethernet get $e disabled] } on-error={}`,
      `      :if ($selectedEther = "" && $eDisabled = false && $eName != $wanIface && $eName != "ether1") do={`,
      `        :local eIfaceId [/interface find name=$eName]`,
      `        :if ([:len [/interface bridge port find interface=$eIfaceId]] = 0) do={ :set selectedEther $eName }`,
      `      }`,
      `    }`,
      `    :if ($selectedEther = "") do={`,
      `      :foreach e in=[/interface ethernet find] do={`,
      `        :local eName [/interface ethernet get $e name]`,
      `        :local eDisabled false`,
      `        :do { :set eDisabled [/interface ethernet get $e disabled] } on-error={}`,
      `        :if ($selectedEther = "" && $eDisabled = false && $eName != $wanIface && $eName != "ether1") do={ :set selectedEther $eName }`,
      `      }`,
      `    }`,
      `    :if ($selectedEther != "") do={`,
      `      :local eIfaceId [/interface find name=$selectedEther]`,
      `      :local bridgeId [/interface bridge find name="arofi-hotspot"]`,
      `      :if ([:len $eIfaceId] > 0 && [:len $bridgeId] > 0) do={`,
      `        :local bridgePortId [/interface bridge port find interface=$eIfaceId]`,
      `        :if ([:len $bridgePortId] = 0) do={`,
      `          /interface bridge port add bridge=$bridgeId interface=$eIfaceId`,
      `        } else={`,
      `          /interface bridge port set $bridgePortId bridge=$bridgeId`,
      `        }`,
      `        :global arofiEthernetAttached`,
      `        :set arofiEthernetAttached 1`,
      `        :put ("AROFi: attached Ethernet hotspot interface " . $selectedEther . ".")`,
      `      }`,
      `    } else={`,
      `      :global arofiProvisionErrors`,
      `      :global arofiRollbackNeeded`,
      `      :set arofiProvisionErrors ($arofiProvisionErrors . "no_ethernet_fallback,")`,
      `      :set arofiRollbackNeeded true`,
      `      :put "AROFi: no safe Ethernet hotspot interface found. Connect an AP to a non-WAN port or set up a hotspot bridge port manually."`,
      `    }`,
      `  } on-error={`,
      `    :global arofiProvisionErrors`,
      `    :global arofiRollbackNeeded`,
      `    :set arofiProvisionErrors ($arofiProvisionErrors . "ethernet_fallback_failed,")`,
      `    :set arofiRollbackNeeded true`,
      `    :put "AROFi: Ethernet hotspot fallback failed."`,
      `  }`,
      `}`,
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
    // MIKROTIK_CALLBACK_HTTP_URL must be a direct IP:port, e.g. http://95.111.234.34:4012
    // MikroTik runs the fallback fetch BEFORE it has internet access, so DNS
    // names will NOT resolve. Only a raw IP works reliably here.
    // Set MIKROTIK_CALLBACK_HTTP_URL in Coolify env vars or .env to override.
    const configured = this.configService.get<string>('MIKROTIK_CALLBACK_HTTP_URL')
    if (configured) {
      return configured.replace(/\/$/, '')
    }

    // Hard-coded IP fallback — never use a domain name here.
    // Update this if the server IP changes.
    return 'http://95.111.234.34:4012'
  }
}
