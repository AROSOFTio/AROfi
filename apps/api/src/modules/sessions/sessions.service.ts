import { Injectable } from '@nestjs/common'
import { RadiusEventType, SessionStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly sessionInclude = {
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
        status: true,
      },
    },
    hotspot: {
      select: {
        id: true,
        name: true,
      },
    },
    activation: {
      include: {
        package: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    },
    voucherRedemption: {
      include: {
        voucher: {
          select: {
            id: true,
            code: true,
          },
        },
      },
    },
  }

  async getOverview(tenantId?: string) {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const [activeSessions, sessionsToday, recentEvents] = await Promise.all([
      this.prisma.networkSession.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          status: SessionStatus.ACTIVE,
        },
        include: this.sessionInclude,
        orderBy: {
          startedAt: 'desc',
        },
        take: 20,
      }),
      this.prisma.networkSession.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          startedAt: {
            gte: startOfDay,
          },
        },
        include: this.sessionInclude,
        orderBy: {
          startedAt: 'desc',
        },
        take: 100,
      }),
      this.prisma.radiusEvent.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          createdAt: {
            gte: startOfDay,
          },
        },
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
          hotspot: {
            select: {
              id: true,
              name: true,
            },
          },
          session: {
            select: {
              id: true,
              radiusSessionId: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 25,
      }),
    ])

    const usageByRouterMap = new Map<
      string,
      {
        id: string
        name: string
        tenant: {
          id: string
          name: string
        } | null
        activeSessions: number
        totalSessions: number
        totalDataMb: number
      }
    >()

    for (const session of sessionsToday) {
      const key = session.router?.id ?? 'unassigned'
      const existing =
        usageByRouterMap.get(key) ??
        {
          id: session.router?.id ?? 'unassigned',
          name: session.router?.name ?? 'Unassigned sessions',
          tenant: session.tenant,
          activeSessions: 0,
          totalSessions: 0,
          totalDataMb: 0,
        }

      existing.totalSessions += 1
      existing.totalDataMb += this.toMegabytes(session.inputOctets + session.outputOctets)
      if (session.status === SessionStatus.ACTIVE) {
        existing.activeSessions += 1
      }

      usageByRouterMap.set(key, existing)
    }

    const totalDataTodayMb = sessionsToday.reduce(
      (total, session) => total + this.toMegabytes(session.inputOctets + session.outputOctets),
      0,
    )
    const averageSessionMinutes =
      sessionsToday.length > 0
        ? Math.round(
            sessionsToday.reduce(
              (total, session) => total + Math.max(1, Math.round(session.sessionTimeSeconds / 60)),
              0,
            ) / sessionsToday.length,
          )
        : 0

    return {
      summary: {
        activeSessions: activeSessions.length,
        totalSessionsToday: sessionsToday.length,
        dataUsedTodayMb: totalDataTodayMb,
        averageSessionMinutes,
        acceptedAuthToday: recentEvents.filter((event) => event.eventType === RadiusEventType.ACCESS_ACCEPT).length,
        rejectedAuthToday: recentEvents.filter((event) => event.eventType === RadiusEventType.ACCESS_REJECT).length,
      },
      activeSessions: activeSessions.map((session) => this.mapSession(session)),
      recentSessions: sessionsToday.slice(0, 12).map((session) => this.mapSession(session)),
      recentEvents: recentEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        username: event.username,
        customerReference: event.customerReference,
        phoneNumber: event.phoneNumber,
        macAddress: event.macAddress,
        ipAddress: event.ipAddress,
        nasIpAddress: event.nasIpAddress,
        authMethod: event.authMethod,
        responseCode: event.responseCode,
        message: event.message,
        createdAt: event.createdAt,
        tenant: event.tenant,
        router: event.router,
        hotspot: event.hotspot,
        session: event.session,
      })),
      usageByRouter: Array.from(usageByRouterMap.values()).sort(
        (left, right) => right.totalDataMb - left.totalDataMb,
      ),
    }
  }

  private mapSession(session: {
    id: string
    radiusSessionId: string
    status: SessionStatus
    username: string
    customerReference: string | null
    phoneNumber: string | null
    macAddress: string | null
    ipAddress: string | null
    nasIpAddress: string | null
    packageName: string | null
    startedAt: Date
    endedAt: Date | null
    sessionTimeSeconds: number
    inputOctets: bigint
    outputOctets: bigint
    lastAccountingAt: Date | null
    tenant: {
      id: string
      name: string
    }
    router: {
      id: string
      name: string
      status: string
    } | null
    hotspot: {
      id: string
      name: string
    } | null
    activation: {
      id: string
      status: string
      endsAt: Date
      package: {
        id: string
        name: string
        code: string
      }
    } | null
    voucherRedemption: {
      id: string
      voucher: {
        id: string
        code: string
      }
    } | null
  }) {
    const totalOctets = session.inputOctets + session.outputOctets

    return {
      id: session.id,
      radiusSessionId: session.radiusSessionId,
      status: session.status,
      username: session.username,
      customerReference: session.customerReference,
      phoneNumber: session.phoneNumber,
      macAddress: session.macAddress,
      ipAddress: session.ipAddress,
      nasIpAddress: session.nasIpAddress,
      packageName:
        session.activation?.package.name ?? session.packageName ?? session.voucherRedemption?.voucher.code ?? 'Unmapped access',
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      sessionTimeSeconds: session.sessionTimeSeconds,
      dataUsedMb: this.toMegabytes(totalOctets),
      inputMb: this.toMegabytes(session.inputOctets),
      outputMb: this.toMegabytes(session.outputOctets),
      lastAccountingAt: session.lastAccountingAt,
      tenant: session.tenant,
      router: session.router,
      hotspot: session.hotspot,
      activation: session.activation
        ? {
            id: session.activation.id,
            status: session.activation.status,
            endsAt: session.activation.endsAt,
            package: session.activation.package,
          }
        : null,
      voucherRedemption: session.voucherRedemption
        ? {
            id: session.voucherRedemption.id,
            voucher: session.voucherRedemption.voucher,
          }
        : null,
    }
  }

  private toMegabytes(value: bigint) {
    return Math.round((Number(value) / (1024 * 1024)) * 100) / 100
  }
}
