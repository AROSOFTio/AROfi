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
  hotspotServerName?: string | null
  portalHosts?: string[]
  ttlAntiTetheringEnabled?: boolean
  mode?: 'SAFE_EXISTING_ROUTER' | 'FRESH_FULL_HOTSPOT'
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
    const callbackUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const fallbackCallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/provisioned/${this.escape(registrationKey)}`
    const callbackScript = this.buildProvisioningCallbackScript(callbackUrl, fallbackCallbackUrl)

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
      `/ip hotspot profile set [find name="${profileName}"] login-by=http-chap,http-pap,cookie`,
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
      `# 4b. Portal URL for customer devices. If you still use MikroTik default login.html,`,
      `# upload/replace hotspot/login.html so it redirects users to:`,
      `# ${this.resolvePortalBaseUrl(input.portalBaseUrl)}?mac=\\$(mac)&ip=\\$(ip)&link-login=\\$(link-login-only)&server=\\$(server-name)`,
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

    if (input.mode !== 'FRESH_FULL_HOTSPOT') {
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
      `# Fresh router HotSpot setup section`,
      `# WAN: fresh routers usually receive internet from the upstream/Savana modem on ether1.`,
      `:if ([:len [/interface ethernet find name="ether1"]] > 0) do={`,
      `  :foreach wanBridgePort in=[/interface bridge port find interface=ether1] do={`,
      `    /interface bridge port remove $wanBridgePort`,
      `  }`,
      `  :if ([:len [/ip dhcp-client find interface="ether1"]] = 0) do={`,
      `    /ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes disabled=no comment="AROFi WAN"`,
      `  } else={`,
      `    /ip dhcp-client enable [find interface="ether1"]`,
      `  }`,
      `}`,
      `:if ([:len [/interface bridge find name="bridge"]] = 0) do={`,
      `  /interface bridge add name=bridge comment="AROFi LAN bridge"`,
      `}`,
      `:foreach port in=[/interface ethernet find where name!="ether1"] do={`,
      `  :local pId [/interface ethernet get $port name]`,
      `  :if ([:len [/interface bridge port find interface=$pId]] = 0) do={`,
      `    /interface bridge port add bridge=bridge interface=$pId`,
      `  }`,
      `}`,
      `:if ([:len [/ip address find address="10.50.0.1/24"]] = 0) do={`,
      `  /ip address add address=10.50.0.1/24 interface=bridge`,
      `}`,
      `:if ([:len [/ip pool find name="arofi-pool"]] = 0) do={`,
      `  /ip pool add name=arofi-pool ranges=10.50.0.10-10.50.0.254`,
      `}`,
      `:if ([:len [/ip dhcp-server network find address="10.50.0.0/24"]] = 0) do={`,
      `  /ip dhcp-server network add address=10.50.0.0/24 gateway=10.50.0.1 dns-server=1.1.1.1,8.8.8.8`,
      `}`,
      `:if ([:len [/ip dhcp-server find interface=bridge]] = 0) do={`,
      `  /ip dhcp-server add name=arofi-dhcp interface=bridge address-pool=arofi-pool disabled=no`,
      `} else={`,
      `  /ip dhcp-server set [find interface=bridge] address-pool=arofi-pool disabled=no`,
      `}`,
      `/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8`,
      `:if ([:len [/interface ethernet find name="ether1"]] > 0) do={`,
      `  :if ([:len [/ip firewall nat find comment="AROFi nat"]] = 0) do={`,
      `    /ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="AROFi nat"`,
      `  }`,
      `}`,
      `/ip hotspot profile set [find name="${profileName}"] hotspot-address=10.50.0.1`,
      `:if ([:len [/ip hotspot find name="${this.escape(hotspotName)}"]] = 0) do={`,
      `  /ip hotspot add name="${this.escape(hotspotName)}" interface=bridge address-pool=arofi-pool profile="${profileName}" disabled=no`,
      `}`,
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
      'If the router is behind another modem/router, forward UDP 1812 and 1813 traffic outbound to the VPS. No inbound forwarding is needed for RADIUS.',
      'For AROFi API health checks only, forward TCP 8728/8729 from the public management IP to the MikroTik, or enter a reachable VPN/private management IP.',
      'Restart FreeRADIUS after the first callback if the router was registered without a real public NAS IP: docker compose restart freeradius.',
      'Replace or redirect the MikroTik HotSpot login page to the AROFi portal URL shown in the script comment.',
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

  private escape(value: string) {
    return value.replace(/"/g, '\\"')
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
