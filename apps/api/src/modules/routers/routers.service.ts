import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import {
  Prisma,
  RadiusEventType,
  RouterConnectionMode,
  RouterOnboardingStatus,
  RouterScriptMode,
  RouterStatus,
  SessionStatus,
} from '@prisma/client'
import { randomBytes, randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PLATFORM_SETTINGS_ID } from '../billing/billing.constants'
import { resolveEffectiveSubscriptionTier } from '../subscription/subscription-plan.util'
import { CreateRouterDto } from './dto/create-router.dto'
import { CreateRouterGroupDto } from './dto/create-router-group.dto'
import { UpdateRouterDto } from './dto/update-router.dto'
import { MikrotikService } from './mikrotik.service'
import { RouterCredentialsService } from './router-credentials.service'
import { RemoteProxyService } from './remote-proxy.service'

@Injectable()
export class RoutersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoutersService.name)
  // The router heartbeats every 15s. A LIVE router must have signalled within
  // ~2 missed beats so the dashboard flips to offline within ~30s of the box
  // going down (and back to live within one beat of it returning).
  private readonly routerLiveWindowSeconds = Number.parseInt(process.env.ROUTER_LIVE_WINDOW_SECONDS ?? '30', 10)
  private readonly routerStaleWindowSeconds = Number.parseInt(process.env.ROUTER_STALE_WINDOW_SECONDS ?? '120', 10)
  private readonly routerProbeIntervalMs = Number.parseInt(process.env.ROUTER_PROBE_INTERVAL_MS ?? '8000', 10)
  private probeTimer?: ReturnType<typeof setInterval>
  private alertsTimer?: ReturnType<typeof setInterval>
  private probing = false
  private alertedRouters = new Set<string>()

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

  private readonly routerInclude = {
    tenant: {
      select: {
        id: true,
        name: true,
        domain: true,
      },
    },
    group: {
      select: {
        id: true,
        name: true,
        code: true,
      },
    },
    hotspot: {
      select: {
        id: true,
        name: true,
        nasIpAddress: true,
      },
    },
    radiusClient: {
      select: {
        id: true,
        shortName: true,
        ipAddress: true,
        status: true,
        secretCiphertext: true,
      },
    },
    nasClient: true,
    sessions: {
      where: {
        status: SessionStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    },
    healthChecks: {
      orderBy: {
        checkedAt: 'desc' as const,
      },
      take: 1,
    },
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
    private readonly routerCredentialsService: RouterCredentialsService,
    private readonly remoteProxyService: RemoteProxyService,
  ) {}

  onModuleInit() {
    // Background reachability probe: keeps lastSeenAt fresh for routers whose
    // management API is reachable (public IP / VPN), so the dashboard shows
    // them live within ~2s. Disabled with ROUTER_PROBE_ENABLED=false.
    if (process.env.ROUTER_PROBE_ENABLED !== 'false') {
      this.probeTimer = setInterval(() => {
        void this.runReachabilityProbes()
      }, Math.max(2000, this.routerProbeIntervalMs))
      // Don't keep the process alive solely for this timer.
      if (this.probeTimer && typeof this.probeTimer.unref === 'function') {
        this.probeTimer.unref()
      }
    }

    // Sync all existing router VPN credentials to RADIUS database
    void this.syncAllRouterVpnCredentialsToRadius()

    // Start router alert checking loop if alerts are enabled
    if (process.env.ROUTER_ALERTS_ENABLED !== 'false') {
      this.alertsTimer = setInterval(() => {
        void this.checkRouterAlerts()
      }, 15000)
      if (this.alertsTimer && typeof this.alertsTimer.unref === 'function') {
        this.alertsTimer.unref()
      }
    }
  }

  onModuleDestroy() {
    if (this.probeTimer) {
      clearInterval(this.probeTimer)
    }
    if (this.alertsTimer) {
      clearInterval(this.alertsTimer)
    }
  }

  // Probes routers with a reachable management host and refreshes lastSeenAt on
  // success. Purely additive: it never marks a router offline, so it cannot make
  // a working (NAT'd) router falsely appear down.
  private async runReachabilityProbes() {
    if (this.probing) {
      return
    }
    this.probing = true
    try {
      const routers = await this.prisma.router.findMany({
        where: { status: { not: RouterStatus.PENDING } },
        select: { id: true, host: true, apiPort: true },
      })
      for (const router of routers) {
        if (!router.host || this.isPendingSelfServiceHost(router.host)) {
          continue
        }
        try {
          const probe = await this.mikrotikService.probeConnection(router.host, router.apiPort, 2500)
          if (probe.reachable) {
            await this.prisma.router.update({
              where: { id: router.id },
              data: {
                lastSeenAt: new Date(),
                lastLatencyMs: probe.latencyMs ?? undefined,
              },
            })
          }
        } catch {
          // Unreachable routers are left untouched; RADIUS/heartbeat signals
          // still drive their live state.
        }
      }
    } catch (error) {
      this.logger.warn(
        `Router reachability probe sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.probing = false
    }
  }

  // Called by the router-side scheduler (works behind NAT) to prove it is alive.
  async recordRouterHeartbeatByKey(key: string, sourceIp: string) {
    const router = await this.prisma.router.findUnique({
      where: { registrationKey: key },
      select: { id: true, status: true, onboardingStatus: true, radiusNasIpAddress: true },
    })

    if (!router) {
      return null
    }

    const normalizedSourceIp = sourceIp.trim()
    const pendingStatuses: RouterOnboardingStatus[] = [
      RouterOnboardingStatus.SCRIPT_GENERATED,
      RouterOnboardingStatus.WAITING_FOR_ROUTER,
    ]
    const shouldAdvanceOnboarding = pendingStatuses.includes(router.onboardingStatus as RouterOnboardingStatus)

    await this.prisma.router.update({
      where: { id: router.id },
      data: {
        lastSeenAt: new Date(),
        ...(shouldAdvanceOnboarding
          ? { onboardingStatus: RouterOnboardingStatus.WAITING_FOR_RADIUS }
          : {}),
        ...(router.status === RouterStatus.OFFLINE ? { status: RouterStatus.DEGRADED } : {}),
        ...(normalizedSourceIp && !router.radiusNasIpAddress
          ? { radiusNasIpAddress: normalizedSourceIp }
          : {}),
      },
    })

    return { ok: true }
  }

  async getOverview(tenantId?: string) {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const [groups, routers, recentHealthChecks, radiusEventsToday] = await Promise.all([
      this.prisma.routerGroup.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
          routers: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.router.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: this.routerInclude,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.routerHealthCheck.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
          router: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          checkedAt: 'desc',
        },
        take: 12,
      }),
      this.prisma.radiusEvent.groupBy({
        by: ['eventType'],
        where: {
          ...(tenantId ? { tenantId } : {}),
          createdAt: {
            gte: startOfDay,
          },
        },
        _count: {
          _all: true,
        },
      }),
    ])

    const recentAccountingRows = await this.prisma.radAcct.findMany({
      where: {
        OR: [
          { acctupdatetime: { gte: startOfDay } },
          { acctstarttime: { gte: startOfDay } },
          { acctstoptime: { gte: startOfDay } },
        ],
      },
      orderBy: { radacctid: 'desc' },
      take: 500,
    })
    const activeAccountingByNas = new Map<string, number>()
    for (const row of recentAccountingRows) {
      if (!row.nasipaddress || row.acctstoptime) {
        continue
      }
      activeAccountingByNas.set(row.nasipaddress, (activeAccountingByNas.get(row.nasipaddress) ?? 0) + 1)
    }

    // MikroTik does not always report a NAS-IP-Address that matches the public
    // IP we learned, so matching live sessions purely on nasipaddress can read 0
    // even with a connected customer. Also map open sessions to a router via the
    // RADIUS username (which is bound to the router that issued the credential).
    const openSessionUsernames = Array.from(
      new Set(recentAccountingRows.filter((row) => !row.acctstoptime && row.username).map((row) => row.username as string)),
    )
    const credentialsForOpenSessions = openSessionUsernames.length
      ? await this.prisma.radiusCredential.findMany({
          where: { username: { in: openSessionUsernames }, ...(tenantId ? { tenantId } : {}) },
          select: { username: true, routerId: true },
        })
      : []
    const routerIdByUsername = new Map(
      credentialsForOpenSessions
        .filter((credential): credential is { username: string; routerId: string } => Boolean(credential.routerId))
        .map((credential) => [credential.username, credential.routerId]),
    )
    const activeAccountingByRouterId = new Map<string, number>()
    for (const row of recentAccountingRows) {
      if (row.acctstoptime || !row.username) {
        continue
      }
      const routerId = routerIdByUsername.get(row.username)
      if (routerId) {
        activeAccountingByRouterId.set(routerId, (activeAccountingByRouterId.get(routerId) ?? 0) + 1)
      }
    }

    const radAcctNasIps = new Set(recentAccountingRows.map((row) => row.nasipaddress).filter(Boolean))
    const mappedRouters = routers.map((router) => {
      const mapped = this.mapRouter(router)
      const nasCandidates = this.getRouterNasCandidates(router)
      const sessionsByUsername = activeAccountingByRouterId.get(router.id) ?? 0
      const hasRadAcct =
        nasCandidates.some((candidate) => radAcctNasIps.has(candidate)) || sessionsByUsername > 0
      const activeRadAcctSessions = Math.max(
        nasCandidates.reduce((total, candidate) => total + (activeAccountingByNas.get(candidate) ?? 0), 0),
        sessionsByUsername,
      )

      if (!hasRadAcct) {
        return mapped
      }

      return {
        ...mapped,
        status: RouterStatus.HEALTHY,
        healthMessage: 'Recent FreeRADIUS accounting seen in radacct',
        lastSeenAt: mapped.lastSeenAt ?? new Date(),
        activeSessions: Math.max(mapped.activeSessions, activeRadAcctSessions),
      }
    })
    const latencyValues = mappedRouters
      .map((router) => router.lastLatencyMs)
      .filter((value): value is number => typeof value === 'number')

    const authEventsToday = radiusEventsToday
      .filter((event) => this.authRadiusEventTypes.has(event.eventType))
      .reduce((total, event) => total + event._count._all, 0)

    const accountingEventsToday = radiusEventsToday
      .filter((event) => this.accountingRadiusEventTypes.has(event.eventType))
      .reduce((total, event) => total + event._count._all, 0)

    const radiusServer = this.mikrotikService.getRadiusServerConfig()

    return {
      summary: {
        totalRouters: mappedRouters.length,
        healthyRouters: mappedRouters.filter((router) => router.status === RouterStatus.HEALTHY).length,
        degradedRouters: mappedRouters.filter((router) => router.status === RouterStatus.DEGRADED).length,
        liveRouters: mappedRouters.filter((router) => router.liveState === 'LIVE').length,
        staleRouters: mappedRouters.filter((router) => router.liveState === 'STALE').length,
        offlineRouters: mappedRouters.filter((router) => router.liveState === 'OFFLINE').length,
        pendingRouters: mappedRouters.filter((router) => router.liveState === 'PENDING').length,
        routerGroups: groups.length,
        activeSessions: mappedRouters.reduce((total, router) => total + router.activeSessions, 0),
        averageLatencyMs:
          latencyValues.length > 0
            ? Math.round(latencyValues.reduce((total, value) => total + value, 0) / latencyValues.length)
            : 0,
      },
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        code: group.code,
        description: group.description,
        region: group.region,
        tenant: group.tenant,
        routerCount: group.routers.length,
        healthyCount: group.routers.filter((router) => router.status === RouterStatus.HEALTHY).length,
        degradedCount: group.routers.filter((router) => router.status === RouterStatus.DEGRADED).length,
        offlineCount: group.routers.filter((router) => router.status === RouterStatus.OFFLINE).length,
      })),
      routers: mappedRouters,
      recentHealthChecks: recentHealthChecks.map((check) => ({
        id: check.id,
        status: check.status,
        latencyMs: check.latencyMs,
        message: check.message,
        checkedAt: check.checkedAt,
        tenant: check.tenant,
        router: check.router,
      })),
      radiusFoundation: {
        serverHost: radiusServer.host,
        authPort: radiusServer.authPort,
        accountingPort: radiusServer.accountingPort,
        sharedSecretHint: this.routerCredentialsService.mask(radiusServer.sharedSecret),
        clientsConfigured: mappedRouters.filter((router) => router.radiusClient).length,
        authEventsToday,
        accountingEventsToday: accountingEventsToday + recentAccountingRows.length,
      },
    }
  }

  async createGroup(dto: CreateRouterGroupDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id: dto.tenantId,
      },
    })

    if (!tenant) {
      throw new NotFoundException('Tenant not found')
    }

    return this.prisma.routerGroup.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        region: dto.region,
      },
    })
  }

  // Free/Pro plans cap how many routers a tenant can onboard; Enterprise is
  // unlimited (enterpriseRouterLimit is left null in PlatformSetting).
  private async enforceRouterLimit(tenantId: string) {
    const [platformSettings, tenantSettings, routerCount] = await Promise.all([
      this.prisma.platformSetting.upsert({
        where: { id: PLATFORM_SETTINGS_ID },
        update: {},
        create: { id: PLATFORM_SETTINGS_ID },
      }),
      this.prisma.tenantSetting.findUnique({
        where: { tenantId },
        select: { subscriptionPlan: true, subscriptionPlanExpiresAt: true },
      }),
      this.prisma.router.count({ where: { tenantId } }),
    ])

    const effectiveTier = tenantSettings
      ? resolveEffectiveSubscriptionTier(tenantSettings.subscriptionPlan, tenantSettings.subscriptionPlanExpiresAt)
      : 'FREE'

    const limit =
      effectiveTier === 'ENTERPRISE'
        ? platformSettings.enterpriseRouterLimit
        : effectiveTier === 'PRO'
          ? platformSettings.proRouterLimit
          : platformSettings.freeRouterLimit

    // Plan caps are disabled for now — every plan gets unlimited routers.
    // Re-enable this block when plan enforcement is ready.
    void limit
    void effectiveTier
    void routerCount
  }

  async createRouter(dto: CreateRouterDto) {
    const [tenant, group, hotspot] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: dto.tenantId } }),
      dto.groupId
        ? this.prisma.routerGroup.findUnique({ where: { id: dto.groupId } })
        : Promise.resolve(null),
      dto.hotspotId
        ? this.prisma.hotspot.findUnique({ where: { id: dto.hotspotId } })
        : Promise.resolve(null),
    ])

    if (!tenant) {
      throw new NotFoundException('Tenant not found')
    }

    if (group && group.tenantId !== dto.tenantId) {
      throw new BadRequestException('Router group does not belong to the tenant')
    }

    if (hotspot && hotspot.tenantId !== dto.tenantId) {
      throw new BadRequestException('Hotspot does not belong to the tenant')
    }

    await this.enforceRouterLimit(dto.tenantId)

    const registrationKey = randomUUID()
    const remoteToken = randomUUID()
    const remotePort = Math.floor(Math.random() * 100) + 31000
    const remoteSstpIp = `10.8.0.${Math.floor(Math.random() * 250) + 2}`
    const sharedSecret = this.getPlatformRadiusSharedSecret()
    const host = dto.host?.trim() || `pending-${registrationKey.slice(0, 12)}.self-service`
    const username = dto.username?.trim() || 'admin'
    const password = dto.password ?? ''
    const nasIpAddress = dto.radiusNasIpAddress?.trim() || host
    let router: { id: string }
    try {
      router = await this.prisma.router.create({
      data: {
        tenantId: dto.tenantId,
        groupId: dto.groupId,
        hotspotId: dto.hotspotId,
        name: dto.name,
        identity: dto.identity ?? dto.name,
        vendor: dto.vendor,
        host,
        apiPort:
          dto.apiPort ??
          (dto.connectionMode === RouterConnectionMode.ROUTEROS_API_SSL ? 8729 : 8728),
        connectionMode: dto.connectionMode ?? RouterConnectionMode.ROUTEROS_API,
        username,
        passwordCiphertext: this.routerCredentialsService.encrypt(password),
        sharedSecretCiphertext: this.routerCredentialsService.encrypt(sharedSecret),
        registrationKey,
        remoteToken,
        remotePort,
        remoteSstpIp,
        isRemotePortOpen: false,
        remoteClientName: 'AROFI_REMOTE',
        remoteAccessEnabled: true,
        onboardingStatus: RouterOnboardingStatus.SCRIPT_GENERATED,
        lastScriptMode: dto.scriptMode ?? RouterScriptMode.SAFE_EXISTING_ROUTER,
        scriptGeneratedAt: new Date(),
        siteLabel: dto.siteLabel,
        model: dto.model,
        serialNumber: dto.serialNumber,
        routerOsVersion: dto.routerOsVersion,
        radiusNasIpAddress: nasIpAddress,
        hotspotServerName: dto.hotspotServerName,
        portalWalledGardenHosts: dto.portalWalledGardenHosts ?? [],
        ttlAntiTetheringEnabled: dto.ttlAntiTetheringEnabled ?? false,
        tags: dto.tags ?? [],
        radiusClient: {
          create: {
            tenantId: dto.tenantId,
            shortName: this.buildRadiusClientShortName(dto.name),
            ipAddress: nasIpAddress,
            secretCiphertext: this.routerCredentialsService.encrypt(sharedSecret),
          },
        },
        nasClient: {
          create: {
            tenantId: dto.tenantId,
            nasname: nasIpAddress,
            shortname: this.buildRadiusClientShortName(dto.name),
            type: 'mikrotik',
            secret: sharedSecret,
            description: `AROFi dynamic NAS client for ${dto.name}`,
            enabled: true,
          },
        },
      },
      include: this.routerInclude,
      })

      // Sync VPN credentials to FreeRADIUS
      await this.syncRadiusVpnCredentials(router.id, remoteToken, remoteSstpIp)

      this.reloadFreeradiusNasClients()

      return await this.getRouterSetup(router.id)
    } catch (error) {
      throw this.translateRouterCreateError(error)
    }
  }

  // Turns raw Prisma/Postgres failures into actionable messages that actually
  // reach the UI, instead of NestJS masking everything as a bare
  // "Internal server error". Covers the whole create + setup flow.
  private translateRouterCreateError(error: unknown): Error {
    // Pass real HTTP errors (NotFound/BadRequest from validation or setup) through.
    if (error instanceof HttpException) {
      return error
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2000') {
        this.logger.error(`Router create failed: value too long for a column. ${error.message}`)
        return new BadRequestException(
          'Router could not be saved: a value is too long for the database (likely the RADIUS secret vs the nas.secret column). Run `prisma migrate deploy` (migration 20260614000000_widen_nas_secret) on the API, then retry.',
        )
      }
      if (error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'a unique field'
        return new BadRequestException(`A router with the same ${target} already exists for this tenant.`)
      }
      if (error.code === 'P2003' || error.code === 'P2025') {
        return new BadRequestException('A referenced tenant, group, or hotspot no longer exists. Refresh and try again.')
      }
      this.logger.error(`Router create failed (${error.code}): ${error.message}`)
      return new BadRequestException(`Router could not be saved (database error ${error.code}: ${error.message}).`)
    }

    // Anything else (encryption key issues, Prisma init errors, bugs in setup):
    // surface the real message so it is visible in the UI, not hidden as 500.
    const message = error instanceof Error ? error.message : String(error)
    this.logger.error(
      `Router create failed: ${message}`,
      error instanceof Error ? error.stack : undefined,
    )
    return new InternalServerErrorException(`Router could not be saved: ${message}`)
  }

  async runHealthCheck(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
      include: this.routerInclude,
    })

    if (!router) {
      throw new NotFoundException('Router not found')
    }

    if (tenantId && router.tenantId !== tenantId) {
      throw new NotFoundException('Router not found')
    }

    if (this.isPendingSelfServiceHost(router.host)) {
      const now = new Date()
      const message =
        'No reachable RouterOS management host is configured. RADIUS can still verify from live auth/accounting traffic, but API health checks need TCP 8728/8729 port forwarding or a reachable VPN/private IP.'

      await this.prisma.$transaction(async (tx) => {
        await tx.routerHealthCheck.create({
          data: {
            tenantId: router.tenantId,
            routerId: router.id,
            status: RouterStatus.PENDING,
            message,
            activeUsers: router.activeSessionCount,
          },
        })

        await tx.router.update({
          where: { id: router.id },
          data: {
            status: RouterStatus.PENDING,
            healthMessage: message,
            lastHealthCheckAt: now,
          },
        })
      })

      return this.getRouterSetup(router.id, tenantId)
    }

    const probe = await this.mikrotikService.probeConnection(router.host, router.apiPort)
    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      await tx.routerHealthCheck.create({
        data: {
          tenantId: router.tenantId,
          routerId: router.id,
          status: probe.status,
          latencyMs: probe.latencyMs,
          message: probe.message,
          activeUsers: router.activeSessionCount,
        },
      })

      const activeSessionCount = await tx.networkSession.count({
        where: {
          routerId: router.id,
          status: SessionStatus.ACTIVE,
        },
      })

      await tx.router.update({
        where: { id: router.id },
        data: {
          status: probe.status,
          healthMessage: probe.message,
          lastLatencyMs: probe.latencyMs,
          lastHealthCheckAt: now,
          lastSeenAt: probe.reachable ? now : router.lastSeenAt,
          activeSessionCount,
        },
      })
    })

    return this.getRouterSetup(router.id, tenantId)
  }

  async deleteRouter(routerId: string, tenantId?: string) {
    const where = tenantId ? { id: routerId, tenantId } : { id: routerId }
    const router = await this.prisma.router.findFirst({ where })
    if (!router) {
      throw new NotFoundException('Router not found')
    }
    // Cascade: health checks, radius events, and sessions are deleted by DB cascade.
    // Explicitly remove the radius/NAS client rows first (they reference the router).
    await this.prisma.$transaction(async (tx) => {
      await tx.radiusClient.deleteMany({ where: { routerId } })
      await tx.nasClient.deleteMany({ where: { routerId } })
      await tx.router.delete({ where: { id: routerId } })
    })
    return { deleted: true }
  }

  async updateRouter(routerId: string, dto: UpdateRouterDto, tenantId?: string) {
    // Verify ownership before writing
    const check = await this.prisma.router.findFirst({
      where: tenantId ? { id: routerId, tenantId } : { id: routerId },
      select: { id: true },
    })
    if (!check) throw new NotFoundException('Router not found')

    return this.prisma.router.update({
      where: { id: routerId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : null),
        ...(dto.siteLabel !== undefined ? { siteLabel: dto.siteLabel } : null),
        ...(dto.password !== undefined
          ? { passwordCiphertext: this.routerCredentialsService.encrypt(dto.password) }
          : null),
      } as Parameters<typeof this.prisma.router.update>[0]['data'],
    })
  }

  async markRouterProvisionedByKey(key: string, sourceIp: string) {
    const router = await this.prisma.router.findUnique({
      where: { registrationKey: key },
      include: this.routerInclude,
    })

    if (!router) {
      return null
    }

    const normalizedSourceIp = sourceIp.trim()
    const now = new Date()
    const baseWarning = normalizedSourceIp
      ? ''
      : 'Provisioning callback received, but source IP could not be detected.'

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const warnings: string[] = baseWarning ? [baseWarning] : []
        let managementHost = router.host
        const shouldReplaceManagementHost =
          Boolean(normalizedSourceIp) &&
          (this.isPendingSelfServiceHost(router.host) ||
            router.host === '192.168.88.1' ||
            router.remoteAccessEnabled)

        if (shouldReplaceManagementHost) {
          const duplicateHost = await tx.router.findFirst({
            where: {
              tenantId: router.tenantId,
              host: normalizedSourceIp,
              id: { not: router.id },
            },
            select: { id: true, name: true },
          })

          if (duplicateHost) {
            warnings.push(
              `Learned NAS IP ${normalizedSourceIp}, but management host was not changed because tenant router ${duplicateHost.name} already uses that host.`,
            )
          } else {
            managementHost = normalizedSourceIp
          }
        }

        const healthMessage = normalizedSourceIp
          ? [
              `Provisioning callback received from ${normalizedSourceIp}.`,
              managementHost === router.host && shouldReplaceManagementHost
                ? 'Management host kept as pending value because learned IP is already assigned in this tenant.'
                : 'RADIUS NAS IP learned.',
              'Restart FreeRADIUS if this is the first time this NAS IP was learned.',
            ].join(' ')
          : baseWarning

        const updatedRouter = await tx.router.update({
          where: { id: router.id },
          data: {
            host: managementHost,
            radiusNasIpAddress: normalizedSourceIp || router.radiusNasIpAddress,
            onboardingStatus: RouterOnboardingStatus.WAITING_FOR_ROUTER,
            lastProvisionedAt: now,
            healthMessage,
          },
          select: { id: true, host: true, tenantId: true, name: true },
        })

        if (normalizedSourceIp) {
          await this.upsertRadiusClientForProvisionedRouter(tx, router, normalizedSourceIp)
          const nasWarning = await this.upsertNasClientForProvisionedRouter(
            tx,
            router,
            normalizedSourceIp,
          )
          if (nasWarning) {
            warnings.push(nasWarning)
          }
        }

        return {
          routerId: updatedRouter.id,
          managementHost: updatedRouter.host,
          warning: warnings.length ? warnings.join(' ') : undefined,
        }
      })

      this.reloadFreeradiusNasClients()

      return {
        ok: true,
        callbackReceived: true,
        routerId: result.routerId,
        learnedNasIpAddress: normalizedSourceIp || null,
        managementHost: result.managementHost,
        ...(result.warning ? { warning: result.warning } : {}),
      }
    } catch (error) {
      this.logger.error(
        `MikroTik provisioning callback failed for router ${router.id} (${key}) from ${normalizedSourceIp || 'unknown IP'}`,
        error instanceof Error ? error.stack : String(error),
      )

      try {
        await this.prisma.router.update({
          where: { id: router.id },
          data: {
            radiusNasIpAddress: normalizedSourceIp || router.radiusNasIpAddress,
            onboardingStatus: RouterOnboardingStatus.WAITING_FOR_ROUTER,
            lastProvisionedAt: now,
            healthMessage:
              'Provisioning callback received, but AROFi could not fully update router/NAS records. Check API logs for the database error.',
          },
        })
        this.reloadFreeradiusNasClients()
      } catch (fallbackError) {
        this.logger.error(
          `Fallback provisioning callback update failed for router ${router.id} (${key})`,
          fallbackError instanceof Error ? fallbackError.stack : String(fallbackError),
        )
      }

      return {
        ok: true,
        callbackReceived: true,
        routerId: router.id,
        learnedNasIpAddress: normalizedSourceIp || null,
        managementHost: router.host,
        warning:
          'AROFi received the provisioning callback, but could not fully update router/NAS records. Check API logs for the database error.',
      }
    }
  }

  async getRouterSetup(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
      include: this.routerInclude,
    })

    if (!router) {
      throw new NotFoundException('Router not found')
    }

    if (tenantId && router.tenantId !== tenantId) {
      throw new NotFoundException('Router not found')
    }

    const sharedSecret = this.getPlatformRadiusSharedSecret()
    const adminPassword = this.safeDecrypt(router.passwordCiphertext)
    const radiusServer = this.mikrotikService.getRadiusServerConfig(sharedSecret)

    return {
      router: this.mapRouter(router),
      radiusServer,
      oneRunCommand: this.mikrotikService.buildOneRunCommand(router.registrationKey),
      onboardingChecklist: this.mikrotikService.getOnboardingChecklist(router.name),
      provisioningScript: this.mikrotikService.buildProvisioningScript({
        routerName: router.name,
        identity: router.identity ?? router.name,
        registrationKey: router.registrationKey,
        apiPort: router.apiPort,
        connectionMode: router.connectionMode,
        radiusHost: radiusServer.host,
        radiusAuthPort: radiusServer.authPort,
        radiusAccountingPort: radiusServer.accountingPort,
        sharedSecret,
        adminUsername: router.username,
        adminPassword,
        hotspotServerName: router.hotspotServerName,
        portalHosts: this.resolvePortalHosts(router.portalWalledGardenHosts),
        ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled,
        mode: router.lastScriptMode,
        portalBaseUrl: `https://${process.env.PORTAL_PUBLIC_HOST ?? 'app.arofi.net'}/portal`,
        hotspotNetworkName: router.siteLabel ?? router.hotspot?.name ?? router.name,
        dnsName: `${router.tenant.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.wifi`,
        remoteClientName: router.remoteClientName,
      }),
      setupDiagnostics: await this.getSetupDiagnostics(router.id),
      radiusClient: router.radiusClient
        ? {
            id: router.radiusClient.id,
            shortName: router.radiusClient.shortName,
            ipAddress: router.radiusClient.ipAddress,
            status: router.radiusClient.status,
            sharedSecretHint: this.routerCredentialsService.mask(sharedSecret),
            sharedSecret,
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
    }
  }

  async getProvisioningScriptByKey(key: string) {
    const router = await this.prisma.router.findUnique({
      where: { registrationKey: key },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            domain: true,
          },
        },
      },
    })

    if (!router) {
      return null
    }

    const sharedSecret = this.getPlatformRadiusSharedSecret()
    const adminPassword = this.safeDecrypt(router.passwordCiphertext)
    const radiusServer = this.mikrotikService.getRadiusServerConfig(sharedSecret)

    return this.mikrotikService.buildProvisioningScript({
      routerName: router.name,
      identity: router.identity ?? router.name,
      registrationKey: router.registrationKey,
      apiPort: router.apiPort,
      connectionMode: router.connectionMode,
      radiusHost: radiusServer.host,
      radiusSecondaryHost: radiusServer.secondaryHost,
      radiusAuthPort: radiusServer.authPort,
      radiusAccountingPort: radiusServer.accountingPort,
      sharedSecret,
      adminUsername: router.username,
      adminPassword,
      hotspotServerName: router.hotspotServerName,
      portalHosts: this.resolvePortalHosts(router.portalWalledGardenHosts),
      ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled,
      mode: router.lastScriptMode,
      portalBaseUrl: `https://${process.env.PORTAL_PUBLIC_HOST ?? 'app.arofi.net'}/portal`,
      hotspotNetworkName: router.siteLabel ?? router.name,
      dnsName: router.tenant
        ? `${router.tenant.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.wifi`
        : null,
      remoteClientName: router.remoteClientName,
    })
  }

  // Public, key-scoped summary for the phone-first setup page (apps/admin-web
  // /setup/[key]). Deliberately minimal — no secrets, NAS info, or anything
  // beyond what the existing public one-run command already exposes -- this
  // is meant to be opened on a field agent's phone with no AROFi login.
  async getMobileSetupSummaryByKey(key: string) {
    const router = await this.prisma.router.findUnique({
      where: { registrationKey: key },
      include: { tenant: { select: { name: true } } },
    })

    if (!router) {
      return null
    }

    return {
      routerName: router.name,
      tenantName: router.tenant.name,
      host: router.host,
      oneRunCommand: this.mikrotikService.buildOneRunCommand(router.registrationKey),
    }
  }

  async getMikrotikLoginHtmlByKey(key: string) {
    const router = await this.prisma.router.findUnique({
      where: { registrationKey: key },
    })

    if (!router) {
      return null
    }

    return this.mikrotikService.buildLoginHtml(
      router.registrationKey,
      `https://${process.env.PORTAL_PUBLIC_HOST ?? 'app.arofi.net'}/portal`,
    )
  }

  async getMikrotikStatusHtmlByKey(key: string) {
    const router = await this.prisma.router.findUnique({
      where: { registrationKey: key },
      select: { id: true },
    })

    if (!router) {
      return null
    }

    return this.mikrotikService.buildStatusHtml()
  }

  async rotateRadiusSecret(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
      include: this.routerInclude,
    })

    if (!router) {
      throw new NotFoundException('Router not found')
    }

    if (tenantId && router.tenantId !== tenantId) {
      throw new NotFoundException('Router not found')
    }

    const sharedSecret = this.getPlatformRadiusSharedSecret()
    await this.prisma.router.update({
      where: { id: router.id },
      data: {
        sharedSecretCiphertext: this.routerCredentialsService.encrypt(sharedSecret),
        onboardingStatus: RouterOnboardingStatus.SCRIPT_GENERATED,
        verificationStatus: 'SCRIPT_GENERATED',
        scriptGeneratedAt: new Date(),
        radiusClient: {
          update: {
            secretCiphertext: this.routerCredentialsService.encrypt(sharedSecret),
          },
        },
        nasClient: {
          update: {
            secret: sharedSecret,
            enabled: true,
            description: `AROFi dynamic NAS client for ${router.name}`,
          },
        },
      },
    })

    this.reloadFreeradiusNasClients()

    return this.getRouterSetup(router.id, tenantId)
  }

  reloadFreeradiusNasClients(): void {
    const { exec } = require('child_process')
    const strategies = [
      'echo "hup" | radmin -S /var/run/radiusd/radiusd.sock 2>/dev/null',
      'docker kill --signal=HUP $(docker ps -qf label=com.docker.compose.service=freeradius) 2>/dev/null',
      'docker kill --signal=HUP $(docker ps -qf name=freeradius) 2>/dev/null',
      'kill -HUP $(cat /var/run/radiusd/radiusd.pid) 2>/dev/null',
      'systemctl reload freeradius 2>/dev/null',
    ]
    exec(strategies.join(' || '), (err: Error | null) => {
      if (err) {
        this.logger.warn(`FreeRADIUS reload failed: ${err.message}`)
      } else {
        this.logger.log('FreeRADIUS NAS reload signal sent.')
      }
    })
  }

  private getPlatformRadiusSharedSecret() {
    return (
      this.mikrotikService.getRadiusServerConfig?.().sharedSecret ??
      process.env.RADIUS_SHARED_SECRET ??
      'change_me_radius_secret'
    )
  }

  private async upsertRadiusClientForProvisionedRouter(
    tx: Prisma.TransactionClient,
    router: {
      id: string
      tenantId: string
      name: string
      sharedSecretCiphertext: string
      radiusClient?: { id: string; shortName: string; secretCiphertext: string } | null
    },
    ipAddress: string,
  ) {
    if (router.radiusClient) {
      await tx.radiusClient.update({
        where: { id: router.radiusClient.id },
        data: {
          ipAddress,
          secretCiphertext: router.radiusClient.secretCiphertext || router.sharedSecretCiphertext,
        },
      })
      return
    }

    await tx.radiusClient.upsert({
      where: { routerId: router.id },
      update: {
        ipAddress,
        secretCiphertext: router.sharedSecretCiphertext,
      },
      create: {
        tenantId: router.tenantId,
        routerId: router.id,
        shortName: this.buildRadiusClientShortName(router.name),
        ipAddress,
        secretCiphertext: router.sharedSecretCiphertext,
      },
    })
  }

  private async upsertNasClientForProvisionedRouter(
    tx: Prisma.TransactionClient,
    router: {
      id: string
      tenantId: string
      name: string
      sharedSecretCiphertext: string
      nasClient?: { id: number; shortname: string } | null
      radiusClient?: { shortName: string } | null
    },
    nasIpAddress: string,
  ) {
    const sharedSecret = this.getPlatformRadiusSharedSecret()
    const preferredShortname =
      router.nasClient?.shortname ||
      router.radiusClient?.shortName ||
      this.buildRadiusClientShortName(router.name)

    if (router.nasClient) {
      const conflict = await tx.nasClient.findFirst({
        where: {
          nasname: nasIpAddress,
          shortname: preferredShortname,
          id: { not: router.nasClient.id },
        },
        select: { id: true, routerId: true, nasname: true, shortname: true },
      })

      if (conflict) {
        await tx.nasClient.update({
          where: { id: router.nasClient.id },
          data: {
            enabled: true,
            secret: sharedSecret,
            description: `AROFi dynamic NAS client for ${router.name}; learned NAS IP ${nasIpAddress} conflicted with existing NAS row ${conflict.id}`,
          },
        })
        return `NAS client IP ${nasIpAddress} was not changed because another NAS row already uses ${nasIpAddress}/${preferredShortname}.`
      }

      await tx.nasClient.update({
        where: { id: router.nasClient.id },
        data: {
          nasname: nasIpAddress,
          shortname: preferredShortname,
          secret: sharedSecret,
          enabled: true,
          description: `AROFi dynamic NAS client for ${router.name}`,
        },
      })
      return undefined
    }

    const existingByUnique = await tx.nasClient.findUnique({
      where: {
        nasname_shortname: {
          nasname: nasIpAddress,
          shortname: preferredShortname,
        },
      },
      select: { id: true, routerId: true },
    })

    if (existingByUnique) {
      if (!existingByUnique.routerId) {
        await tx.nasClient.update({
          where: { id: existingByUnique.id },
          data: {
            tenantId: router.tenantId,
            routerId: router.id,
            type: 'mikrotik',
            secret: sharedSecret,
            enabled: true,
            description: `AROFi dynamic NAS client for ${router.name}`,
          },
        })
        return undefined
      }

      return `NAS client was not created because ${nasIpAddress}/${preferredShortname} already belongs to another router.`
    }

    await tx.nasClient.create({
      data: {
        tenantId: router.tenantId,
        routerId: router.id,
        nasname: nasIpAddress,
        shortname: preferredShortname,
        type: 'mikrotik',
        secret: sharedSecret,
        description: `AROFi dynamic NAS client for ${router.name}`,
        enabled: true,
      },
    })

    return undefined
  }

  private async getSetupDiagnostics(routerId: string) {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
      include: {
        radiusClient: true,
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    })
    const nasCandidates = router ? this.getRouterNasCandidates(router) : []

    // Resolve radAcct using BOTH NAS IP candidates AND any known radiusUsername
    // linked to this router. Needed because routers behind NAT report a different
    // IP in radacct.nasipaddress than what was registered as the NAS placeholder.
    const resolveRadAcct = async () => {
      if (nasCandidates.length) {
        const byNas = await this.prisma.radAcct.findFirst({
          where: { nasipaddress: { in: nasCandidates } },
          orderBy: { radacctid: 'desc' },
        })
        if (byNas) return byNas
      }
      // Fallback: find the most recent activation on this router and look up by username
      const activation = await this.prisma.packageActivation.findFirst({
        where: { routerId },
        select: { radiusUsername: true },
        orderBy: { createdAt: 'desc' },
      })
      if (activation?.radiusUsername) {
        return this.prisma.radAcct.findFirst({
          where: { username: activation.radiusUsername },
          orderBy: { radacctid: 'desc' },
        })
      }
      return null
    }

    const [authEvent, accountingEvent, acceptedAuth, radAcct] = await Promise.all([
      this.prisma.radiusEvent.findFirst({
        where: {
          routerId,
          eventType: { in: [RadiusEventType.ACCESS_REQUEST, RadiusEventType.ACCESS_ACCEPT, RadiusEventType.ACCESS_REJECT] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.radiusEvent.findFirst({
        where: {
          routerId,
          eventType: { in: [RadiusEventType.ACCOUNTING_START, RadiusEventType.ACCOUNTING_INTERIM, RadiusEventType.ACCOUNTING_STOP] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.radiusEvent.findFirst({
        where: { routerId, eventType: RadiusEventType.ACCESS_ACCEPT },
        orderBy: { createdAt: 'desc' },
      }),
      resolveRadAcct(),
    ])

    // Management API: passes if TCP health check succeeded (direct IP) OR
    // if the router sent a heartbeat within the last 5 minutes (behind NAT).
    // Most routers in Uganda are behind CGNAT — heartbeat is the only signal.
    const tcpReachable =
      Boolean(router?.healthChecks[0]) &&
      (router?.healthChecks[0]?.status === RouterStatus.HEALTHY ||
        router?.healthChecks[0]?.status === RouterStatus.DEGRADED)
    const heartbeatAgeMs = router?.lastSeenAt
      ? Date.now() - new Date(router.lastSeenAt).getTime()
      : Infinity
    const heartbeatRecent = heartbeatAgeMs < 5 * 60 * 1000 // within 5 minutes

    return [
      {
        code: 'provisioning_callback',
        label: router?.lastProvisionedAt
          ? 'Provisioning callback received'
          : 'Script generated; waiting for router callback',
        ok: Boolean(router?.lastProvisionedAt),
        checkedAt: router?.lastProvisionedAt ?? router?.scriptGeneratedAt ?? null,
      },
      {
        code: 'management_api',
        label: tcpReachable
          ? 'RouterOS management API reachable'
          : heartbeatRecent
            ? 'Router heartbeat active (behind NAT — management API not directly reachable)'
            : 'Management API not reachable - hotspot/RADIUS may still be working',
        ok: tcpReachable || heartbeatRecent,
        checkedAt: router?.healthChecks[0]?.checkedAt ?? router?.lastSeenAt ?? null,
      },
      {
        code: 'radius_contact',
        label: authEvent ? 'Router RADIUS traffic detected' : 'Router has not contacted RADIUS yet',
        ok: Boolean(authEvent),
        checkedAt: authEvent?.createdAt ?? router?.lastRadiusSignalAt ?? null,
      },
      {
        code: 'accounting_contact',
        label:
          accountingEvent || radAcct
            ? 'Accounting traffic detected'
            : 'Accounting traffic has not been seen yet',
        ok: Boolean(accountingEvent || radAcct),
        checkedAt:
          accountingEvent?.createdAt ??
          radAcct?.acctupdatetime ??
          radAcct?.acctstarttime ??
          router?.lastAccountingSignalAt ??
          null,
      },
      {
        code: 'portal_walled_garden',
        label: 'Portal domain reachable through configured walled garden hosts',
        ok: Boolean((router?.portalWalledGardenHosts ?? []).length > 0 || process.env.PORTAL_PUBLIC_HOST),
        checkedAt: router?.scriptGeneratedAt ?? null,
      },
      {
        code: 'test_auth',
        label: acceptedAuth ? 'First test voucher/payment authenticated successfully' : 'No successful test authentication yet',
        ok: Boolean(acceptedAuth),
        checkedAt: acceptedAuth?.createdAt ?? null,
      },
    ]
  }

  // Decrypt that never throws: the admin password is optional and not pushed to
  // the router by the safe script, so a blank/legacy ciphertext must not break
  // script generation.
  private safeDecrypt(ciphertext: string): string {
    try {
      return this.routerCredentialsService.decrypt(ciphertext)
    } catch {
      return ''
    }
  }

  private buildRadiusClientShortName(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
  }

  private isPendingSelfServiceHost(host: string) {
    return /^pending-[a-z0-9-]+\.self-service$/i.test(host)
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
          .filter((value) => !this.isPendingSelfServiceHost(value)),
      ),
    )
  }

  private mapRouter(router: {
    id: string
    name: string
    identity: string | null
    vendor: string
    host: string
    apiPort: number
    connectionMode: RouterConnectionMode
    siteLabel: string | null
    model: string | null
    serialNumber: string | null
    routerOsVersion: string | null
    hotspotServerName?: string | null
    portalWalledGardenHosts?: string[]
    ttlAntiTetheringEnabled?: boolean
    remotePort?: number | null
    isRemotePortOpen?: boolean
    remoteSstpIp?: string | null
    remoteToken?: string | null
    remoteClientName?: string | null
    remoteAccessEnabled?: boolean
    remoteWgPubKey?: string | null
    verificationStatus?: string
    onboardingStatus?: string
    registrationKey?: string
    scriptGeneratedAt?: Date | null
    lastProvisionedAt?: Date | null
    lastRadiusSignalAt?: Date | null
    lastAccountingSignalAt?: Date | null
    lastAuthSignalAt?: Date | null
    status: RouterStatus
    healthMessage: string | null
    lastSeenAt: Date | null
    lastHealthCheckAt: Date | null
    lastLatencyMs: number | null
    activeSessionCount: number
    tags: string[]
    tenant: {
      id: string
      name: string
      domain: string | null
    }
    group: {
      id: string
      name: string
      code: string
    } | null
    hotspot: {
      id: string
      name: string
      nasIpAddress: string | null
    } | null
    radiusClient: {
      id: string
      shortName: string
      ipAddress: string
      status: string
      secretCiphertext: string
    } | null
    nasClient?: {
      id: number
      nasname: string
      shortname: string
      type: string
      enabled: boolean
    } | null
    sessions: Array<{
      id: string
    }>
    healthChecks: Array<{
      id: string
      status: RouterStatus
      latencyMs: number | null
      message: string | null
      checkedAt: Date
    }>
  }) {
    // router.sessions is always loaded with status:ACTIVE filter — it is the
    // authoritative count. The cached router.activeSessionCount can lag behind
    // after stale-session cleanup and must not override a zero live count.
    const activeSessions = router.sessions.length
    const live = this.resolveRouterLiveState(router, activeSessions)
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
      model: router.model,
      serialNumber: router.serialNumber,
      routerOsVersion: router.routerOsVersion,
      hotspotServerName: router.hotspotServerName,
      portalWalledGardenHosts: router.portalWalledGardenHosts ?? [],
      ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled ?? false,
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
      remoteWgPubKey: router.remoteWgPubKey ?? null,
      wgServerConfigured: Boolean(process.env.VPN_WG_SERVER_PUBKEY),
      lastRadiusSignalAt: router.lastRadiusSignalAt,
      lastAccountingSignalAt: router.lastAccountingSignalAt,
      lastAuthSignalAt: router.lastAuthSignalAt,
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

  private resolveRouterLiveState(
    router: {
      status: RouterStatus
      lastSeenAt: Date | null
      lastProvisionedAt?: Date | null
      lastRadiusSignalAt?: Date | null
      lastAccountingSignalAt?: Date | null
      lastAuthSignalAt?: Date | null
      healthChecks: Array<{
        status: RouterStatus
        checkedAt: Date
      }>
    },
    activeSessions: number,
  ) {
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

    const latest = signals.sort((left, right) => right.at.getTime() - left.at.getTime())[0]

    if (activeSessions > 0) {
      return {
        liveState: 'LIVE' as const,
        lastSignalAt: latest?.at ?? new Date(),
        lastSignalSource: latest?.source ?? 'active-session',
        secondsSinceLastSignal: latest ? Math.max(0, Math.round((Date.now() - latest.at.getTime()) / 1000)) : 0,
        message: 'Active sessions are present on this router',
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

  private generateSharedSecret() {
    return randomBytes(18).toString('base64url')
  }

  private resolvePortalHosts(configured: string[]) {
    const envHosts = [
      process.env.PORTAL_PUBLIC_HOST,
      process.env.API_PUBLIC_HOST,
      'app.arofi.net',
      'arofi.net',
      'pay.pesapal.com',
      'www.pesapal.com',
      'cybqa.pesapal.com',
      '*.pesapal.com',
      'sandbox.momodeveloper.mtn.com',
      'proxy.momoapi.mtn.com',
      'paymentsapi1.yo.co.ug',
    ].filter((value): value is string => Boolean(value))

    return Array.from(new Set([...configured, ...envHosts]))
  }

  async getRemoteAccess(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
      include: this.routerInclude,
    })

    if (!router) {
      throw new NotFoundException('Router not found')
    }

    if (tenantId && router.tenantId !== tenantId) {
      throw new NotFoundException('Router not found')
    }

    // Lazy initialization for legacy routers
    let updated = false
    const updateData: any = {}
    if (!router.remoteToken) {
      updateData.remoteToken = randomUUID()
      updated = true
    }
    if (!router.remotePort || router.remotePort < 31000 || router.remotePort > 31100) {
      updateData.remotePort = Math.floor(Math.random() * 100) + 31000
      updated = true
    }
    if (!router.remoteSstpIp) {
      // Always use deterministic WireGuard IP based on port (10.8.1.x), not random SSTP range
      const port = updateData.remotePort ?? router.remotePort ?? 31000
      updateData.remoteSstpIp = `10.8.1.${port - 31000 + 2}`
      updated = true
    }
    if (!router.remoteClientName) {
      updateData.remoteClientName = 'AROFI_REMOTE'
      updated = true
    }

    if (updated) {
      const updatedRouter = await this.prisma.router.update({
        where: { id: routerId },
        data: updateData,
        include: this.routerInclude,
      })
      if (updatedRouter.remoteToken && updatedRouter.remoteSstpIp) {
        await this.syncRadiusVpnCredentials(
          updatedRouter.id,
          updatedRouter.remoteToken,
          updatedRouter.remoteSstpIp,
        )
      }
      return this.mapRouter(updatedRouter)
    }

    return this.mapRouter(router)
  }

  async openRemotePort(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
    })

    if (!router) {
      throw new NotFoundException('Router not found')
    }

    if (tenantId && router.tenantId !== tenantId) {
      throw new NotFoundException('Router not found')
    }

    const remoteToken = router.remoteToken || randomUUID()
    const remotePort = (router.remotePort && router.remotePort >= 31000 && router.remotePort <= 31100)
      ? router.remotePort
      : Math.floor(Math.random() * 100) + 31000

    // Generate WireGuard keys if not already set
    let remoteWgPrivKey = router.remoteWgPrivKey
    let remoteWgPubKey = router.remoteWgPubKey
    if (!remoteWgPrivKey || !remoteWgPubKey) {
      const wgKeys = this.generateWireGuardKeyPair()
      remoteWgPrivKey = wgKeys.privateKey
      remoteWgPubKey = wgKeys.publicKey
    }

    // WireGuard IP is deterministic: port 31000 → 10.8.1.2, 31001 → 10.8.1.3, …
    // This avoids conflicts and lets the VPS sync without per-router RADIUS entries.
    const wgIp = `10.8.1.${remotePort - 31000 + 2}`
    const remoteSstpIp = wgIp

    const updatedRouter = await this.prisma.router.update({
      where: { id: routerId },
      data: {
        isRemotePortOpen: true,
        remoteAccessEnabled: true,
        remoteToken,
        remotePort,
        remoteSstpIp,
        remoteWgPrivKey,
        remoteWgPubKey,
      },
      include: this.routerInclude,
    })

    // Start TCP proxy forwarding to the router's WireGuard tunnel IP
    this.remoteProxyService.startProxy(remotePort, remoteSstpIp, 8291, updatedRouter.name)

    return this.mapRouter(updatedRouter)
  }

  private generateWireGuardKeyPair(): { privateKey: string; publicKey: string } {
    // Use require to avoid TypeScript's crypto namespace resolution issue
    // (KeyObject type) on this project's tsconfig that lacks "types": ["node"].
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cryptoMod = require('crypto') as {
      generateKeyPairSync: (type: string) => {
        privateKey: { export: (opts: object) => Buffer }
        publicKey: { export: (opts: object) => Buffer }
      }
    }
    const pair = cryptoMod.generateKeyPairSync('x25519')
    // The last 32 bytes of PKCS8/SPKI DER for X25519 are the raw key bytes.
    const privDer = pair.privateKey.export({ type: 'pkcs8', format: 'der' })
    const pubDer = pair.publicKey.export({ type: 'spki', format: 'der' })
    return {
      privateKey: privDer.subarray(-32).toString('base64'),
      publicKey: pubDer.subarray(-32).toString('base64'),
    }
  }

  async getWireGuardServerPeersConfig(): Promise<string> {
    const routers = await this.prisma.router.findMany({
      where: {
        remoteWgPubKey: { not: null },
        remoteSstpIp: { not: null },
        remoteAccessEnabled: true,
      },
      select: { id: true, name: true, remoteWgPubKey: true, remoteSstpIp: true },
    })

    return routers
      .filter((r) => r.remoteWgPubKey && r.remoteSstpIp)
      .map((r) => [
        `# Router: ${r.name}`,
        `[Peer]`,
        `PublicKey = ${r.remoteWgPubKey}`,
        `AllowedIPs = ${r.remoteSstpIp}/32`,
        '',
      ].join('\n'))
      .join('\n')
  }

  async closeRemotePort(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
    })

    if (!router) {
      throw new NotFoundException('Router not found')
    }

    if (tenantId && router.tenantId !== tenantId) {
      throw new NotFoundException('Router not found')
    }

    const updatedRouter = await this.prisma.router.update({
      where: { id: routerId },
      data: {
        isRemotePortOpen: false,
      },
      include: this.routerInclude,
    })

    // Stop TCP proxy forwarding
    if (router.remotePort) {
      this.remoteProxyService.stopProxy(router.remotePort)
    }

    return this.mapRouter(updatedRouter)
  }

  async testRemoteAccess(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
    })

    if (!router) {
      throw new NotFoundException('Router not found')
    }

    if (tenantId && router.tenantId !== tenantId) {
      throw new NotFoundException('Router not found')
    }

    const testedAt = new Date().toISOString()

    if (!router.isRemotePortOpen) {
      return { reachable: false, message: 'Remote port is closed. Open it first from the Status tab.', testedAt }
    }

    if (!router.remoteSstpIp) {
      return { reachable: false, message: 'No SSTP tunnel IP has been assigned to this router yet.', testedAt }
    }

    const probe = await this.remoteProxyService.probeTunnel(router.remoteSstpIp, 8291)
    return { ...probe, testedAt }
  }

  async enableAllRemotePorts() {
    const routers = await this.prisma.router.findMany({
      where: {
        remotePort: { not: null },
        remoteSstpIp: { not: null },
      },
    })

    await this.prisma.router.updateMany({
      data: {
        isRemotePortOpen: true,
        remoteAccessEnabled: true,
      },
    })

    // Start TCP proxies and sync to RADIUS for all routers
    for (const r of routers) {
      if (r.remotePort && r.remoteSstpIp && r.remoteToken) {
        await this.syncRadiusVpnCredentials(r.id, r.remoteToken, r.remoteSstpIp)
        this.remoteProxyService.startProxy(r.remotePort, r.remoteSstpIp, 8291, r.name)
      }
    }

    return { success: true }
  }

  getDeployWireguardScript(): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path')
      return fs.readFileSync(path.join(process.cwd(), 'scripts', 'deploy-wireguard.sh'), 'utf8')
    } catch {
      return null
    }
  }

  async getRemoteAccessInstallScript(token: string) {
    const router = await this.prisma.router.findFirst({
      where: { remoteToken: token },
    })

    if (!router) {
      return null
    }

    const domain = process.env.VPN_SERVER_HOST || process.env.API_PUBLIC_HOST || 'app.arofi.net'
    const wgPort = process.env.VPN_WG_PORT || '51820'
    const serverWgPubKey = process.env.VPN_WG_SERVER_PUBKEY || ''
    const wgInterfaceName = 'arofi-wg'

    // Generate WireGuard keys lazily if not yet provisioned (e.g. port was opened before this feature)
    let wgPrivKey = router.remoteWgPrivKey
    let wgIp = router.remoteSstpIp

    // Always use deterministic WireGuard IP based on port, even if remoteSstpIp was
    // previously set to a legacy SSTP 10.8.0.x address.
    const assignedPort = router.remotePort ?? 31000
    const deterministicWgIp = `10.8.1.${assignedPort - 31000 + 2}`

    if (!wgPrivKey || !router.remoteWgPubKey) {
      const wgKeys = this.generateWireGuardKeyPair()
      await this.prisma.router.update({
        where: { id: router.id },
        data: {
          remoteWgPrivKey: wgKeys.privateKey,
          remoteWgPubKey: wgKeys.publicKey,
          remoteSstpIp: deterministicWgIp,
        },
      })
      wgPrivKey = wgKeys.privateKey
    } else if (wgIp && !wgIp.startsWith('10.8.1.')) {
      // Migrate legacy 10.8.0.x IP to deterministic WireGuard IP
      await this.prisma.router.update({
        where: { id: router.id },
        data: { remoteSstpIp: deterministicWgIp },
      })
    }

    wgIp = deterministicWgIp

    if (!serverWgPubKey) {
      return [
        `# AROFi Remote Access — WireGuard Setup`,
        `# SETUP REQUIRED: The VPS WireGuard server has not been deployed yet.`,
        `# Ask your AROFi administrator to run the deploy script shown in Admin → Remote Access → Install`,
        `# then set VPN_WG_SERVER_PUBKEY in Coolify and redeploy the app.`,
        `# After that, run this install script again from the AROFi panel.`,
      ].join('\n')
    }

    return [
      `# AROFi Remote Access WinBox Tunnel (WireGuard)`,
      `# Generated for router: ${router.name}`,
      `# WireGuard works on all RouterOS 7 devices — no device-mode change needed.`,
      ``,
      `# Remove any previous AROFi remote-access tunnel`,
      `:do { /interface wireguard remove [find name="${wgInterfaceName}"] } on-error={}`,
      `:do { /ip address remove [find interface="${wgInterfaceName}"] } on-error={}`,
      `:do { /interface list member remove [find interface="${wgInterfaceName}"] } on-error={}`,
      `# Remove legacy SSTP client if present`,
      `:do { /interface sstp-client remove [find name="${router.remoteClientName || 'AROFI_REMOTE'}"] } on-error={}`,
      ``,
      `# Create WireGuard interface with pre-allocated keys`,
      `/interface wireguard add name="${wgInterfaceName}" private-key="${wgPrivKey}" listen-port=0 comment="AROFi Remote Access"`,
      `/ip address add address="${wgIp}/24" interface="${wgInterfaceName}" comment="AROFi Remote Access"`,
      ``,
      `# Add AROFi VPS as the WireGuard peer`,
      `/interface wireguard peers add interface="${wgInterfaceName}" public-key="${serverWgPubKey}" endpoint-address="${domain}" endpoint-port="${wgPort}" allowed-ips="10.8.1.0/24" persistent-keepalive=25 comment="AROFi VPS"`,
      ``,
      `# Allow WinBox (and API) through the WireGuard interface`,
      `:do { /interface list member add interface="${wgInterfaceName}" list=LAN } on-error={}`,
      ``,
      `:put "AROFi WireGuard remote access configured."`,
      `:put "  Router WireGuard IP: ${wgIp}"`,
      `:put "  VPS endpoint: ${domain}:${wgPort}"`,
      `:log info "AROFi WireGuard Remote Access configured for ${router.name}"`,
    ].join('\n')
  }

  private async syncAllRouterVpnCredentialsToRadius() {
    try {
      const routers = await this.prisma.router.findMany({
        where: {
          remoteToken: { not: null },
          remoteSstpIp: { not: null },
        },
      })
      for (const r of routers) {
        await this.syncRadiusVpnCredentials(r.id, r.remoteToken!, r.remoteSstpIp!)
      }
      this.logger.log(`Synchronized ${routers.length} router VPN credentials to FreeRADIUS.`)
    } catch (error) {
      this.logger.error(
        `Failed to synchronize router VPN credentials on startup: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async syncRadiusVpnCredentials(routerId: string, remoteToken: string, remoteSstpIp: string) {
    const username = `router-${routerId}`
    try {
      await this.prisma.$transaction(async (tx) => {
        // Clear existing rows to prevent duplicates
        await tx.radCheck.deleteMany({
          where: { username, attribute: 'Cleartext-Password' },
        })
        await tx.radReply.deleteMany({
          where: { username, attribute: 'Framed-IP-Address' },
        })

        // Insert fresh settings
        await tx.radCheck.create({
          data: {
            username,
            attribute: 'Cleartext-Password',
            op: ':=',
            value: remoteToken,
          },
        })
        await tx.radReply.create({
          data: {
            username,
            attribute: 'Framed-IP-Address',
            op: '=',
            value: remoteSstpIp,
          },
        })
      })
    } catch (error) {
      this.logger.error(
        `Failed to sync RADIUS VPN credentials for router "${routerId}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async checkRouterAlerts() {
    try {
      const routers = await this.prisma.router.findMany({
        where: { status: { not: RouterStatus.PENDING } },
        include: {
          tenant: true,
          healthChecks: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
        },
      })

      for (const router of routers) {
        // Resolve dynamic live state (handles heartbeat timeouts for NAT routers)
        const activeSessions = await this.prisma.networkSession.count({
          where: {
            routerId: router.id,
            status: SessionStatus.ACTIVE,
          },
        })
        const live = this.resolveRouterLiveState(router, activeSessions)
        const isOffline = live.liveState === 'OFFLINE'
        const hasAlerted = this.alertedRouters.has(router.id)

        if (isOffline && !hasAlerted) {
          this.alertedRouters.add(router.id)
          await this.sendRouterAlert(router, 'OFFLINE', live.secondsSinceLastSignal)
        } else if (!isOffline && hasAlerted) {
          this.alertedRouters.delete(router.id)
          await this.sendRouterAlert(router, 'ONLINE', 0)
        }
      }
    } catch (error) {
      this.logger.error(`Error checking router alerts: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async sendRouterAlert(router: any, state: 'ONLINE' | 'OFFLINE', secondsOffline: number | null) {
    const timeString = new Date().toLocaleString()
    const message = state === 'OFFLINE'
      ? `🚨 [ALERT] Router "${router.name}" (Tenant: ${router.tenant.name}) has gone OFFLINE!\nLast seen: ${router.lastSeenAt ? router.lastSeenAt.toLocaleString() : 'Never'}\nTime: ${timeString}`
      : `✅ [RECOVERY] Router "${router.name}" (Tenant: ${router.tenant.name}) is back ONLINE.\nTime: ${timeString}`

    this.logger.warn(`[ROUTER ALERT] ${message}`)

    // Send Telegram alert if configured
    const tgToken = process.env.ROUTER_ALERTS_TELEGRAM_BOT_TOKEN
    const tgChatId = process.env.ROUTER_ALERTS_TELEGRAM_CHAT_ID
    if (tgToken && tgChatId) {
      try {
        const url = `https://api.telegram.org/bot${tgToken}/sendMessage`
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            text: message,
          }),
        })
      } catch (err) {
        this.logger.error(`Failed to send Telegram alert: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Build the list of WhatsApp recipient numbers
    const recipients = new Set<string>()

    // 1. Add platform admin's phone if configured
    if (process.env.ROUTER_ALERTS_WHATSAPP_PHONE) {
      recipients.add(process.env.ROUTER_ALERTS_WHATSAPP_PHONE.replace('+', '').trim())
    }

    // 2. Add individual tenant/vendor's support phone if configured
    if (router.tenant?.supportPhone) {
      recipients.add(router.tenant.supportPhone.replace('+', '').trim())
    }

    // Send WhatsApp alert if configured (CallMeBot or Custom Gateway)
    const waUrl = process.env.ROUTER_ALERTS_WHATSAPP_URL
    const waApiKey = process.env.ROUTER_ALERTS_WHATSAPP_API_KEY
    const wahaUrl = process.env.WHATSAPP_GATEWAY_URL
    const wahaApiKey = process.env.WHATSAPP_GATEWAY_API_KEY

    for (const phone of recipients) {
      if (wahaUrl) {
        try {
          const chatId = phone.endsWith('@c.us') ? phone : `${phone}@c.us`
          const url = `${wahaUrl.replace(/\/$/, '')}/api/sendText`
          
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          }
          if (wahaApiKey) {
            headers['X-Api-Key'] = wahaApiKey
          }

          await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              chatId,
              text: message,
              session: 'default',
            }),
          })
        } catch (err) {
          this.logger.error(`Failed to send WhatsApp alert to ${phone} via WAHA: ${err instanceof Error ? err.message : String(err)}`)
        }
      } else if (waUrl) {
        try {
          let url = waUrl
          let method = 'POST'
          let headers: any = { 'Content-Type': 'application/json' }
          let body: any = JSON.stringify({ phone, message })

          if (waUrl.includes('callmebot.com')) {
            const encodedMessage = encodeURIComponent(message)
            url = `${waUrl}?phone=${phone}&text=${encodedMessage}&apikey=${waApiKey || ''}`
            method = 'GET'
            body = undefined
            headers = undefined
          }

          await fetch(url, {
            method,
            headers,
            body,
          })
        } catch (err) {
          this.logger.error(`Failed to send WhatsApp alert to ${phone}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  }
}
