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
  PackageActivationSource,
  PackageActivationStatus,
  PackageStatus,
  Prisma,
  RadiusCredentialStatus,
  RadiusEventType,
  RouterConnectionMode,
  RouterOnboardingStatus,
  RouterScriptMode,
  RouterStatus,
  SessionStatus,
} from '@prisma/client'
import { randomBytes, randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { RadiusCredentialService } from '../radius/radius-credential.service'
import { RadiusProbeService } from '../radius/radius-probe.service'
import { CreateRouterDto } from './dto/create-router.dto'
import { CreateRouterGroupDto } from './dto/create-router-group.dto'
import { MikrotikService } from './mikrotik.service'
import { RouterCredentialsService } from './router-credentials.service'

type MikrotikProvisioningReportInput = Record<string, string | string[] | undefined>

type ProvisioningReport = {
  status: 'ok' | 'failed' | 'unknown'
  ok: boolean
  checks: Record<string, string>
  errors: string[]
  notes: string[]
  raw: MikrotikProvisioningReportInput
}

@Injectable()
export class RoutersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoutersService.name)
  // The router heartbeats every 15s. A LIVE router must have signalled within
  // ~3 missed beats so the dashboard flips to offline within ~45s of the box
  // going down (and back to live within one beat of it returning), instead of
  // the old 15-minute window that showed routers "live" long after they died.
  private readonly routerLiveWindowSeconds = Number.parseInt(process.env.ROUTER_LIVE_WINDOW_SECONDS ?? '45', 10)
  private readonly routerStaleWindowSeconds = Number.parseInt(process.env.ROUTER_STALE_WINDOW_SECONDS ?? '120', 10)
  private readonly routerProbeIntervalMs = Number.parseInt(process.env.ROUTER_PROBE_INTERVAL_MS ?? '8000', 10)
  private probeTimer?: ReturnType<typeof setInterval>
  private probing = false

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

  // A reserved RFC 5737 TEST-NET address, never assignable to a real router.
  // Synthetic deployment tests tag their NAS-IP-Address with this so they can
  // never be mistaken for (or accidentally attributed to) real router traffic
  // in any nasIpAddress-keyed lookup elsewhere in the system.
  private readonly syntheticTestNasIp = '203.0.113.1'
  private readonly syntheticTestCustomerReference = 'AROFI_SYNTHETIC_TEST'

  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
    private readonly routerCredentialsService: RouterCredentialsService,
    private readonly radiusCredentialService: RadiusCredentialService,
    private readonly radiusProbeService: RadiusProbeService,
  ) {}

  onModuleInit() {
    // Background reachability probe: keeps lastSeenAt fresh for routers whose
    // management API is reachable (public IP / VPN), so the dashboard shows
    // them live within ~2s. Disabled with ROUTER_PROBE_ENABLED=false.
    if (process.env.ROUTER_PROBE_ENABLED === 'false') {
      return
    }
    this.probeTimer = setInterval(() => {
      void this.runReachabilityProbes()
    }, Math.max(2000, this.routerProbeIntervalMs))
    // Don't keep the process alive solely for this timer.
    if (typeof this.probeTimer.unref === 'function') {
      this.probeTimer.unref()
    }
  }

  onModuleDestroy() {
    if (this.probeTimer) {
      clearInterval(this.probeTimer)
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
      select: {
        id: true,
        status: true,
        onboardingStatus: true,
        radiusNasIpAddress: true,
        tenantId: true,
        name: true,
        sharedSecretCiphertext: true,
        radiusClient: { select: { id: true, shortName: true, secretCiphertext: true } },
        nasClient: { select: { id: true, shortname: true } },
      },
    })

    if (!router) {
      return null
    }

    const normalizedSourceIp = sourceIp.trim()
    const learnedNewIp = normalizedSourceIp && router.radiusNasIpAddress !== normalizedSourceIp
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
        ...(normalizedSourceIp && router.radiusNasIpAddress !== normalizedSourceIp
          ? { radiusNasIpAddress: normalizedSourceIp }
          : {}),
      },
    })

    if (learnedNewIp) {
      await this.upsertNasClientForProvisionedRouter(
        this.prisma,
        router,
        normalizedSourceIp,
      )
      this.reloadFreeradiusNasClients()
    }

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

    const routerNasCandidates = Array.from(
      new Set(routers.flatMap((router) => this.getRouterNasCandidates(router)).filter(Boolean)),
    )
    const recentAccountingRows = routerNasCandidates.length
      ? await this.prisma.radAcct.findMany({
          where: {
            nasipaddress: { in: routerNasCandidates },
            OR: [
              { acctupdatetime: { gte: startOfDay } },
              { acctstarttime: { gte: startOfDay } },
              { acctstoptime: { gte: startOfDay } },
            ],
          },
          orderBy: { radacctid: 'desc' },
          take: 500,
        })
      : []
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

    const registrationKey = randomUUID()
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

  async recordProvisioningSelfTestByKey(
    key: string,
    sourceIp: string,
    reportInput: MikrotikProvisioningReportInput = {},
  ) {
    const router = await this.prisma.router.findUnique({
      where: { registrationKey: key },
      include: this.routerInclude,
    })

    if (!router) {
      return null
    }

    const normalizedSourceIp = sourceIp.trim()
    const report = this.buildProvisioningReport(reportInput)
    const now = new Date()
    const healthMessage = report.ok
      ? 'MikroTik provisioning self-test passed on the router'
      : `MikroTik provisioning self-test failed: ${report.errors.join(', ') || 'unknown error'}`

    await this.prisma.$transaction(async (tx) => {
      await this.recordProvisioningHealthCheck(tx, {
        router,
        report,
        sourceIp: normalizedSourceIp,
        kind: 'mikrotik-self-test',
        checkedAt: now,
        message: healthMessage,
      })

      await tx.router.update({
        where: { id: router.id },
        data: {
          ...(normalizedSourceIp ? { radiusNasIpAddress: normalizedSourceIp } : {}),
          onboardingStatus: report.ok
            ? RouterOnboardingStatus.WAITING_FOR_RADIUS
            : RouterOnboardingStatus.CONFIG_ERROR,
          verificationStatus: report.ok ? 'OPERATOR_APPLIED' : 'FAILED',
          status: report.ok ? RouterStatus.DEGRADED : RouterStatus.DEGRADED,
          lastSeenAt: now,
          lastHealthCheckAt: now,
          healthMessage,
        },
      })
    })

    this.logger.log(
      `MikroTik self-test ${report.status} for router ${router.id} from ${normalizedSourceIp || 'unknown IP'} checks=${JSON.stringify(report.checks)} errors=${report.errors.join(',') || 'none'}`,
    )

    return {
      ok: report.ok,
      routerId: router.id,
      status: report.status,
      checks: report.checks,
      errors: report.errors,
      notes: report.notes,
    }
  }

  // The 60s on-router watchdog (arofi-watchdog) only calls home when it has
  // actually repaired something — a healthy router stays silent. Every call
  // here is itself proof of life, so it always bumps lastSeenAt even though
  // the report only carries repairs/checks (no overall pass/fail status).
  async recordWatchdogReportByKey(
    key: string,
    sourceIp: string,
    reportInput: MikrotikProvisioningReportInput = {},
  ) {
    const router = await this.prisma.router.findUnique({
      where: { registrationKey: key },
      select: { id: true, tenantId: true, activeSessionCount: true },
    })

    if (!router) {
      return null
    }

    const normalizedSourceIp = sourceIp.trim()
    const repairs = this.parseReportList(this.queryValue(reportInput.repairs))
    const checks = this.parseCheckSummary(this.queryValue(reportInput.checks))
    const now = new Date()
    const message =
      repairs.length > 0
        ? `Watchdog auto-repaired: ${repairs.join(', ')}`
        : 'Watchdog ran with no repairs needed'

    await this.prisma.$transaction(async (tx) => {
      await tx.routerHealthCheck.create({
        data: {
          tenantId: router.tenantId,
          routerId: router.id,
          status: RouterStatus.DEGRADED,
          message,
          activeUsers: router.activeSessionCount ?? 0,
          rawPayload: {
            kind: 'mikrotik-watchdog',
            sourceIp: normalizedSourceIp,
            repairs,
            checks,
            receivedAt: now.toISOString(),
          } as Prisma.InputJsonValue,
        },
      })

      await tx.router.update({
        where: { id: router.id },
        data: {
          lastSeenAt: now,
          ...(normalizedSourceIp ? { radiusNasIpAddress: normalizedSourceIp } : {}),
        },
      })
    })

    if (repairs.length > 0) {
      this.logger.warn(`AROFi watchdog repaired router ${router.id}: ${repairs.join(', ')}`)
    }

    return { ok: true, routerId: router.id, repairs, checks }
  }

  async markRouterProvisionedByKey(
    key: string,
    sourceIp: string,
    reportInput: MikrotikProvisioningReportInput = {},
  ) {
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
    const report = this.buildProvisioningReport(reportInput)
    const hasProvisioningReport =
      report.status !== 'unknown' ||
      Object.keys(report.checks).length > 0 ||
      report.errors.length > 0 ||
      report.notes.length > 0

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const warnings: string[] = baseWarning ? [baseWarning] : []
        let managementHost = router.host
        const shouldReplaceManagementHost =
          Boolean(normalizedSourceIp) && this.isPendingSelfServiceHost(router.host)

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
              hasProvisioningReport
                ? report.ok
                  ? 'Router self-test passed; waiting for first RADIUS packet.'
                  : `Router self-test failed: ${report.errors.join(', ') || 'unknown error'}.`
                : 'Router did not include a self-test report; waiting for heartbeat/RADIUS proof.',
            ].join(' ')
          : baseWarning

        if (hasProvisioningReport) {
          await this.recordProvisioningHealthCheck(tx, {
            router,
            report,
            sourceIp: normalizedSourceIp,
            kind: 'mikrotik-provisioned-callback',
            checkedAt: now,
            message: healthMessage,
          })
        }

        const updatedRouter = await tx.router.update({
          where: { id: router.id },
          data: {
            host: managementHost,
            radiusNasIpAddress: normalizedSourceIp || router.radiusNasIpAddress,
            onboardingStatus: hasProvisioningReport
              ? report.ok
                ? RouterOnboardingStatus.WAITING_FOR_RADIUS
                : RouterOnboardingStatus.CONFIG_ERROR
              : RouterOnboardingStatus.WAITING_FOR_ROUTER,
            verificationStatus: hasProvisioningReport
              ? report.ok
                ? 'OPERATOR_APPLIED'
                : 'FAILED'
              : 'OPERATOR_APPLIED',
            status: report.ok || !hasProvisioningReport ? RouterStatus.DEGRADED : RouterStatus.DEGRADED,
            lastProvisionedAt: now,
            lastSeenAt: now,
            lastHealthCheckAt: hasProvisioningReport ? now : router.lastHealthCheckAt,
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
        ok: !hasProvisioningReport || report.ok,
        callbackReceived: true,
        provisioningVerified: hasProvisioningReport ? report.ok : false,
        status: hasProvisioningReport ? report.status : 'unknown',
        routerId: result.routerId,
        learnedNasIpAddress: normalizedSourceIp || null,
        managementHost: result.managementHost,
        ...(hasProvisioningReport
          ? { checks: report.checks, errors: report.errors, notes: report.notes }
          : {}),
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
            onboardingStatus: hasProvisioningReport && !report.ok
              ? RouterOnboardingStatus.CONFIG_ERROR
              : RouterOnboardingStatus.WAITING_FOR_ROUTER,
            verificationStatus: hasProvisioningReport && !report.ok ? 'FAILED' : 'OPERATOR_APPLIED',
            lastProvisionedAt: now,
            lastSeenAt: now,
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
        ok: !hasProvisioningReport || report.ok,
        callbackReceived: true,
        provisioningVerified: hasProvisioningReport ? report.ok : false,
        status: hasProvisioningReport ? report.status : 'unknown',
        routerId: router.id,
        learnedNasIpAddress: normalizedSourceIp || null,
        managementHost: router.host,
        ...(hasProvisioningReport
          ? { checks: report.checks, errors: report.errors, notes: report.notes }
          : {}),
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
        portalHosts: this.resolvePortalHosts(router.portalWalledGardenHosts, radiusServer.host),
        ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled,
        mode: router.lastScriptMode,
        portalBaseUrl: `https://${process.env.PORTAL_PUBLIC_HOST ?? 'arofi.arosoft.io'}/portal`,
        hotspotNetworkName: router.siteLabel ?? router.hotspot?.name ?? router.name,
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

  async getRouterDiagnostics(routerId: string, tenantId?: string) {
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

    const [setupDiagnostics, provisioningReports] = await Promise.all([
      this.getSetupDiagnostics(router.id),
      this.getProvisioningReports(router.id),
    ])
    const latestProvisioningReport = provisioningReports[0] ?? null

    return {
      router: this.mapRouter(router),
      setupDiagnostics,
      latestProvisioningReport,
      provisioningReports,
      driftScore: this.computeDriftScore(provisioningReports),
      selfTest: {
        validationMode: 'router-reported',
        checkedAt: latestProvisioningReport?.checkedAt ?? null,
        status: latestProvisioningReport?.reportStatus ?? 'missing',
        checks: this.buildSelfTestDiagnostics(latestProvisioningReport),
        errors: latestProvisioningReport?.errors ?? [],
        notes: latestProvisioningReport?.notes ?? [],
      },
    }
  }

  async runRouterSelfTest(routerId: string, tenantId?: string) {
    const diagnostics = await this.getRouterDiagnostics(routerId, tenantId)
    const router = diagnostics.router
    const managementProbe =
      router.host && !this.isPendingSelfServiceHost(router.host)
        ? await this.mikrotikService.probeConnection(router.host, router.apiPort)
        : {
            reachable: false,
            status: RouterStatus.PENDING,
            message:
              'RouterOS management API is not reachable from AROFi. Local HotSpot checks come from the router-reported self-test callback.',
          }

    return {
      ...diagnostics,
      managementProbe,
      refreshedAt: new Date(),
      instruction:
        'To refresh on-device HotSpot/DHCP/NAT/file checks, rerun the MikroTik provisioning command so the router posts a new self-test report.',
    }
  }

  // A real, protocol-level end-to-end test: provisions a genuine RADIUS
  // credential (the same code path a real voucher redemption uses) and sends
  // an actual Access-Request to the live FreeRADIUS server. An Access-Accept
  // here proves "if this router reaches RADIUS with the right secret, a
  // voucher would authenticate" — it does NOT prove the router-to-RADIUS
  // network hop, the captive portal, or that a phone gets real internet.
  // Those remain gated on real signals (radiusAuthSeen/accountingSeen)
  // exactly as before; this is a fast pre-flight, not a replacement for them.
  // The NAS-IP-Address is tagged with a reserved TEST-NET sentinel so this
  // can never be mistaken for real router traffic by any nasIpAddress-keyed
  // lookup elsewhere in the system (see syntheticTestNasIp above).
  async runDeploymentTest(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
      select: { id: true, tenantId: true, name: true },
    })

    if (!router || (tenantId && router.tenantId !== tenantId)) {
      throw new NotFoundException('Router not found')
    }

    const steps: Array<{ name: string; ok: boolean; detail: string }> = []
    const startedAt = Date.now()
    let activationId: string | null = null

    try {
      const testPackage = await this.prisma.package.findFirst({
        where: { tenantId: router.tenantId, status: PackageStatus.ACTIVE },
        orderBy: { createdAt: 'asc' },
      })

      if (!testPackage) {
        steps.push({
          name: 'voucher_provisioned',
          ok: false,
          detail: 'No active package is configured for this tenant — create one before running a deployment test.',
        })
        return this.buildDeploymentTestResult(router.id, steps, startedAt)
      }

      const now = new Date()
      const credential = await this.prisma.$transaction(async (tx) => {
        const activation = await tx.packageActivation.create({
          data: {
            tenantId: router.tenantId,
            packageId: testPackage.id,
            routerId: router.id,
            source: PackageActivationSource.VOUCHER,
            status: PackageActivationStatus.ACTIVE,
            customerReference: this.syntheticTestCustomerReference,
            durationMinutes: 10,
            startedAt: now,
            endsAt: new Date(now.getTime() + 10 * 60 * 1000),
          },
        })
        activationId = activation.id

        return this.radiusCredentialService.provisionForActivation(tx, {
          tenantId: router.tenantId,
          activationId: activation.id,
          routerId: router.id,
        })
      })

      steps.push({
        name: 'voucher_provisioned',
        ok: credential.status === RadiusCredentialStatus.ACTIVE,
        detail: `Test credential ${credential.username} provisioned against the real radcheck table.`,
      })

      const radiusServer = this.mikrotikService.getRadiusServerConfig(this.getPlatformRadiusSharedSecret())

      try {
        const probe = await this.radiusProbeService.sendAccessRequest({
          host: radiusServer.host,
          port: radiusServer.authPort,
          secret: radiusServer.sharedSecret,
          nasIp: this.syntheticTestNasIp,
          username: credential.username,
          password: credential.password,
          timeoutMs: 5000,
        })

        steps.push({
          name: 'radius_access_request',
          ok: probe.accepted,
          detail: probe.accepted
            ? `FreeRADIUS sent Access-Accept in ${probe.latencyMs}ms.`
            : `FreeRADIUS rejected the test credential (code ${probe.code}). Check that the platform RADIUS shared secret matches what the router is configured with.`,
        })
      } catch (error) {
        steps.push({
          name: 'radius_access_request',
          ok: false,
          detail: `Could not reach RADIUS server ${radiusServer.host}:${radiusServer.authPort} — ${(error as Error).message}`,
        })
      }

      return this.buildDeploymentTestResult(router.id, steps, startedAt)
    } finally {
      if (activationId) {
        await this.prisma.$transaction(async (tx) => {
          await this.radiusCredentialService.disableForActivation(tx, activationId!, RadiusCredentialStatus.DISABLED)
          await tx.packageActivation.delete({ where: { id: activationId! } }).catch(() => undefined)
        })
      }
    }
  }

  private buildDeploymentTestResult(
    routerId: string,
    steps: Array<{ name: string; ok: boolean; detail: string }>,
    startedAt: number,
  ) {
    return {
      routerId,
      overallOk: steps.length > 0 && steps.every((step) => step.ok),
      latencyMs: Date.now() - startedAt,
      steps,
      checkedAt: new Date(),
      note:
        'This is a synthetic, protocol-level pre-flight test. It does not replace a real phone redemption — the router only shows ONLINE once a real client has actually authenticated and used data.',
    }
  }

  async getProvisioningScriptByKey(key: string) {
    const router = await this.prisma.router.findUnique({
      where: { registrationKey: key },
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
      radiusAuthPort: radiusServer.authPort,
      radiusAccountingPort: radiusServer.accountingPort,
      sharedSecret,
      adminUsername: router.username,
      adminPassword,
      hotspotServerName: router.hotspotServerName,
      portalHosts: this.resolvePortalHosts(router.portalWalledGardenHosts, radiusServer.host),
      ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled,
      mode: router.lastScriptMode,
      portalBaseUrl: `https://${process.env.PORTAL_PUBLIC_HOST ?? 'arofi.arosoft.io'}/portal`,
      hotspotNetworkName: router.siteLabel ?? router.name,
    })
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
      `https://${process.env.PORTAL_PUBLIC_HOST ?? 'arofi.arosoft.io'}/portal`,
    )
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

  private async recordProvisioningHealthCheck(
    tx: Prisma.TransactionClient,
    input: {
      router: { id: string; tenantId: string; activeSessionCount?: number | null }
      report: ProvisioningReport
      sourceIp: string
      kind: 'mikrotik-self-test' | 'mikrotik-provisioned-callback'
      checkedAt: Date
      message: string
    },
  ) {
    await tx.routerHealthCheck.create({
      data: {
        tenantId: input.router.tenantId,
        routerId: input.router.id,
        status: input.report.ok ? RouterStatus.DEGRADED : RouterStatus.DEGRADED,
        message: input.message,
        activeUsers: input.router.activeSessionCount ?? 0,
        rawPayload: {
          kind: input.kind,
          sourceIp: input.sourceIp,
          reportStatus: input.report.status,
          checks: input.report.checks,
          errors: input.report.errors,
          notes: input.report.notes,
          receivedAt: input.checkedAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
    })
  }

  private buildProvisioningReport(input: MikrotikProvisioningReportInput): ProvisioningReport {
    const statusValue = this.queryValue(input.status)?.trim().toLowerCase()
    const checks = this.parseCheckSummary(this.queryValue(input.checks))
    const explicitErrors = this.parseReportList(this.queryValue(input.errors))
    const notes = this.parseReportList(this.queryValue(input.notes))
    const failedCheckErrors = Object.entries(checks)
      .filter(([, value]) => value === 'fail' || value === 'failed' || value === 'error')
      .map(([key]) => `${key}_failed`)
    const errors = Array.from(new Set([...explicitErrors, ...failedCheckErrors]))

    const status: ProvisioningReport['status'] =
      statusValue === 'ok' || statusValue === 'passed' || statusValue === 'success'
        ? 'ok'
        : statusValue === 'failed' || statusValue === 'fail' || statusValue === 'error'
          ? 'failed'
          : errors.length > 0
            ? 'failed'
            : Object.keys(checks).length > 0
              ? 'ok'
              : 'unknown'

    return {
      status,
      ok: status === 'ok',
      checks,
      errors,
      notes,
      raw: input,
    }
  }

  private queryValue(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value
  }

  private parseReportList(value?: string) {
    return Array.from(
      new Set(
        (value ?? '')
          .split(/[;,|]/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    )
  }

  private parseCheckSummary(value?: string) {
    const checks: Record<string, string> = {}
    for (const token of this.parseReportList(value)) {
      const [rawKey, rawValue] = token.split('=')
      const key = rawKey?.trim()
      if (!key) {
        continue
      }
      checks[key] = (rawValue?.trim().toLowerCase() || 'ok').replace(/[^a-z0-9_-]/g, '')
    }
    return checks
  }

  private mapProvisioningReportHealthCheck(check: {
    id: string
    status: RouterStatus
    message: string | null
    rawPayload: Prisma.JsonValue | null
    checkedAt: Date
  }) {
    const raw =
      check.rawPayload && typeof check.rawPayload === 'object' && !Array.isArray(check.rawPayload)
        ? (check.rawPayload as Record<string, unknown>)
        : {}
    const kind = typeof raw.kind === 'string' ? raw.kind : 'unknown'
    const checks =
      raw.checks && typeof raw.checks === 'object' && !Array.isArray(raw.checks)
        ? (raw.checks as Record<string, string>)
        : {}
    const errors = Array.isArray(raw.errors) ? raw.errors.filter((item): item is string => typeof item === 'string') : []
    const notes = Array.isArray(raw.notes) ? raw.notes.filter((item): item is string => typeof item === 'string') : []

    return {
      id: check.id,
      kind,
      status: check.status,
      reportStatus: typeof raw.reportStatus === 'string' ? raw.reportStatus : 'unknown',
      message: check.message,
      checks,
      errors,
      notes,
      sourceIp: typeof raw.sourceIp === 'string' ? raw.sourceIp : null,
      checkedAt: check.checkedAt,
    }
  }

  private async getProvisioningReports(routerId: string) {
    const checks = await this.prisma.routerHealthCheck.findMany({
      where: { routerId },
      orderBy: { checkedAt: 'desc' },
      take: 20,
    })

    return checks
      .map((check) => this.mapProvisioningReportHealthCheck(check))
      .filter((check) => check.kind === 'mikrotik-self-test' || check.kind === 'mikrotik-provisioned-callback')
  }

  private buildSelfTestDiagnostics(latestReport?: ReturnType<RoutersService['mapProvisioningReportHealthCheck']> | null) {
    const checks = latestReport?.checks ?? {}
    const isOk = (code: string, accepted: string[] = ['ok']) => accepted.includes(checks[code])
    const checkedAt = latestReport?.checkedAt ?? null

    return [
      {
        code: 'hotspot',
        label: 'HotSpot server exists and is enabled',
        ok: isOk('hotspot'),
        value: checks.hotspot ?? 'missing',
        checkedAt,
      },
      {
        code: 'bridge',
        label: 'HotSpot bridge exists',
        ok: isOk('bridge', ['ok', 'skip']),
        value: checks.bridge ?? 'missing',
        checkedAt,
      },
      {
        code: 'bridge_port',
        label: 'Wireless or Ethernet interface is attached to the bridge',
        ok: isOk('bridge_port', ['ok', 'skip']),
        value: checks.bridge_port ?? 'missing',
        checkedAt,
      },
      {
        code: 'dhcp',
        label: 'DHCP server exists for hotspot clients',
        ok: isOk('dhcp', ['ok', 'skip']),
        value: checks.dhcp ?? 'missing',
        checkedAt,
      },
      {
        code: 'nat',
        label: 'NAT masquerade exists for hotspot clients',
        ok: isOk('nat', ['ok', 'skip']),
        value: checks.nat ?? 'missing',
        checkedAt,
      },
      {
        code: 'radius',
        label: 'RADIUS server is configured and reachable from the router',
        ok: isOk('radius') && isOk('radius_config'),
        value: checks.radius ?? 'missing',
        checkedAt,
      },
      {
        code: 'scheduler',
        label: 'Heartbeat scheduler exists',
        ok: isOk('scheduler'),
        value: checks.scheduler ?? 'missing',
        checkedAt,
      },
      {
        code: 'wireless_interfaces',
        label: 'Wireless interfaces detected or Ethernet fallback attached',
        ok: isOk('wireless', ['ok', 'ethernet', 'existing']),
        value: checks.wireless ?? 'missing',
        checkedAt,
      },
      {
        code: 'captive_portal_files',
        label: 'Captive portal login.html is installed',
        ok: isOk('files'),
        value: checks.files ?? 'missing',
        checkedAt,
      },
    ]
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

    const [authEvent, accountingEvent, acceptedAuth, radAcct, provisioningReports] = await Promise.all([
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
      nasCandidates.length
        ? this.prisma.radAcct.findFirst({
            where: { nasipaddress: { in: nasCandidates } },
            orderBy: { radacctid: 'desc' },
          })
        : Promise.resolve(null),
      this.getProvisioningReports(routerId),
    ])
    const latestProvisioningReport = provisioningReports[0] ?? null

    return [
      {
        code: 'local_self_test',
        label: latestProvisioningReport
          ? latestProvisioningReport.reportStatus === 'ok'
            ? 'Router local provisioning self-test passed'
            : 'Router local provisioning self-test failed'
          : 'Router local provisioning self-test has not reported yet',
        ok: latestProvisioningReport?.reportStatus === 'ok',
        checkedAt: latestProvisioningReport?.checkedAt ?? null,
      },
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
        label:
          router?.healthChecks[0] &&
          (router.healthChecks[0].status === RouterStatus.HEALTHY ||
            router.healthChecks[0].status === RouterStatus.DEGRADED)
            ? 'RouterOS management API reachable'
            : 'Management API not reachable - hotspot/RADIUS may still be working',
        ok:
          Boolean(router?.healthChecks[0]) &&
          (router?.healthChecks[0]?.status === RouterStatus.HEALTHY ||
            router?.healthChecks[0]?.status === RouterStatus.DEGRADED),
        checkedAt: router?.healthChecks[0]?.checkedAt ?? null,
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
        checkedAt: accountingEvent?.createdAt ?? radAcct?.acctupdatetime ?? radAcct?.acctstarttime ?? router?.lastAccountingSignalAt ?? null,
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
      rawPayload?: Prisma.JsonValue | null
    }>
  }) {
    const activeSessions = router.sessions.length || router.activeSessionCount
    const live = this.resolveRouterLiveState(router, activeSessions)
    const effectiveStatus =
      live.liveState === 'LIVE'
        ? RouterStatus.HEALTHY
        : live.liveState === 'STALE' && router.status === RouterStatus.OFFLINE
          ? RouterStatus.DEGRADED
          : router.status
    const health = this.computeHealthScore(router)
    // Failure #9/#10 enforced here: ONLINE is only ever true when the weighted
    // score clears the bar AND real client signals exist — a router that only
    // "ran the script" or only has a reachable management API stays WARNING.
    const dashboardState: 'ONLINE' | 'WARNING' | 'OFFLINE' = health.productionReady
      ? 'ONLINE'
      : live.liveState === 'OFFLINE' || !health.criticalOk
        ? 'OFFLINE'
        : 'WARNING'

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
      healthScore: health.score,
      productionReady: health.productionReady,
      dashboardState,
    }
  }

  // Weighted 0-100 score over the most recent self-test/watchdog report plus
  // real client signals. Critical subsystems (NAT/DHCP/Hotspot/RADIUS, and
  // above all real auth/accounting) are weighted far higher than cosmetic
  // ones (walled garden, portal files) — see Phase 3 of the deployment
  // redesign plan. Pure/synchronous so it's safe to call for every router in
  // a fleet overview list without extra queries.
  private computeHealthScore(router: {
    healthChecks: Array<{ rawPayload?: Prisma.JsonValue | null }>
    lastAuthSignalAt?: Date | null
    lastAccountingSignalAt?: Date | null
  }) {
    const raw = router.healthChecks[0]?.rawPayload
    const checks =
      raw && typeof raw === 'object' && !Array.isArray(raw) && typeof (raw as Record<string, unknown>).checks === 'object'
        ? ((raw as Record<string, unknown>).checks as Record<string, string>)
        : {}
    const isOk = (code: string, accepted: string[] = ['ok']) => accepted.includes(checks[code])

    const radiusAuthSeen = Boolean(router.lastAuthSignalAt)
    const accountingSeen = Boolean(router.lastAccountingSignalAt)

    const natOk = isOk('nat', ['ok', 'skip'])
    const dhcpOk = isOk('dhcp', ['ok', 'skip'])
    const hotspotOk = isOk('hotspot')
    const radiusOk = isOk('radius') && isOk('radius_config')

    const weighted: Array<[boolean, number]> = [
      [natOk, 15],
      [dhcpOk, 10],
      [hotspotOk, 15],
      [radiusOk, 10],
      [radiusAuthSeen, 20],
      [accountingSeen, 20],
      [isOk('bridge', ['ok', 'skip']), 3],
      [isOk('bridge_port', ['ok', 'skip']), 2],
      [isOk('files'), 2],
      [isOk('scheduler'), 2],
      [isOk('wireless', ['ok', 'ethernet', 'existing']), 1],
    ]

    const score = weighted.reduce((total, [ok, weight]) => total + (ok ? weight : 0), 0)
    const criticalOk = natOk && dhcpOk && hotspotOk && radiusOk

    return {
      score,
      criticalOk,
      productionReady: score >= 95 && radiusAuthSeen && accountingSeen,
    }
  }

  // Compares the latest self-test report against the oldest fully-passing
  // report in the recent history window — no new schema/migration needed,
  // this is derived entirely from existing RouterHealthCheck rows. Null when
  // there isn't yet a passing baseline to compare against.
  private computeDriftScore(
    provisioningReports: Array<{ reportStatus: string; checks: Record<string, string> }>,
  ) {
    const latest = provisioningReports[0]
    if (!latest) {
      return null
    }

    const baseline = [...provisioningReports].reverse().find((report) => report.reportStatus === 'ok')
    if (!baseline) {
      return null
    }

    const baselineOkKeys = Object.entries(baseline.checks)
      .filter(([, value]) => value === 'ok')
      .map(([key]) => key)

    if (baselineOkKeys.length === 0) {
      return null
    }

    const stillOk = baselineOkKeys.filter((key) => latest.checks[key] === 'ok').length
    return Math.round((stillOk / baselineOkKeys.length) * 100)
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

  private resolvePortalHosts(configured: string[], radiusHost?: string) {
    const envHosts = [
      process.env.PORTAL_PUBLIC_HOST,
      process.env.API_PUBLIC_HOST,
      'arofi.arosoftlabs.com',
      'arofi.arosoft.io',
      radiusHost,
      'pay.pesapal.com',
      'www.pesapal.com',
      'cybqa.pesapal.com',
      '*.pesapal.com',
      'sandbox.momodeveloper.mtn.com',
      'proxy.momoapi.mtn.com',
    ].filter((value): value is string => Boolean(value))

    return Array.from(new Set([...configured, ...envHosts]))
  }
}
