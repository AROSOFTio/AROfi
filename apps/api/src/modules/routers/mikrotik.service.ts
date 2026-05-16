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

    const safeScript = [
      `# AROFi MikroTik onboarding script`,
      `# Mode: ${input.mode ?? 'SAFE_EXISTING_ROUTER'}`,
      `# Router: ${this.escape(input.routerName.slice(0, 30))}`,
      `# Registration key: ${this.escape(registrationKey)}`,
      ``,
      `:local rKey "${this.escape(registrationKey)}"`,
      `:local pName "${profileName}"`,
      `:local hName "${this.escape(hotspotName)}"`,
      `:local rHost "${input.radiusHost}"`,
      `:local rSec "${this.escape(input.sharedSecret)}"`,
      ``,
      `# 1. Identity and RouterOS API service`,
      `/system identity set name="${this.escape(input.identity.slice(0, 30))}"`,
      `/ip service enable ${apiService}`,
      `/ip service set ${apiService} port=${input.apiPort} disabled=no`,
      ``,
      `# 2. RADIUS server for HotSpot auth and acct`,
      `/radius remove [find where comment="AROFi $rKey"]`,
      `/radius add service=hotspot address=$rHost secret=$rSec \\`,
      `  authentication-port=${input.radiusAuthPort} \\`,
      `  accounting-port=${input.radiusAccountingPort} \\`,
      `  timeout=3s comment="AROFi $rKey"`,
      ``,
      `# 3. HotSpot profile integration`,
      `:if ([:len [/ip hotspot profile find name=$pName]] = 0) do={`,
      `  /ip hotspot profile add name=$pName comment="AROFi managed"`,
      `}`,
      `/ip hotspot profile set [find name=$pName] use-radius=yes`,
      `/ip hotspot profile set [find name=$pName] radius-accounting=yes`,
      `/ip hotspot profile set [find name=$pName] interim-update=5m`,
      `/ip hotspot profile set [find name=$pName] html-directory=hotspot`,
      `/ip hotspot profile set [find name=$pName] \\`,
      `  login-by=http-chap,http-pap,cookie`,
      `/ip hotspot profile set [find name=$pName] \\`,
      `  radius-location-name=$rKey`,
      `/ip hotspot profile set [find name=$pName] \\`,
      `  radius-location-id=$rKey`,
      `/ip hotspot profile set [find name=$pName] split-user-domain=no`,
      `/ip hotspot user profile set [find default=yes] shared-users=1`,
      ``,
      `:if ([:len [/ip hotspot find name=$hName]] > 0) do={`,
      `  /ip hotspot set [find name=$hName] profile=$pName`,
      `} else={`,
      `  :put "Warning: HotSpot server $hName not found. Run FRESH mode."`,
      `}`,
      ``,
      `# 4. Walled garden for portal and payment access`,
      ...this.buildWalledGarden(input.portalHosts ?? []),
      ...(input.ttlAntiTetheringEnabled
        ? [
            ``,
            `# Optional TTL anti-tethering`,
            `/ip firewall mangle remove [find comment="AROFi anti-tether"]`,
            `/ip firewall mangle add chain=forward action=change-ttl \\`,
            `  new-ttl=set:1 passthrough=yes comment="AROFi anti-tether"`,
          ]
        : []),
      ``,
      `# 5. Router AAA accounting`,
      `/user aaa set use-radius=yes accounting=yes default-group=read`,
      `/snmp set enabled=yes`,
      `:put "AROFi router configured."`,
    ]

    if (input.mode !== 'FRESH_FULL_HOTSPOT') {
      return safeScript.join('\n')
    }

    return [
      ...safeScript,
      ``,
      `# Fresh router HotSpot setup section`,
      `:local pName "${profileName}"`,
      `:local hName "${this.escape(hotspotName)}"`,
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
      `  /ip dhcp-server network add address=10.50.0.0/24 gateway=10.50.0.1 \\`,
      `    dns-server=1.1.1.1,8.8.8.8`,
      `}`,
      `:if ([:len [/ip dhcp-server find name="arofi-dhcp"]] = 0) do={`,
      `  /ip dhcp-server add name=arofi-dhcp interface=bridge \\`,
      `    address-pool=arofi-pool disabled=no`,
      `}`,
      `/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8`,
}
