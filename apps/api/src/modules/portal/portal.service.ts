import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  PackageActivationStatus,
  PaymentStatus,
  Prisma,
  SessionStatus,
} from '@prisma/client'
import { createHmac, timingSafeEqual } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PaymentsService } from '../payments/payments.service'
import { VouchersService } from '../vouchers/vouchers.service'
import { PortalLoginDto } from './dto/portal-login.dto'
import { PortalRedeemVoucherDto } from './dto/portal-redeem-voucher.dto'

type PortalTokenPayload = {
  tenantId: string
  phoneNumber: string
  issuedAt: number
  expiresAt: number
}

@Injectable()
export class PortalService {
  private readonly portalTokenLifetimeMs = 12 * 60 * 60 * 1000

  private readonly activationInclude = {
    package: {
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
      },
    },
  }

  private readonly paymentInclude = {
    package: {
      select: {
        id: true,
        name: true,
        code: true,
        durationMinutes: true,
      },
    },
    activation: {
      include: this.activationInclude,
    },
  }

  private readonly sessionInclude = {
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
      include: this.activationInclude,
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

  private readonly redemptionInclude = {
    voucher: {
      select: {
        id: true,
        code: true,
        status: true,
      },
    },
    package: {
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
      },
    },
    activation: {
      include: this.activationInclude,
    },
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentsService: PaymentsService,
    private readonly vouchersService: VouchersService,
  ) {}

  async getContext(tenantDomain?: string, phoneNumber?: string, authorization?: string) {
    const context = await this.paymentsService.getPortalContext(tenantDomain, phoneNumber)
    const accessToken = this.extractBearerToken(authorization)

    if (!accessToken) {
      return {
        ...context,
        session: null,
      }
    }

    try {
      return {
        ...context,
        session: await this.getSessionFromAccessToken(accessToken),
      }
    } catch {
      return {
        ...context,
        session: null,
      }
    }
  }

  async login(dto: PortalLoginDto) {
    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber)
    const context = await this.paymentsService.getPortalContext(dto.tenantDomain, phoneNumber)
    const session = await this.buildCustomerSession(context.tenant.id, phoneNumber)

    if (!session.summary.hasActiveAccess) {
      throw new UnauthorizedException(
        'No active internet access was found for this phone number. Buy a package or redeem a voucher first.',
      )
    }

    const accessToken = this.createAccessToken({
      tenantId: context.tenant.id,
      phoneNumber,
      issuedAt: Date.now(),
      expiresAt: Date.now() + this.portalTokenLifetimeMs,
    })

    return {
      accessToken,
      session: await this.getSessionFromAccessToken(accessToken),
    }
  }

  async getSession(authorization?: string) {
    const accessToken = this.extractBearerToken(authorization)

    if (!accessToken) {
      throw new UnauthorizedException('Portal access token is required')
    }

    return this.getSessionFromAccessToken(accessToken)
  }

  async redeemVoucher(dto: PortalRedeemVoucherDto) {
    const phoneNumber =
      this.tryNormalizePhoneNumber(dto.phoneNumber) ??
      this.tryNormalizePhoneNumber(dto.customerReference)
    const customerReference = dto.customerReference?.trim() || phoneNumber || 'portal-customer'

    const result = await this.vouchersService.redeemVoucher({
      code: dto.code.trim(),
      hotspotId: dto.hotspotId,
      sessionReference: dto.sessionReference,
      customerReference,
      accessPhoneNumber: phoneNumber,
    })

    if (!phoneNumber) {
      return {
        ...result,
        accessToken: null,
        session: null,
      }
    }

    const accessToken = this.createAccessToken({
      tenantId: result.redemption.tenantId,
      phoneNumber,
      issuedAt: Date.now(),
      expiresAt: Date.now() + this.portalTokenLifetimeMs,
    })

    return {
      ...result,
      accessToken,
      session: await this.getSessionFromAccessToken(accessToken),
    }
  }

  private async getSessionFromAccessToken(accessToken: string) {
    const payload = this.verifyAccessToken(accessToken)
    return this.buildCustomerSession(payload.tenantId, payload.phoneNumber, new Date(payload.expiresAt))
  }

  private async buildCustomerSession(tenantId: string, phoneNumber: string, tokenExpiresAt?: Date) {
    const phoneVariants = this.buildPhoneVariants(phoneNumber)
    const now = new Date()
    const activationWhere = {
      tenantId,
      OR: [
        {
          accessPhoneNumber: {
            in: phoneVariants,
          },
        },
        {
          customerReference: {
            in: phoneVariants,
          },
        },
      ],
    } satisfies Prisma.PackageActivationWhereInput
    const sessionWhere = {
      tenantId,
      OR: [
        {
          phoneNumber: {
            in: phoneVariants,
          },
        },
        {
          customerReference: {
            in: phoneVariants,
          },
        },
        {
          username: {
            in: phoneVariants,
          },
        },
      ],
    } satisfies Prisma.NetworkSessionWhereInput
    const redemptionWhere = {
      tenantId,
      customerReference: {
        in: phoneVariants,
      },
    } satisfies Prisma.VoucherRedemptionWhereInput

    const [tenant, activeActivation, recentActivations, recentPayments, recentSessions, recentRedemptions] =
      await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: {
            id: true,
            name: true,
            domain: true,
          },
        }),
        this.prisma.packageActivation.findFirst({
          where: {
            ...activationWhere,
            status: PackageActivationStatus.ACTIVE,
            endsAt: {
              gt: now,
            },
          },
          include: this.activationInclude,
          orderBy: [{ endsAt: 'asc' }, { createdAt: 'desc' }],
        }),
        this.prisma.packageActivation.findMany({
          where: activationWhere,
          include: this.activationInclude,
          orderBy: { createdAt: 'desc' },
          take: 6,
        }),
        this.prisma.payment.findMany({
          where: {
            tenantId,
            phoneNumber,
          },
          include: this.paymentInclude,
          orderBy: { createdAt: 'desc' },
          take: 6,
        }),
        this.prisma.networkSession.findMany({
          where: sessionWhere,
          include: this.sessionInclude,
          orderBy: { startedAt: 'desc' },
          take: 8,
        }),
        this.prisma.voucherRedemption.findMany({
          where: redemptionWhere,
          include: this.redemptionInclude,
          orderBy: { createdAt: 'desc' },
          take: 6,
        }),
      ])

    if (!tenant) {
      throw new NotFoundException('Portal tenant not found')
    }

    const activeSession = recentSessions.find((session) => session.status === SessionStatus.ACTIVE) ?? null
    const totalDataUsedMb = recentSessions.reduce(
      (total, session) => total + this.toMegabytes(session.inputOctets + session.outputOctets),
      0,
    )
    const pendingPaymentStatuses: PaymentStatus[] = [
      PaymentStatus.INITIATED,
      PaymentStatus.PENDING,
      PaymentStatus.INDETERMINATE,
    ]

    return {
      authenticatedAt: new Date().toISOString(),
      tokenExpiresAt: tokenExpiresAt?.toISOString() ?? null,
      tenant,
      customer: {
        phoneNumber,
        customerReference:
          activeActivation?.customerReference ??
          activeSession?.customerReference ??
          recentPayments[0]?.customerReference ??
          recentRedemptions[0]?.customerReference ??
          phoneNumber,
      },
      summary: {
        hasActiveAccess: Boolean(activeActivation || activeSession),
        activeMinutesRemaining: activeActivation
          ? Math.max(0, Math.round((activeActivation.endsAt.getTime() - now.getTime()) / 60000))
          : 0,
        recentSessionCount: recentSessions.length,
        pendingPayments: recentPayments.filter((payment) => pendingPaymentStatuses.includes(payment.status)).length,
        completedPayments: recentPayments.filter((payment) => payment.status === PaymentStatus.COMPLETED).length,
        totalDataUsedMb: Math.round(totalDataUsedMb * 100) / 100,
      },
      activeActivation: activeActivation ? this.mapActivation(activeActivation) : null,
      recentActivations: recentActivations.map((activation) => this.mapActivation(activation)),
      activeSession: activeSession ? this.mapSession(activeSession) : null,
      recentSessions: recentSessions.map((session) => this.mapSession(session)),
      recentPayments: recentPayments.map((payment) => this.mapPayment(payment)),
      recentVoucherRedemptions: recentRedemptions.map((redemption) => this.mapRedemption(redemption)),
    }
  }

  private mapActivation(activation: {
    id: string
    status: string
    source: string
    customerReference: string | null
    accessPhoneNumber: string | null
    startedAt: Date
    endsAt: Date
    package: {
      id: string
      name: string
      code: string
    }
    hotspot: {
      id: string
      name: string
    } | null
  }) {
    return {
      id: activation.id,
      status: activation.status,
      source: activation.source,
      customerReference: activation.customerReference,
      accessPhoneNumber: activation.accessPhoneNumber,
      startedAt: activation.startedAt,
      endsAt: activation.endsAt,
      package: activation.package,
      hotspot: activation.hotspot,
    }
  }

  private mapPayment(payment: {
    id: string
    status: PaymentStatus
    provider: string
    network: string
    amountUgx: number
    phoneNumber: string
    customerReference: string | null
    externalReference: string
    providerReference: string | null
    providerStatus: string | null
    statusMessage: string | null
    createdAt: Date
    completedAt: Date | null
    package: {
      id: string
      name: string
      code: string
      durationMinutes: number
    }
    activation: {
      id: string
      status: string
      source: string
      customerReference: string | null
      accessPhoneNumber: string | null
      startedAt: Date
      endsAt: Date
      package: {
        id: string
        name: string
        code: string
      }
      hotspot: {
        id: string
        name: string
      } | null
    } | null
  }) {
    return {
      id: payment.id,
      status: payment.status,
      provider: payment.provider,
      network: payment.network,
      amountUgx: payment.amountUgx,
      phoneNumber: payment.phoneNumber,
      customerReference: payment.customerReference,
      externalReference: payment.externalReference,
      providerReference: payment.providerReference,
      providerStatus: payment.providerStatus,
      statusMessage: payment.statusMessage,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
      package: payment.package,
      activation: payment.activation ? this.mapActivation(payment.activation) : null,
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
      source: string
      customerReference: string | null
      accessPhoneNumber: string | null
      startedAt: Date
      endsAt: Date
      package: {
        id: string
        name: string
        code: string
      }
      hotspot: {
        id: string
        name: string
      } | null
    } | null
    voucherRedemption: {
      id: string
      voucher: {
        id: string
        code: string
      }
    } | null
  }) {
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
        session.activation?.package.name ??
        session.packageName ??
        session.voucherRedemption?.voucher.code ??
        'Internet Access',
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      sessionTimeSeconds: session.sessionTimeSeconds,
      dataUsedMb: this.toMegabytes(session.inputOctets + session.outputOctets),
      inputMb: this.toMegabytes(session.inputOctets),
      outputMb: this.toMegabytes(session.outputOctets),
      lastAccountingAt: session.lastAccountingAt,
      router: session.router,
      hotspot: session.hotspot,
      activation: session.activation ? this.mapActivation(session.activation) : null,
      voucherRedemption: session.voucherRedemption,
    }
  }

  private mapRedemption(redemption: {
    id: string
    tenantId: string
    customerReference: string | null
    createdAt: Date
    voucher: {
      id: string
      code: string
      status: string
    }
    package: {
      id: string
      name: string
      code: string
    }
    hotspot: {
      id: string
      name: string
    } | null
    activation: {
      id: string
      status: string
      source: string
      customerReference: string | null
      accessPhoneNumber: string | null
      startedAt: Date
      endsAt: Date
      package: {
        id: string
        name: string
        code: string
      }
      hotspot: {
        id: string
        name: string
      } | null
    } | null
  }) {
    return {
      id: redemption.id,
      tenantId: redemption.tenantId,
      customerReference: redemption.customerReference,
      createdAt: redemption.createdAt,
      voucher: redemption.voucher,
      package: redemption.package,
      hotspot: redemption.hotspot,
      activation: redemption.activation ? this.mapActivation(redemption.activation) : null,
    }
  }

  private buildPhoneVariants(phoneNumber: string) {
    return Array.from(
      new Set([
        phoneNumber,
        `+${phoneNumber}`,
        `0${phoneNumber.slice(3)}`,
      ]),
    )
  }

  private normalizePhoneNumber(value: string) {
    const digits = value.replace(/\D/g, '')

    if (/^256\d{9}$/.test(digits)) {
      return digits
    }

    if (/^0\d{9}$/.test(digits)) {
      return `256${digits.slice(1)}`
    }

    if (/^7\d{8}$/.test(digits)) {
      return `256${digits}`
    }

    throw new UnauthorizedException('Phone number must be a valid Uganda mobile number')
  }

  private tryNormalizePhoneNumber(value?: string | null) {
    if (!value) {
      return undefined
    }

    try {
      return this.normalizePhoneNumber(value)
    } catch {
      return undefined
    }
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization) {
      return null
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() ?? null
  }

  private createAccessToken(payload: PortalTokenPayload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = createHmac('sha256', this.getTokenSecret())
      .update(encodedPayload)
      .digest('base64url')

    return `${encodedPayload}.${signature}`
  }

  private verifyAccessToken(accessToken: string) {
    const [encodedPayload, signature] = accessToken.split('.')

    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Portal access token is invalid')
    }

    const expectedSignature = createHmac('sha256', this.getTokenSecret())
      .update(encodedPayload)
      .digest('base64url')

    const providedBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expectedSignature)

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Portal access token signature mismatch')
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as PortalTokenPayload

    if (!payload.tenantId || !payload.phoneNumber || !payload.expiresAt) {
      throw new UnauthorizedException('Portal access token payload is incomplete')
    }

    if (payload.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Portal access token has expired')
    }

    return payload
  }

  private getTokenSecret() {
    return (
      this.configService.get<string>('PORTAL_TOKEN_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'change_this_in_production'
    )
  }

  private toMegabytes(value: bigint) {
    return Math.round((Number(value) / (1024 * 1024)) * 100) / 100
  }
}
