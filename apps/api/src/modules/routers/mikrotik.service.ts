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
      'radius-secret'

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
    const safeScript = [
      `# AROFi MikroTik onboarding script`,
      `# Mode: ${input.mode ?? 'SAFE_EXISTING_ROUTER'}`,
      `# Router: ${this.escape(input.routerName)}`,
      `# Registration key: ${this.escape(registrationKey)}`,
      `# This script does not reset or wipe existing WAN/LAN configuration.`,
      ``,
      `# 1. Identity and RouterOS API service used for optional health checks`,
      `/system identity set name="${this.escape(input.identity)}"`,
      `/ip service enable ${apiService}`,
      `/ip service set ${apiService} port=${input.apiPort} disabled=no`,
      ``,
      `# 2. RADIUS server for HotSpot authentication and accounting`,
      `/radius remove [find where comment="AROFi ${this.escape(registrationKey)}"]`,
      `/radius add service=hotspot address=${input.radiusHost} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=3s comment="AROFi ${this.escape(registrationKey)}"`,
      ``,
      `# 3. HotSpot profile integration. Calling-Station-Id must preserve client MAC for FreeRADIUS MAC binding.`,
      `:if ([:len [/ip hotspot profile find name="${profileName}"]] = 0) do={ /ip hotspot profile add name="${profileName}" comment="AROFi managed profile" }`,
      `/ip hotspot profile set "${profileName}" use-radius=yes radius-accounting=yes interim-update=5m login-by=http-chap,http-pap,cookie html-directory=hotspot radius-location-name="${this.escape(registrationKey)}" radius-location-id="${this.escape(registrationKey)}"`,
      ...(input.hotspotServerName
        ? [`/ip hotspot set [find name="${this.escape(input.hotspotServerName)}"] profile="${profileName}"`]
        : []),
      `/ip hotspot profile set "${profileName}" split-user-domain=no`,
      `/ip hotspot user profile set [find default=yes] shared-users=1`,
      ``,
      `# 4. Walled garden: allow captive portal and payment checkout before authentication`,
      ...this.buildWalledGarden(input.portalHosts ?? []),
      ...(input.ttlAntiTetheringEnabled
        ? [
            ``,
            `# Optional anti-tethering control. This reduces common phone hotspot sharing but cannot guarantee detection of every NAT tethering case.`,
            `/ip firewall mangle remove [find where comment="AROFi optional TTL anti-tethering"]`,
            `/ip firewall mangle add chain=forward action=change-ttl new-ttl=set:1 passthrough=yes comment="AROFi optional TTL anti-tethering"`,
          ]
        : []),
      ``,
      `# 5. Router AAA accounting`,
      `/user aaa set use-radius=yes accounting=yes default-group=read`,
      `/snmp set enabled=yes`,
      `:put "AROFi router ${this.escape(input.routerName)} script applied. Registration key ${this.escape(registrationKey)}. Test HotSpot login to verify."`,
    ]

    if (input.mode !== 'FRESH_FULL_HOTSPOT') {
      return safeScript.join('\n')
    }

    return [
      ...safeScript,
      ``,
      `# Fresh router HotSpot setup section. Review interface names before running on production routers.`,
      `# This section creates HotSpot bindings only; it still does not reset unrelated configuration.`,
      `:if ([:len [/ip pool find name="arofi-hotspot-pool"]] = 0) do={ /ip pool add name=arofi-hotspot-pool ranges=10.50.0.10-10.50.0.254 }`,
      `:if ([:len [/ip dhcp-server network find comment="AROFi hotspot network"]] = 0) do={ /ip dhcp-server network add address=10.50.0.0/24 gateway=10.50.0.1 dns-server=1.1.1.1,8.8.8.8 comment="AROFi hotspot network" }`,
      `:if ([:len [/ip hotspot find name="${this.escape(hotspotName)}"]] = 0) do={ /ip hotspot add name="${this.escape(hotspotName)}" interface=bridge address-pool=arofi-hotspot-pool profile="${profileName}" disabled=no }`,
      `:put "AROFi fresh HotSpot section completed. Confirm interface=bridge matches your LAN bridge."`,
    ].join('\n')
  }

  getOnboardingChecklist(routerName: string) {
    return [
      `Reach the RouterOS API for ${routerName} on the configured management IP and port.`,
      'Paste the provisioning script into the MikroTik terminal or apply it over WinBox.',
      'Confirm the router can reach the VPS on UDP 1812 and UDP 1813.',
      'Confirm the portal and Pesapal hosts are reachable through the HotSpot walled garden before payment.',
      'Run a health check from AROFi to validate API reachability.',
      'Send one access request and one accounting packet to verify AAA flow.',
      'Test one paid user, a same-MAC reconnect, and a second-MAC rejection.',
    ]
  }

  private buildWalledGarden(hosts: string[]) {
    const normalizedHosts = Array.from(new Set(hosts.filter(Boolean)))
    if (normalizedHosts.length === 0) {
      return []
    }

    return [
      `/ip hotspot walled-garden remove [find where comment="AROFi portal/payment access"]`,
      ...normalizedHosts.map(
        (host) =>
          `/ip hotspot walled-garden add dst-host="${this.escape(host)}" action=allow comment="AROFi portal/payment access"`,
      ),
    ]
  }

  private escape(value: string) {
    return value.replace(/"/g, '\\"')
  }
}
