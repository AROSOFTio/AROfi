import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  PackageActivationStatus,
  Prisma,
  RadiusClientStatus,
  RadiusEventType,
  RouterOnboardingStatus,
  RouterStatus,
  SessionStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { RecordRadiusAccountingEventDto } from './dto/record-radius-accounting-event.dto'
import { RecordRadiusAuthEventDto } from './dto/record-radius-auth-event.dto'
import { RadiusAuthorizationPolicyService } from './radius-authorization-policy.service'

@Injectable()
export class RadiusService {
  private readonly logger = new Logger(RadiusService.name)

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: RadiusAuthorizationPolicyService,
  ) {}

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
        take: 200,
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
    const router = await this.resolveRouter(dto.routerId, dto.nasIpAddress)

    if (router && router.tenantId !== dto.tenantId) {
      throw new BadRequestException('Router does not belong to the tenant')
    }

    if (dto.accepted) {
      const policyResult = await this.prisma.$transaction((tx) =>
        this.authorizationPolicy.authorize(tx, {
          username: dto.username,
          macAddress: dto.macAddress,
          routerId: router?.id ?? dto.routerId,
          ipAddress: dto.ipAddress,
        }),
      )

      if (!policyResult.accepted) {
        this.logger.warn(`Auth policy rejected ${dto.username}: ${policyResult.reason}`)
        return { action: 'reject', reason: policyResult.reason }
      }
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
        routerId: router?.id ?? dto.routerId,
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

    if (router?.id) {
      await this.prisma.router.update({
        where: { id: router.id },
        data: {
          status: RouterStatus.HEALTHY,
          onboardingStatus: dto.accepted
            ? RouterOnboardingStatus.VERIFIED_ONLINE
            : RouterOnboardingStatus.RADIUS_SEEN,
          verificationStatus: dto.accepted ? 'VERIFIED' : 'SCRIPT_GENERATED',
          lastSeenAt: now,
          lastRadiusSignalAt: now,
          lastAuthSignalAt: now,
          verifiedAt: dto.accepted ? now : undefined,
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
      const router = await this.resolveRouterInTransaction(tx, dto.routerId, dto.nasIpAddress)

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
          routerId: router?.id ?? dto.routerId,
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
          routerId: router?.id ?? dto.routerId,
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
          routerId: router?.id ?? dto.routerId,
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

      if (router?.id) {
        const activeSessionCount = await tx.networkSession.count({
          where: {
            routerId: router.id,
            status: SessionStatus.ACTIVE,
          },
        })

        await tx.router.update({
          where: { id: router.id },
          data: {
            status: RouterStatus.HEALTHY,
            onboardingStatus:
              dto.eventType === RadiusEventType.ACCOUNTING_START ||
              dto.eventType === RadiusEventType.ACCOUNTING_INTERIM
                ? RouterOnboardingStatus.VERIFIED_ONLINE
                : RouterOnboardingStatus.ACCOUNTING_SEEN,
            verificationStatus: 'VERIFIED',
            lastSeenAt: now,
            lastHealthCheckAt: now,
            lastRadiusSignalAt: now,
            lastAccountingSignalAt: now,
            verifiedAt: now,
            healthMessage: 'Recent RADIUS accounting traffic received',
            activeSessionCount,
          },
        })
      }

      if (session.activationId) {
        const activationSessions = await tx.networkSession.findMany({
          where: { activationId: session.activationId },
          select: { inputOctets: true, outputOctets: true },
        })
        const usedBytes = activationSessions.reduce(
          (total, item) => total + item.inputOctets + item.outputOctets,
          BigInt(0),
        )
        await tx.packageActivation.update({
          where: { id: session.activationId },
          data: { usedBytes },
        })
      }

      return {
        recorded: true,
        event,
        session,
      }
    })
  }

  async resetDeviceBinding(input: {
    activationId: string
    tenantId?: string
    adminUserId?: string
    newMacAddress?: string
    reason: string
  }) {
    if (!input.reason?.trim()) {
      throw new BadRequestException('A support reason is required to reset a device binding')
    }

    return this.prisma.$transaction(async (tx) => {
      const activation = await tx.packageActivation.findUnique({
        where: { id: input.activationId },
        include: { tenant: { include: { tenantSettings: true } }, radiusCredential: true },
      })

      if (!activation || (input.tenantId && activation.tenantId !== input.tenantId)) {
        throw new NotFoundException('Package activation not found')
      }

      const settings =
        activation.tenant.tenantSettings ??
        (await tx.tenantSetting.create({ data: { tenantId: activation.tenantId } }))

      if (!settings.allowDeviceReset) {
        await tx.deviceBindingReset.create({
          data: {
            tenantId: activation.tenantId,
            activationId: activation.id,
            adminUserId: input.adminUserId,
            oldMacAddress: activation.boundMacAddress,
            newMacAddress: input.newMacAddress,
            reason: input.reason,
            status: 'REJECTED',
          },
        })
        throw new BadRequestException('Device binding resets are disabled for this tenant')
      }

      if (
        settings.maxResetsPerActivation > 0 &&
        activation.deviceResetCount >= settings.maxResetsPerActivation
      ) {
        throw new BadRequestException('The device reset limit has been reached for this activation')
      }

      const normalizedNewMac = this.normalizeMac(input.newMacAddress) ?? null

      const updated = await tx.packageActivation.update({
        where: { id: activation.id },
        data: {
          boundMacAddress: normalizedNewMac,
          firstSeenAt: normalizedNewMac ? new Date() : null,
          deviceResetCount: { increment: 1 },
        },
      })

      if (activation.radiusCredential) {
        await tx.radiusCredential.update({
          where: { id: activation.radiusCredential.id },
          data: { boundMacAddress: normalizedNewMac },
        })
      }

      await tx.deviceBindingReset.create({
        data: {
          tenantId: activation.tenantId,
          activationId: activation.id,
          adminUserId: input.adminUserId,
          oldMacAddress: activation.boundMacAddress,
          newMacAddress: normalizedNewMac,
          reason: input.reason,
        },
      })

      await tx.auditLog.create({
        data: {
          tenantId: activation.tenantId,
          userId: input.adminUserId,
          action: 'activation.device_binding_reset',
          entity: 'PackageActivation',
          entityId: activation.id,
          severity: 'WARNING',
          details: this.toJsonValue({
            oldMacAddress: activation.boundMacAddress,
            newMacAddress: normalizedNewMac,
            reason: input.reason,
          }),
        },
      })

      return updated
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

  private async resolveRouter(routerId?: string, nasIpAddress?: string | null) {
    if (routerId) {
      return this.prisma.router.findUnique({ where: { id: routerId } })
    }

    if (!nasIpAddress) {
      return null
    }

    return this.prisma.router.findFirst({
      where: {
        OR: [
          { radiusNasIpAddress: nasIpAddress },
          { host: nasIpAddress },
          { radiusClient: { ipAddress: nasIpAddress } },
        ],
      },
    })
  }

  private async resolveRouterInTransaction(
    tx: Prisma.TransactionClient,
    routerId?: string,
    nasIpAddress?: string | null,
  ) {
    if (routerId) {
      return tx.router.findUnique({ where: { id: routerId } })
    }

    if (!nasIpAddress) {
      return null
    }

    return tx.router.findFirst({
      where: {
        OR: [
          { radiusNasIpAddress: nasIpAddress },
          { host: nasIpAddress },
          { radiusClient: { ipAddress: nasIpAddress } },
        ],
      },
    })
  }

  private normalizeMac(value?: string | null) {
    return value?.trim().toUpperCase().replace(/-/g, ':')
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
