import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  RadiusEventType,
  RouterConnectionMode,
  RouterOnboardingStatus,
  RouterScriptMode,
  RouterStatus,
  SessionStatus,
} from '@prisma/client'
import { randomBytes, randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { CreateRouterDto } from './dto/create-router.dto'
import { CreateRouterGroupDto } from './dto/create-router-group.dto'
import { MikrotikService } from './mikrotik.service'
import { RouterCredentialsService } from './router-credentials.service'

@Injectable()
export class RoutersService {
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
  ) {}

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

    const mappedRouters = routers.map((router) => this.mapRouter(router))
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
        offlineRouters: mappedRouters.filter((router) => router.status === RouterStatus.OFFLINE).length,
        pendingRouters: mappedRouters.filter((router) => router.status === RouterStatus.PENDING).length,
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
        accountingEventsToday,
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
    const sharedSecret = dto.sharedSecret?.trim() || this.generateSharedSecret()
    const host = dto.host?.trim() || `pending-${registrationKey.slice(0, 12)}.self-service`
    const username = dto.username?.trim() || 'admin'
    const password = dto.password ?? ''
    const router = await this.prisma.router.create({
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
        radiusNasIpAddress: dto.radiusNasIpAddress ?? dto.host,
        hotspotServerName: dto.hotspotServerName,
        portalWalledGardenHosts: dto.portalWalledGardenHosts ?? [],
        ttlAntiTetheringEnabled: dto.ttlAntiTetheringEnabled ?? false,
        tags: dto.tags ?? [],
        radiusClient: {
          create: {
            tenantId: dto.tenantId,
            shortName: this.buildRadiusClientShortName(dto.name),
            ipAddress: dto.radiusNasIpAddress ?? host,
            secretCiphertext: this.routerCredentialsService.encrypt(sharedSecret),
          },
        },
      },
      include: this.routerInclude,
    })

    return this.getRouterSetup(router.id)
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

    const sharedSecret = this.routerCredentialsService.decrypt(router.sharedSecretCiphertext)
    const radiusServer = this.mikrotikService.getRadiusServerConfig(sharedSecret)

    return {
      router: this.mapRouter(router),
      radiusServer,
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
        hotspotServerName: router.hotspotServerName,
        portalHosts: this.resolvePortalHosts(router.portalWalledGardenHosts),
        ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled,
        mode: router.lastScriptMode,
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
    }
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

    const sharedSecret = this.generateSharedSecret()
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
      },
    })

    return this.getRouterSetup(router.id, tenantId)
  }

  private async getSetupDiagnostics(routerId: string) {
    const [router, authEvent, accountingEvent, acceptedAuth] = await Promise.all([
      this.prisma.router.findUnique({ where: { id: routerId } }),
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
    ])

    return [
      {
        code: 'radius_contact',
        label: authEvent ? 'Router RADIUS traffic detected' : 'Router has not contacted RADIUS yet',
        ok: Boolean(authEvent),
        checkedAt: authEvent?.createdAt ?? router?.lastRadiusSignalAt ?? null,
      },
      {
        code: 'accounting_contact',
        label: accountingEvent ? 'Accounting traffic detected' : 'Accounting traffic has not been seen yet',
        ok: Boolean(accountingEvent),
        checkedAt: accountingEvent?.createdAt ?? router?.lastAccountingSignalAt ?? null,
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

  private buildRadiusClientShortName(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
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
      lastRadiusSignalAt: router.lastRadiusSignalAt,
      lastAccountingSignalAt: router.lastAccountingSignalAt,
      lastAuthSignalAt: router.lastAuthSignalAt,
      status: router.status,
      healthMessage: router.healthMessage,
      lastSeenAt: router.lastSeenAt,
      lastHealthCheckAt: router.lastHealthCheckAt,
      lastLatencyMs: router.lastLatencyMs,
      activeSessions: router.sessions.length || router.activeSessionCount,
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

  private generateSharedSecret() {
    return randomBytes(18).toString('base64url')
  }

  private resolvePortalHosts(configured: string[]) {
    const envHosts = [
      process.env.PORTAL_PUBLIC_HOST,
      process.env.API_PUBLIC_HOST,
      process.env.PESAPAL_HOST,
      'pay.pesapal.com',
      'cybqa.pesapal.com',
    ].filter((value): value is string => Boolean(value))

    return Array.from(new Set([...configured, ...envHosts]))
  }
}
