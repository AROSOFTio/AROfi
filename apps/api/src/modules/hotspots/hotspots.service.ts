import { randomBytes } from 'crypto'
import { Injectable, NotFoundException } from '@nestjs/common'
import { PackageActivationStatus, SessionStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { CreateHotspotDto } from './dto/create-hotspot.dto'

type HotspotWithRelations = {
  id: string
  name: string
  nasIpAddress: string | null
  secret: string | null
  createdAt: Date
  updatedAt: Date
  tenant: {
    id: string
    name: string
  }
  routers: Array<{
    id: string
    name: string
    status: string
    host: string
    identity: string | null
    siteLabel: string | null
  }>
}

@Injectable()
export class HotspotsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId?: string) {
    const hotspots = await this.prisma.hotspot.findMany({
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
            name: true,
            status: true,
            host: true,
            identity: true,
            siteLabel: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    })

    if (hotspots.length === 0) {
      return {
        summary: {
          totalHotspots: 0,
          configuredNas: 0,
          linkedRouters: 0,
          activeSessions: 0,
          activeActivations: 0,
          voucherRedemptions: 0,
        },
        items: [],
      }
    }

    const hotspotIds = hotspots.map((hotspot) => hotspot.id)

    const [sessionGroups, activationGroups, redemptionGroups] = await Promise.all([
      this.prisma.networkSession.groupBy({
        by: ['hotspotId', 'status'],
        where: {
          hotspotId: {
            in: hotspotIds,
          },
        },
        _count: {
          _all: true,
        },
        _max: {
          startedAt: true,
          lastAccountingAt: true,
        },
      }),
      this.prisma.packageActivation.groupBy({
        by: ['hotspotId', 'status'],
        where: {
          hotspotId: {
            in: hotspotIds,
          },
        },
        _count: {
          _all: true,
        },
        _max: {
          startedAt: true,
        },
      }),
      this.prisma.voucherRedemption.groupBy({
        by: ['hotspotId'],
        where: {
          hotspotId: {
            in: hotspotIds,
          },
        },
        _count: {
          _all: true,
        },
        _max: {
          createdAt: true,
        },
      }),
    ])

    const activeSessionsByHotspot = new Map<string, number>()
    const sessionActivityByHotspot = new Map<string, Date | null>()
    for (const group of sessionGroups) {
      if (!group.hotspotId) continue
      const hotspotId = group.hotspotId
      if (group.status === SessionStatus.ACTIVE) {
        activeSessionsByHotspot.set(hotspotId, group._count._all)
      }
      sessionActivityByHotspot.set(
        hotspotId,
        this.pickLatestDate(
          sessionActivityByHotspot.get(hotspotId) ?? null,
          group._max.startedAt,
          group._max.lastAccountingAt,
        ),
      )
    }

    const activationsByHotspot = new Map<string, number>()
    const activeActivationsByHotspot = new Map<string, number>()
    const activationActivityByHotspot = new Map<string, Date | null>()
    for (const group of activationGroups) {
      if (!group.hotspotId) continue
      const hotspotId = group.hotspotId
      activationsByHotspot.set(
        hotspotId,
        (activationsByHotspot.get(hotspotId) ?? 0) + group._count._all,
      )
      if (group.status === PackageActivationStatus.ACTIVE) {
        activeActivationsByHotspot.set(hotspotId, group._count._all)
      }
      activationActivityByHotspot.set(
        hotspotId,
        this.pickLatestDate(
          activationActivityByHotspot.get(hotspotId) ?? null,
          group._max.startedAt,
        ),
      )
    }

    const redemptionsByHotspot = new Map(
      redemptionGroups
        .filter((group) => Boolean(group.hotspotId))
        .map((group) => [group.hotspotId as string, group._count._all]),
    )
    const redemptionActivityByHotspot = new Map(
      redemptionGroups
        .filter((group) => Boolean(group.hotspotId))
        .map((group) => [group.hotspotId as string, group._max.createdAt ?? null]),
    )

    let configuredNas = 0
    let linkedRouters = 0
    let totalActiveSessions = 0
    let totalActiveActivations = 0
    let totalVoucherRedemptions = 0

    const items = hotspots.map((hotspot) => {
      const activeSessions = activeSessionsByHotspot.get(hotspot.id) ?? 0
      const activeActivations = activeActivationsByHotspot.get(hotspot.id) ?? 0
      const voucherRedemptions = redemptionsByHotspot.get(hotspot.id) ?? 0
      const routerCount = hotspot.routers.length
      const lastActivityAt = this.pickLatestDate(
        sessionActivityByHotspot.get(hotspot.id) ?? null,
        activationActivityByHotspot.get(hotspot.id) ?? null,
        redemptionActivityByHotspot.get(hotspot.id) ?? null,
      )

      if (hotspot.nasIpAddress) configuredNas += 1
      linkedRouters += routerCount
      totalActiveSessions += activeSessions
      totalActiveActivations += activeActivations
      totalVoucherRedemptions += voucherRedemptions

      return {
        id: hotspot.id,
        name: hotspot.name,
        nasIpAddress: hotspot.nasIpAddress,
        secretHint: hotspot.secret ? this.maskSecret(hotspot.secret) : null,
        tenant: hotspot.tenant,
        routerCount,
        activeSessions,
        activationCount: activationsByHotspot.get(hotspot.id) ?? 0,
        activeActivations,
        voucherRedemptions,
        lastActivityAt,
        createdAt: hotspot.createdAt,
        updatedAt: hotspot.updatedAt,
        routers: hotspot.routers.map((router) => ({
          id: router.id,
          name: router.name,
          status: router.status,
          host: router.host,
          identity: router.identity ?? router.name,
          siteLabel: router.siteLabel,
        })),
      }
    })

    return {
      summary: {
        totalHotspots: items.length,
        configuredNas,
        linkedRouters,
        activeSessions: totalActiveSessions,
        activeActivations: totalActiveActivations,
        voucherRedemptions: totalVoucherRedemptions,
      },
      items,
    }
  }

  async createHotspot(dto: CreateHotspotDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id: dto.tenantId,
      },
      select: {
        id: true,
      },
    })

    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    const hotspot = await this.prisma.hotspot.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name.trim(),
        nasIpAddress: dto.nasIpAddress?.trim() || null,
        secret: dto.secret?.trim() || this.generateHotspotSecret(),
      },
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
            name: true,
            status: true,
            host: true,
            identity: true,
            siteLabel: true,
          },
        },
      },
    })

    return this.mapCreatedHotspot(hotspot)
  }

  private mapCreatedHotspot(hotspot: HotspotWithRelations) {
    return {
      id: hotspot.id,
      name: hotspot.name,
      nasIpAddress: hotspot.nasIpAddress,
      secretHint: hotspot.secret ? this.maskSecret(hotspot.secret) : null,
      tenant: hotspot.tenant,
      routerCount: hotspot.routers.length,
      activeSessions: 0,
      activationCount: 0,
      activeActivations: 0,
      voucherRedemptions: 0,
      lastActivityAt: null,
      createdAt: hotspot.createdAt,
      updatedAt: hotspot.updatedAt,
      routers: hotspot.routers.map((router) => ({
        id: router.id,
        name: router.name,
        status: router.status,
        host: router.host,
        identity: router.identity ?? router.name,
        siteLabel: router.siteLabel,
      })),
    }
  }

  private generateHotspotSecret() {
    return randomBytes(12).toString('hex')
  }

  private maskSecret(secret: string) {
    if (secret.length <= 6) {
      return `${secret.slice(0, 1)}***${secret.slice(-1)}`
    }

    return `${secret.slice(0, 3)}***${secret.slice(-3)}`
  }

  private pickLatestDate(...values: Array<Date | null | undefined>) {
    let latest: Date | null = null
    for (const value of values) {
      if (value instanceof Date && (!latest || value > latest)) {
        latest = value
      }
    }
    return latest
  }
}
