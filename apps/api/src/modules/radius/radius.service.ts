import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  PackageActivationStatus,
  Prisma,
  RadiusClientStatus,
  RadiusEventType,
  RouterStatus,
  SessionStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { RecordRadiusAccountingEventDto } from './dto/record-radius-accounting-event.dto'
import { RecordRadiusAuthEventDto } from './dto/record-radius-auth-event.dto'

@Injectable()
export class RadiusService {
  private readonly authEventTypes = new Set<RadiusEventType>([
    RadiusEventType.ACCESS_ACCEPT,
    RadiusEventType.ACCESS_REJECT,
    RadiusEventType.ACCESS_REQUEST,
  ])

  private readonly accountingEventTypes = new Set<RadiusEventType>([
    RadiusEventType.ACCOUNTING_START,
    RadiusEventType.ACCOUNTING_INTERIM,
    RadiusEventType.ACCOUNTING_STOP,
  ])

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId?: string) {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const [clients, eventsToday, recentEvents] = await Promise.all([
      this.prisma.radiusClient.findMany({
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
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
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
      this.prisma.radiusEvent.findMany({
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
          hotspot: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
      }),
    ])

    return {
      summary: {
        activeClients: clients.filter((client) => client.status === RadiusClientStatus.ACTIVE).length,
        authEventsToday: eventsToday
          .filter((event) => this.authEventTypes.has(event.eventType))
          .reduce((total, event) => total + event._count._all, 0),
        accountingEventsToday: eventsToday
          .filter((event) => this.accountingEventTypes.has(event.eventType))
          .reduce((total, event) => total + event._count._all, 0),
      },
      clients,
      recentEvents,
    }
  }

  async recordAuthEvent(dto: RecordRadiusAuthEventDto) {
    const router = dto.routerId
      ? await this.prisma.router.findUnique({ where: { id: dto.routerId } })
      : null

    if (router && router.tenantId !== dto.tenantId) {
      throw new BadRequestException('Router does not belong to the tenant')
    }

    const existingSession =
      dto.radiusSessionId
        ? await this.prisma.networkSession.findUnique({
            where: {
              tenantId_radiusSessionId: {
                tenantId: dto.tenantId,
                radiusSessionId: dto.radiusSessionId,
              },
            },
          })
        : null

    const eventType = dto.accepted ? RadiusEventType.ACCESS_ACCEPT : RadiusEventType.ACCESS_REJECT
    const now = new Date()

    const event = await this.prisma.radiusEvent.create({
      data: {
        tenantId: dto.tenantId,
        routerId: dto.routerId,
        hotspotId: dto.hotspotId,
        sessionId: existingSession?.id,
        eventType,
        username: dto.username,
        customerReference: dto.customerReference,
        phoneNumber: this.normalizePhoneNumber(dto.phoneNumber),
        macAddress: dto.macAddress,
        ipAddress: dto.ipAddress,
        nasIpAddress: dto.nasIpAddress,
        authMethod: dto.authMethod,
        responseCode: dto.responseCode,
        message: dto.message,
        payload: this.toJsonValue(dto.payload ?? {}),
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
      },
    })

    if (dto.routerId) {
      await this.prisma.router.update({
        where: { id: dto.routerId },
        data: {
          status: RouterStatus.HEALTHY,
          lastSeenAt: now,
          healthMessage: dto.accepted
            ? 'Recent RADIUS authentication accepted'
            : 'Recent RADIUS authentication rejected',
        },
      })
    }

    return {
      recorded: true,
      event,
    }
  }

  async recordAccountingEvent(dto: RecordRadiusAccountingEventDto) {
    if (!this.accountingEventTypes.has(dto.eventType)) {
      throw new BadRequestException('Only accounting events are accepted on this endpoint')
    }

    const now = new Date()

    return this.prisma.$transaction(async (tx) => {
      const router = dto.routerId
        ? await tx.router.findUnique({ where: { id: dto.routerId } })
        : null

      if (router && router.tenantId !== dto.tenantId) {
        throw new BadRequestException('Router does not belong to the tenant')
      }

      const hotspot = dto.hotspotId
        ? await tx.hotspot.findUnique({ where: { id: dto.hotspotId } })
        : null

      if (hotspot && hotspot.tenantId !== dto.tenantId) {
        throw new BadRequestException('Hotspot does not belong to the tenant')
      }

      const linkage = await this.resolveSessionLinkage(tx, dto)
      const sessionStatus =
        dto.eventType === RadiusEventType.ACCOUNTING_STOP
          ? SessionStatus.CLOSED
          : SessionStatus.ACTIVE

      const session = await tx.networkSession.upsert({
        where: {
          tenantId_radiusSessionId: {
            tenantId: dto.tenantId,
            radiusSessionId: dto.radiusSessionId,
          },
        },
        update: {
          routerId: dto.routerId,
          hotspotId: dto.hotspotId ?? linkage.hotspotId,
          activationId: linkage.activationId,
          voucherRedemptionId: linkage.voucherRedemptionId,
          status: sessionStatus,
          username: dto.username,
          customerReference: dto.customerReference ?? linkage.customerReference,
          phoneNumber: this.normalizePhoneNumber(dto.phoneNumber) ?? linkage.phoneNumber,
          macAddress: dto.macAddress,
          ipAddress: dto.ipAddress,
          nasIpAddress: dto.nasIpAddress,
          packageName: dto.packageName ?? linkage.packageName,
          sessionTimeSeconds: this.parseNumber(dto.sessionTimeSeconds),
          inputOctets: this.parseBigInt(dto.inputOctets),
          outputOctets: this.parseBigInt(dto.outputOctets),
          lastAccountingAt: now,
          endedAt: sessionStatus === SessionStatus.CLOSED ? now : null,
        },
        create: {
          tenantId: dto.tenantId,
          routerId: dto.routerId,
          hotspotId: dto.hotspotId ?? linkage.hotspotId,
          activationId: linkage.activationId,
          voucherRedemptionId: linkage.voucherRedemptionId,
          radiusSessionId: dto.radiusSessionId,
          status: sessionStatus,
          username: dto.username,
          customerReference: dto.customerReference ?? linkage.customerReference,
          phoneNumber: this.normalizePhoneNumber(dto.phoneNumber) ?? linkage.phoneNumber,
          macAddress: dto.macAddress,
          ipAddress: dto.ipAddress,
          nasIpAddress: dto.nasIpAddress,
          packageName: dto.packageName ?? linkage.packageName,
          startedAt: now,
          sessionTimeSeconds: this.parseNumber(dto.sessionTimeSeconds),
          inputOctets: this.parseBigInt(dto.inputOctets),
          outputOctets: this.parseBigInt(dto.outputOctets),
          lastAccountingAt: now,
          endedAt: sessionStatus === SessionStatus.CLOSED ? now : null,
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
        },
      })

      const event = await tx.radiusEvent.create({
        data: {
          tenantId: dto.tenantId,
          routerId: dto.routerId,
          hotspotId: dto.hotspotId ?? linkage.hotspotId,
          sessionId: session.id,
          eventType: dto.eventType,
          username: dto.username,
          customerReference: dto.customerReference ?? linkage.customerReference,
          phoneNumber: this.normalizePhoneNumber(dto.phoneNumber) ?? linkage.phoneNumber,
          macAddress: dto.macAddress,
          ipAddress: dto.ipAddress,
          nasIpAddress: dto.nasIpAddress,
          authMethod: linkage.authMethod,
          responseCode: dto.responseCode,
          message: dto.message,
          payload: this.toJsonValue(dto.payload ?? {}),
        },
      })

      if (dto.routerId) {
        const activeSessionCount = await tx.networkSession.count({
          where: {
            routerId: dto.routerId,
            status: SessionStatus.ACTIVE,
          },
        })

        await tx.router.update({
          where: { id: dto.routerId },
          data: {
            status: RouterStatus.HEALTHY,
            lastSeenAt: now,
            lastHealthCheckAt: now,
            healthMessage: 'Recent RADIUS accounting traffic received',
            activeSessionCount,
          },
        })
      }

      return {
        recorded: true,
        event,
        session,
      }
    })
  }

  private async resolveSessionLinkage(
    tx: Prisma.TransactionClient,
    dto: RecordRadiusAccountingEventDto,
  ) {
    const normalizedPhone = this.normalizePhoneNumber(dto.phoneNumber)

    if (dto.activationId) {
      const activation = await tx.packageActivation.findUnique({
        where: { id: dto.activationId },
        include: {
          package: {
            select: {
              id: true,
              name: true,
            },
          },
          hotspot: {
            select: {
              id: true,
            },
          },
        },
      })

      if (!activation || activation.tenantId !== dto.tenantId) {
        throw new NotFoundException('Package activation not found for the tenant')
      }

      return {
        activationId: activation.id,
        voucherRedemptionId: activation.voucherRedemptionId,
        hotspotId: activation.hotspotId ?? activation.hotspot?.id ?? null,
        packageName: activation.package.name,
        customerReference: activation.customerReference,
        phoneNumber: activation.accessPhoneNumber,
        authMethod: activation.source,
      }
    }

    if (dto.username) {
      const voucher = await tx.voucher.findUnique({
        where: { code: dto.username },
        include: {
          redemption: true,
        },
      })

      if (voucher?.redemption && voucher.tenantId === dto.tenantId) {
        const activation = await tx.packageActivation.findUnique({
          where: {
            voucherRedemptionId: voucher.redemption.id,
          },
          include: {
            package: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })

        if (activation) {
          return {
            activationId: activation.id,
            voucherRedemptionId: voucher.redemption.id,
            hotspotId: voucher.redemption.hotspotId,
            packageName: activation.package.name,
            customerReference: activation.customerReference ?? voucher.customerReference,
            phoneNumber: activation.accessPhoneNumber,
            authMethod: 'VOUCHER',
          }
        }
      }
    }

    if (normalizedPhone || dto.customerReference || dto.username) {
      const activation = await tx.packageActivation.findFirst({
        where: {
          tenantId: dto.tenantId,
          status: PackageActivationStatus.ACTIVE,
          endsAt: {
            gt: new Date(),
          },
          OR: [
            ...(normalizedPhone ? [{ accessPhoneNumber: normalizedPhone }] : []),
            ...(dto.customerReference ? [{ customerReference: dto.customerReference }] : []),
            ...(dto.username ? [{ customerReference: dto.username }] : []),
          ],
        },
        include: {
          package: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (activation) {
        return {
          activationId: activation.id,
          voucherRedemptionId: activation.voucherRedemptionId,
          hotspotId: activation.hotspotId,
          packageName: activation.package.name,
          customerReference: activation.customerReference,
          phoneNumber: activation.accessPhoneNumber,
          authMethod: activation.source,
        }
      }
    }

    return {
      activationId: null,
      voucherRedemptionId: null,
      hotspotId: null,
      packageName: dto.packageName ?? null,
      customerReference: dto.customerReference ?? null,
      phoneNumber: normalizedPhone,
      authMethod: 'UNKNOWN',
    }
  }

  private normalizePhoneNumber(phoneNumber?: string) {
    if (!phoneNumber) {
      return null
    }

    const digits = phoneNumber.replace(/\D/g, '')

    if (/^256\d{9}$/.test(digits)) {
      return digits
    }

    if (/^0\d{9}$/.test(digits)) {
      return `256${digits.slice(1)}`
    }

    if (/^7\d{8}$/.test(digits)) {
      return `256${digits}`
    }

    return phoneNumber
  }

  private parseNumber(value?: string) {
    if (!value) {
      return 0
    }

    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : 0
  }

  private parseBigInt(value?: string) {
    if (!value) {
      return BigInt(0)
    }

    try {
      return BigInt(value)
    } catch {
      return BigInt(0)
    }
  }

  private toJsonValue(value: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value))
  }
}
