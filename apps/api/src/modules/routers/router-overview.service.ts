import { Injectable } from '@nestjs/common'
import { RadiusEventType, RouterStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { accountingLiveCutoff } from '../radius/accounting-liveness'
import { MikrotikService } from './mikrotik.service'
import { RouterCredentialsService } from './router-credentials.service'

@Injectable()
export class RouterOverviewService {
  private readonly routerLiveWindowSeconds = Number.parseInt(process.env.ROUTER_LIVE_WINDOW_SECONDS ?? '12', 10)
  private readonly routerStaleWindowSeconds = Number.parseInt(process.env.ROUTER_STALE_WINDOW_SECONDS ?? '30', 10)
  private readonly authRadiusEventTypes = new Set<RadiusEventType>([
    RadiusEventType.ACCESS_ACCEPT,
    RadiusEventType.ACCESS_REJECT,
    RadiusEventType.ACCESS_REQUEST,
  ])
  private readonly accountingRadiusEventTypes = new Set<RadiusEventType>([
    RadiusEventType.ACCOUNTING_START,
    RadiusEventType.ACCOUNTING_INTERIM,
    RadiusEventType.ACCOUNTING_STOP,
  ])

  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
    private readonly routerCredentialsService: RouterCredentialsService,
  ) {}

  async getOverview(tenantId?: string) {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const liveAccountingCutoff = accountingLiveCutoff(now)
    const tenantWhere = tenantId ? { tenantId } : undefined

    const [groups, routers, recentHealthChecks, radiusEventsToday, liveAccountingRows, accountingRowsToday] =
      await Promise.all([
        this.prisma.routerGroup.findMany({
          where: tenantWhere,
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            region: true,
            tenant: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.router.findMany({
          where: tenantWhere,
          select: {
            id: true,
            tenantId: true,
            groupId: true,
            name: true,
            identity: true,
            vendor: true,
            host: true,
            apiPort: true,
            connectionMode: true,
            siteLabel: true,
            locationText: true,
            ispName: true,
            managerName: true,
            managerPhone: true,
            model: true,
            serialNumber: true,
            routerOsVersion: true,
            hotspotServerName: true,
            portalWalledGardenHosts: true,
            ttlAntiTetheringEnabled: true,
            remotePort: true,
            isRemotePortOpen: true,
            remoteSstpIp: true,
            remoteToken: true,
            remoteClientName: true,
            remoteAccessEnabled: true,
            lastOfflineAt: true,
            lastReconnectedAt: true,
            verificationStatus: true,
            onboardingStatus: true,
            registrationKey: true,
            scriptGeneratedAt: true,
            lastProvisionedAt: true,
            lastRadiusSignalAt: true,
            lastAccountingSignalAt: true,
            lastAuthSignalAt: true,
            status: true,
            healthMessage: true,
            lastSeenAt: true,
            lastHealthCheckAt: true,
            lastLatencyMs: true,
            activeSessionCount: true,
            tags: true,
            tenant: { select: { id: true, name: true, domain: true } },
            group: { select: { id: true, name: true, code: true } },
            hotspot: { select: { id: true, name: true, nasIpAddress: true } },
            radiusClient: {
              select: {
                id: true,
                shortName: true,
                ipAddress: true,
                status: true,
                secretCiphertext: true,
              },
            },
            nasClient: {
              select: {
                id: true,
                nasname: true,
                shortname: true,
                type: true,
                enabled: true,
              },
            },
            healthChecks: {
              orderBy: { checkedAt: 'desc' },
              take: 1,
              select: {
                id: true,
                status: true,
                latencyMs: true,
                message: true,
                checkedAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.routerHealthCheck.findMany({
          where: tenantWhere,
          select: {
            id: true,
            status: true,
            latencyMs: true,
            message: true,
            checkedAt: true,
            tenant: { select: { id: true, name: true } },
            router: { select: { id: true, name: true } },
          },
          orderBy: { checkedAt: 'desc' },
          take: 12,
        }),
        this.prisma.radiusEvent.groupBy({
          by: ['eventType'],
          where: {
            ...(tenantId ? { tenantId } : {}),
            createdAt: { gte: startOfDay },
          },
          _count: { _all: true },
        }),
        this.prisma.radAcct.findMany({
          where: {
            acctstoptime: null,
            OR: [
              { acctupdatetime: { gte: liveAccountingCutoff } },
              { acctupdatetime: null, acctstarttime: { gte: liveAccountingCutoff } },
            ],
          },
          select: {
            nasipaddress: true,
            username: true,
          },
        }),
        this.prisma.radAcct.count({
          where: {
            OR: [
              { acctupdatetime: { gte: startOfDay } },
              { acctstarttime: { gte: startOfDay } },
              { acctstoptime: { gte: startOfDay } },
            ],
          },
        }),
      ])

    const activeAccountingByNas = new Map<string, number>()
    const liveNasIps = new Set<string>()
    const openSessionUsernames = new Set<string>()
    for (const row of liveAccountingRows) {
      if (row.nasipaddress) {
        liveNasIps.add(row.nasipaddress)
        activeAccountingByNas.set(
          row.nasipaddress,
          (activeAccountingByNas.get(row.nasipaddress) ?? 0) + 1,
        )
      }
      if (row.username) {
        openSessionUsernames.add(row.username)
      }
    }

    const credentialsForOpenSessions = openSessionUsernames.size
      ? await this.prisma.radiusCredential.findMany({
          where: {
            username: { in: Array.from(openSessionUsernames) },
            ...(tenantId ? { tenantId } : {}),
          },
          select: {
            username: true,
            routerId: true,
            activation: { select: { routerId: true } },
          },
        })
      : []

    const routerIdByUsername = new Map<string, string>()
    for (const credential of credentialsForOpenSessions) {
      const routerId = credential.routerId ?? credential.activation.routerId
      if (routerId) {
        routerIdByUsername.set(credential.username, routerId)
      }
    }

    const activeAccountingByRouterId = new Map<string, number>()
    for (const row of liveAccountingRows) {
      if (!row.username) continue
      const routerId = routerIdByUsername.get(row.username)
      if (routerId) {
        activeAccountingByRouterId.set(
          routerId,
          (activeAccountingByRouterId.get(routerId) ?? 0) + 1,
        )
      }
    }

    const groupStats = new Map<
      string,
      { routerCount: number; healthyCount: number; degradedCount: number; offlineCount: number }
    >()
    for (const router of routers) {
      if (!router.groupId) continue
      const stats = groupStats.get(router.groupId) ?? {
        routerCount: 0,
        healthyCount: 0,
        degradedCount: 0,
        offlineCount: 0,
      }
      stats.routerCount += 1
      if (router.status === RouterStatus.HEALTHY) stats.healthyCount += 1
      if (router.status === RouterStatus.DEGRADED) stats.degradedCount += 1
      if (router.status === RouterStatus.OFFLINE) stats.offlineCount += 1
      groupStats.set(router.groupId, stats)
    }

    let healthyRouters = 0
    let degradedRouters = 0
    let liveRouters = 0
    let staleRouters = 0
    let offlineRouters = 0
    let pendingRouters = 0
    let activeSessions = 0
    let latencyTotal = 0
    let latencyCount = 0
    let clientsConfigured = 0

    const mappedRouters = routers.map((router) => {
      const base = this.mapRouter(router)
      const nasCandidates = this.getRouterNasCandidates(router)
      const sessionsByUsername = activeAccountingByRouterId.get(router.id) ?? 0
      const hasLiveAccounting =
        sessionsByUsername > 0 || nasCandidates.some((candidate) => liveNasIps.has(candidate))
      const activeRadAcctSessions = Math.max(
        sessionsByUsername,
        nasCandidates.reduce(
          (total, candidate) => total + (activeAccountingByNas.get(candidate) ?? 0),
          0,
        ),
      )
      const mapped = hasLiveAccounting
        ? {
            ...base,
            status: RouterStatus.HEALTHY,
            healthMessage: 'Recent FreeRADIUS accounting seen in radacct',
            lastSeenAt: base.lastSeenAt ?? now,
            activeSessions: Math.max(base.activeSessions, activeRadAcctSessions),
          }
        : base

      if (mapped.status === RouterStatus.HEALTHY) healthyRouters += 1
      if (mapped.status === RouterStatus.DEGRADED) degradedRouters += 1
      if (mapped.liveState === 'LIVE') liveRouters += 1
      if (mapped.liveState === 'STALE') staleRouters += 1
      if (mapped.liveState === 'OFFLINE') offlineRouters += 1
      if (mapped.liveState === 'PENDING') pendingRouters += 1
      activeSessions += mapped.activeSessions
      if (typeof mapped.lastLatencyMs === 'number') {
        latencyTotal += mapped.lastLatencyMs
        latencyCount += 1
      }
      if (mapped.radiusClient) clientsConfigured += 1

      return mapped
    })

    let authEventsToday = 0
    let accountingEventsToday = 0
    for (const event of radiusEventsToday) {
      if (this.authRadiusEventTypes.has(event.eventType)) {
        authEventsToday += event._count._all
      }
      if (this.accountingRadiusEventTypes.has(event.eventType)) {
        accountingEventsToday += event._count._all
      }
    }

    const radiusServer = this.mikrotikService.getRadiusServerConfig()

    return {
      summary: {
        totalRouters: mappedRouters.length,
        healthyRouters,
        degradedRouters,
        liveRouters,
        staleRouters,
        offlineRouters,
        pendingRouters,
        routerGroups: groups.length,
        activeSessions,
        averageLatencyMs: latencyCount > 0 ? Math.round(latencyTotal / latencyCount) : 0,
      },
      groups: groups.map((group) => {
        const stats = groupStats.get(group.id) ?? {
          routerCount: 0,
          healthyCount: 0,
          degradedCount: 0,
          offlineCount: 0,
        }
        return {
          id: group.id,
          name: group.name,
          code: group.code,
          description: group.description,
          region: group.region,
          tenant: group.tenant,
          ...stats,
        }
      }),
      routers: mappedRouters,
      recentHealthChecks,
      radiusFoundation: {
        serverHost: radiusServer.host,
        authPort: radiusServer.authPort,
        accountingPort: radiusServer.accountingPort,
        sharedSecretHint: this.routerCredentialsService.mask(radiusServer.sharedSecret),
        clientsConfigured,
        authEventsToday,
        accountingEventsToday: accountingEventsToday + accountingRowsToday,
      },
    }
  }

  private mapRouter(router: any) {
    const live = this.resolveRouterLiveState(router)
    const activeSessions = live.liveState === 'OFFLINE' ? 0 : router.activeSessionCount
    const effectiveStatus =
      live.liveState === 'LIVE'
        ? RouterStatus.HEALTHY
        : live.liveState === 'OFFLINE'
          ? RouterStatus.OFFLINE
          : live.liveState === 'STALE' && router.status === RouterStatus.OFFLINE
            ? RouterStatus.DEGRADED
            : router.status

    return {
      id: router.id,
      name: router.name,
      identity: router.identity ?? router.name,
      vendor: router.vendor,
      host: router.host,
      apiPort: router.apiPort,
      connectionMode: router.connectionMode,
      siteLabel: router.siteLabel,
      locationText: router.locationText,
      ispName: router.ispName,
      managerName: router.managerName,
      managerPhone: router.managerPhone,
      model: router.model,
      serialNumber: router.serialNumber,
      routerOsVersion: router.routerOsVersion,
      hotspotServerName: router.hotspotServerName,
      portalWalledGardenHosts: router.portalWalledGardenHosts ?? [],
      ttlAntiTetheringEnabled: true,
      verificationStatus: router.verificationStatus,
      onboardingStatus: router.onboardingStatus,
      registrationKey: router.registrationKey,
      scriptGeneratedAt: router.scriptGeneratedAt,
      lastProvisionedAt: router.lastProvisionedAt,
      remotePort: router.remotePort ?? null,
      isRemotePortOpen: router.isRemotePortOpen ?? false,
      remoteSstpIp: router.remoteSstpIp ?? null,
      remoteToken: router.remoteToken ?? null,
      remoteClientName: router.remoteClientName ?? 'AROFI_REMOTE',
      remoteAccessEnabled: router.remoteAccessEnabled ?? false,
      lastRadiusSignalAt: router.lastRadiusSignalAt,
      lastAccountingSignalAt: router.lastAccountingSignalAt,
      lastAuthSignalAt: router.lastAuthSignalAt,
      lastOfflineAt: router.lastOfflineAt ?? null,
      lastReconnectedAt: router.lastReconnectedAt ?? null,
      provisioningCallbackReceived: Boolean(router.lastProvisionedAt),
      radiusAuthSeen: Boolean(router.lastAuthSignalAt),
      accountingSeen: Boolean(router.lastAccountingSignalAt),
      managementApiReachable:
        router.healthChecks[0]?.status === RouterStatus.HEALTHY ||
        router.healthChecks[0]?.status === RouterStatus.DEGRADED,
      managementApiMessage:
        router.healthChecks[0]?.message ??
        'Management API has not been checked. HotSpot/RADIUS can still work without public API reachability.',
      status: effectiveStatus,
      liveState: live.liveState,
      isLiveNow: live.liveState === 'LIVE',
      lastSignalAt: live.lastSignalAt,
      lastSignalSource: live.lastSignalSource,
      secondsSinceLastSignal: live.secondsSinceLastSignal,
      routerOnlineWindowSeconds: this.routerLiveWindowSeconds,
      healthMessage: live.message ?? router.healthMessage,
      lastSeenAt: router.lastSeenAt,
      lastHealthCheckAt: router.lastHealthCheckAt,
      lastLatencyMs: router.lastLatencyMs,
      activeSessions,
      tags: router.tags,
      tenant: router.tenant,
      group: router.group,
      hotspot: router.hotspot,
      radiusClient: router.radiusClient
        ? {
            id: router.radiusClient.id,
            shortName: router.radiusClient.shortName,
            ipAddress: router.radiusClient.ipAddress,
            status: router.radiusClient.status,
            sharedSecretHint: this.routerCredentialsService.maskCiphertext(
              router.radiusClient.secretCiphertext,
            ),
          }
        : null,
      nasClient: router.nasClient
        ? {
            id: router.nasClient.id,
            nasname: router.nasClient.nasname,
            shortname: router.nasClient.shortname,
            type: router.nasClient.type,
            enabled: router.nasClient.enabled,
          }
        : null,
      latestHealthCheck: router.healthChecks[0]
        ? {
            id: router.healthChecks[0].id,
            status: router.healthChecks[0].status,
            latencyMs: router.healthChecks[0].latencyMs,
            message: router.healthChecks[0].message,
            checkedAt: router.healthChecks[0].checkedAt,
          }
        : null,
    }
  }

  private resolveRouterLiveState(router: any) {
    const signals = [
      { source: 'accounting', at: router.lastAccountingSignalAt ?? null },
      { source: 'auth', at: router.lastAuthSignalAt ?? null },
      { source: 'radius', at: router.lastRadiusSignalAt ?? null },
      { source: 'provisioning', at: router.lastProvisionedAt ?? null },
      { source: 'management', at: router.lastSeenAt ?? null },
      {
        source: 'health-check',
        at:
          router.healthChecks[0]?.status === RouterStatus.HEALTHY ||
          router.healthChecks[0]?.status === RouterStatus.DEGRADED
            ? router.healthChecks[0].checkedAt
            : null,
      },
    ].filter((signal): signal is { source: string; at: Date } => Boolean(signal.at))

    let latest: { source: string; at: Date } | undefined
    for (const signal of signals) {
      if (!latest || signal.at.getTime() > latest.at.getTime()) {
        latest = signal
      }
    }

    if (!latest) {
      return {
        liveState: router.status === RouterStatus.PENDING ? ('PENDING' as const) : ('OFFLINE' as const),
        lastSignalAt: null,
        lastSignalSource: null,
        secondsSinceLastSignal: null,
        message: null,
      }
    }

    const secondsSinceLastSignal = Math.max(0, Math.round((Date.now() - latest.at.getTime()) / 1000))
    if (secondsSinceLastSignal <= this.routerLiveWindowSeconds) {
      return {
        liveState: 'LIVE' as const,
        lastSignalAt: latest.at,
        lastSignalSource: latest.source,
        secondsSinceLastSignal,
        message: `Recent ${latest.source} signal received`,
      }
    }

    if (secondsSinceLastSignal <= this.routerStaleWindowSeconds) {
      return {
        liveState: 'STALE' as const,
        lastSignalAt: latest.at,
        lastSignalSource: latest.source,
        secondsSinceLastSignal,
        message: `Last router signal was ${latest.source}; management API may be blocked`,
      }
    }

    return {
      liveState: 'OFFLINE' as const,
      lastSignalAt: latest.at,
      lastSignalSource: latest.source,
      secondsSinceLastSignal,
      message: null,
    }
  }

  private getRouterNasCandidates(router: {
    host?: string | null
    radiusNasIpAddress?: string | null
    radiusClient?: { ipAddress?: string | null } | null
  }) {
    return Array.from(
      new Set(
        [router.radiusNasIpAddress, router.radiusClient?.ipAddress, router.host]
          .filter((value): value is string => Boolean(value))
          .filter((value) => !/^pending-[a-z0-9-]+\.self-service$/i.test(value)),
      ),
    )
  }
}
