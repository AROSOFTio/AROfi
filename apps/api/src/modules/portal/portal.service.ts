import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  PackageActivationSource,
  PackageActivationStatus,
  PaymentStatus,
  Prisma,
  SessionStatus,
  ReconnectionStatus,
} from '@prisma/client'
import { createHmac, timingSafeEqual } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PackageActivationService } from '../payments/package-activation.service'
import { RealtimeEventsService } from '../events/realtime-events.service'
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
  private readonly logger = new Logger(PortalService.name)

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
    private readonly packageActivationService: PackageActivationService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async getContext(
    tenantDomain?: string,
    phoneNumber?: string,
    authorization?: string,
    hotspot?: {
      macAddress?: string
      ipAddress?: string
      routerId?: string
      routerKey?: string
      hotspotServerName?: string
      loginUrl?: string
    },
  ) {
    const resolvedHotspot = await this.resolveHotspotContext(hotspot)
    const resolvedTenantDomain =
      'tenantDomain' in resolvedHotspot ? resolvedHotspot.tenantDomain : undefined
    const resolvedTenantId =
      'tenantId' in resolvedHotspot ? (resolvedHotspot as { tenantId?: string }).tenantId : undefined
    const context = await this.paymentsService.getPortalContext(
      tenantDomain ?? resolvedTenantDomain,
      phoneNumber,
      resolvedTenantId,
    )
    const accessToken = this.extractBearerToken(authorization)
    const returningDevice = await this.detectReturningDevice(context.tenant.id, resolvedHotspot)

    if (!accessToken) {
      return {
        ...context,
        returningDevice,
        session: null,
      }
    }

    try {
      return {
        ...context,
        returningDevice,
        session: await this.getSessionFromAccessToken(accessToken),
      }
    } catch {
      return {
        ...context,
        returningDevice,
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

  async redeemVoucher(dto: PortalRedeemVoucherDto, userAgent?: string) {
    const phoneNumber =
      this.tryNormalizePhoneNumber(dto.phoneNumber) ??
      this.tryNormalizePhoneNumber(dto.customerReference)
    const customerReference = dto.customerReference?.trim() || phoneNumber || 'portal-customer'

    // Captive-portal voucher redemption ideally carries the device MAC and a
    // router identity so the credential can be device-bound for auto-connect.
    // Some valid entry paths (QR-code scans opening the portal directly)
    // can't supply them — redemption must still succeed; the customer falls
    // back to logging in with their voucher/phone number manually.

    let result: Awaited<ReturnType<VouchersService['redeemVoucher']>>
    try {
      // resolveHotspotContext used to run OUTSIDE this try, so any failure there
      // (a DB hiccup, a bad routerKey lookup) surfaced as an opaque
      // "Internal server error". Everything that can throw is now wrapped.
      const resolvedHotspot = await this.resolveHotspotContext({
        macAddress: dto.macAddress,
        ipAddress: dto.clientIp,
        routerId: dto.routerId,
        routerKey: dto.routerKey,
        hotspotServerName: dto.hotspotServerName,
        loginUrl: dto.loginUrl,
      })
      result = await this.vouchersService.redeemVoucher({
        code: this.normalizeVoucherCode(dto.code),
        hotspotId: dto.hotspotId,
        sessionReference: dto.sessionReference,
        customerReference,
        accessPhoneNumber: phoneNumber,
        macAddress: dto.macAddress,
        clientIp: dto.clientIp,
        routerId: resolvedHotspot.routerId,
        hotspotServerName: resolvedHotspot.hotspotServerName,
        userAgent,
      })
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }

      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `Voucher redemption failed for code ${this.maskVoucherCode(dto.code)} router=${dto.routerId ?? dto.routerKey ?? 'unknown'} mac=${this.normalizeMac(dto.macAddress) ?? 'unknown'}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(`Voucher could not be redeemed: ${message}`)
    }
    this.realtimeEvents.publish('voucher.redeemed', {
      tenantId: result.redemption.tenantId,
      routerId: result.activation?.routerId ?? null,
      data: {
        redemptionId: result.redemption.id,
        activationId: result.activation?.id ?? null,
        voucherCode: this.maskVoucherCode(dto.code),
      },
    })
    if (result.activation) {
      this.realtimeEvents.publish('activation.created', {
        tenantId: result.redemption.tenantId,
        routerId: result.activation.routerId ?? null,
        data: {
          activationId: result.activation.id,
          source: 'VOUCHER',
        },
      })
    }

    // The voucher is already redeemed and committed at this point. Everything
    // below is best-effort convenience (auto-connect payload + session token):
    // a failure here must NOT turn a successful redemption into a 500, or the
    // customer sees "internal error" even though their voucher was consumed.
    let reconnect: ReturnType<PortalService['issueReconnectLoginPayload']> | null = null
    try {
      if (result.activation) {
        // Re-fetch with radiusCredential included; the activation returned from
        // the redemption transaction may not carry that nested relation yet.
        const fullActivation = await this.prisma.packageActivation.findUnique({
          where: { id: result.activation.id },
          include: { radiusCredential: true },
        })
        reconnect = fullActivation ? this.issueReconnectLoginPayload(fullActivation, dto.loginUrl) : null
      }
    } catch (error) {
      this.logger.error(
        `Voucher redeemed but reconnect payload failed (code ${this.maskVoucherCode(dto.code)})`,
        error instanceof Error ? error.stack : String(error),
      )
    }

    if (!phoneNumber) {
      return { ...result, accessToken: null, session: null, reconnect }
    }

    let accessToken: string | null = null
    let session: Awaited<ReturnType<PortalService['getSessionFromAccessToken']>> | null = null
    try {
      accessToken = this.createAccessToken({
        tenantId: result.redemption.tenantId,
        phoneNumber,
        issuedAt: Date.now(),
        expiresAt: Date.now() + this.portalTokenLifetimeMs,
      })
      session = await this.getSessionFromAccessToken(accessToken)
    } catch (error) {
      this.logger.error(
        `Voucher redeemed but session token failed (code ${this.maskVoucherCode(dto.code)})`,
        error instanceof Error ? error.stack : String(error),
      )
    }

    return { ...result, accessToken, session, reconnect }
  }

  async reconnect(input: {
    macAddress?: string
    ipAddress?: string
    routerId?: string
    routerKey?: string
    hotspotServerName?: string
    loginUrl?: string
  }) {
    const resolvedHotspot = await this.resolveHotspotContext(input)
    const activation = await this.findActiveAccessByMacAndRouter(input.macAddress, resolvedHotspot.routerId, resolvedHotspot.tenantId)

    if (!activation) {
      throw new NotFoundException('No active access was found for this device')
    }

    await this.clearStaleSessionIfNeeded(activation.id)
    const payload = this.issueReconnectLoginPayload(activation, input.loginUrl)

    await this.markReconnectionAttempt({
      tenantId: activation.tenantId,
      activationId: activation.id,
      routerId: resolvedHotspot.routerId,
      macAddress: input.macAddress,
      ipAddress: input.ipAddress,
      status: ReconnectionStatus.LOGIN_PAYLOAD_ISSUED,
      message: 'Reconnect login payload issued for returning device',
      payload,
    })

    return {
      existingActiveAccess: true,
      message: 'Welcome back. Your package is still active.',
      activation: this.mapActivation(activation),
      reconnect: payload,
    }
  }

  async recoverVoucher(input: {
    transactionId: string
    routerKey?: string
    macAddress?: string
    ipAddress?: string
    routerId?: string
    hotspotServerName?: string
    loginUrl?: string
  }) {
    const transactionId = input.transactionId.trim()
    if (!transactionId) {
      throw new BadRequestException('Phone number or transaction ID is required')
    }

    const resolvedHotspot = await this.resolveHotspotContext({
      macAddress: input.macAddress,
      ipAddress: input.ipAddress,
      routerId: input.routerId,
      routerKey: input.routerKey,
      hotspotServerName: input.hotspotServerName,
      loginUrl: input.loginUrl,
    })

    // Recovery must be tenant-scoped. Without a resolved router/tenant the
    // lookup would search EVERY tenant's payments, letting anyone probe for
    // other operators' transaction references from an arbitrary origin.
    const resolvedTenantId = (resolvedHotspot as { tenantId?: string }).tenantId
    if (!resolvedTenantId) {
      throw new BadRequestException(
        'Recovery must be started from the WiFi login page so your network operator can be identified.',
      )
    }

    const normalizedPhone = this.tryNormalizePhoneNumber(transactionId)

    const payment = await this.prisma.payment.findFirst({
      where: {
        tenantId: resolvedTenantId,
        status: PaymentStatus.COMPLETED,
        OR: [
          { providerReference: transactionId },
          { externalReference: transactionId },
          ...(normalizedPhone ? [{ normalizedPhone }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    })

    let activationId: string | undefined

    if (payment) {
      const activation = await this.prisma.packageActivation.findUnique({
        where: { paymentId: payment.id },
      })
      if (activation) {
        activationId = activation.id
      }
    }

    if (!activationId) {
      const redemption = await this.prisma.voucherRedemption.findFirst({
        where: {
          tenantId: resolvedTenantId,
          OR: [
            { customerReference: transactionId },
            ...(normalizedPhone ? [{ customerReference: normalizedPhone }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      })
      if (redemption) {
        const activation = await this.prisma.packageActivation.findUnique({
          where: { voucherRedemptionId: redemption.id },
        })
        if (activation) {
          activationId = activation.id
        }
      }
    }

    // One uniform message for "nothing found" and "found but inactive":
    // responses must not confirm to a guesser whether a phone number or
    // transaction reference exists on this network.
    const recoveryNotPossible = () =>
      new NotFoundException(
        'No active access could be recovered with those details. Check the phone number or transaction ID, or contact support.',
      )

    if (!activationId) {
      throw recoveryNotPossible()
    }

    const activation = await this.prisma.packageActivation.findUnique({
      where: { id: activationId },
    })

    if (!activation || activation.status !== 'ACTIVE' || activation.endsAt <= new Date()) {
      throw recoveryNotPossible()
    }

    // Since they are explicitly recovering from the portal, they might be on a new device.
    // If we bind MAC, we should update it if the limit allows. But the easiest is just issuing
    // the payload. If radius rejects it due to MAC limits, that's fine.
    await this.clearStaleSessionIfNeeded(activation.id)
    const payload = this.issueReconnectLoginPayload(activation, input.loginUrl)

    await this.markReconnectionAttempt({
      tenantId: activation.tenantId,
      activationId: activation.id,
      routerId: resolvedHotspot.routerId,
      macAddress: input.macAddress,
      ipAddress: input.ipAddress,
      status: ReconnectionStatus.LOGIN_PAYLOAD_ISSUED,
      message: 'Voucher recovered by transaction ID or phone number',
      payload,
    })

    return {
      message: 'Voucher recovered successfully',
      reconnect: payload,
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
            logoUrl: true,
            brandColor: true,
            portalTemplate: true,
            supportPhone: true,
            supportEmail: true,
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
      throw new NotFoundException('Portal business not found')
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

  private async detectReturningDevice(
    tenantId: string,
    hotspot?: { macAddress?: string; ipAddress?: string; routerId?: string; loginUrl?: string },
  ) {
    const activation = await this.findActiveAccessByMacAndRouter(hotspot?.macAddress, hotspot?.routerId, tenantId)
    if (!activation) {
      return {
        existingActiveAccess: false,
        reason: hotspot?.macAddress ? 'No active access is bound to this device.' : 'MAC address was not provided by the hotspot.',
      }
    }

    // Source of truth for reconnect is the activation itself: ACTIVE, not
    // expired, MAC/router bound (already checked by
    // findActiveAccessByMacAndRouter above). Deliberately NOT gated on router
    // heartbeat freshness — the customer is physically connected to the
    // router right now (they are loading this portal through it), so a stale
    // backend heartbeat means the backend is behind, not that the customer
    // is offline. Blocking reconnect on it stranded paying users.
    await this.clearStaleSessionIfNeeded(activation.id)

    await this.markReconnectionAttempt({
      tenantId: activation.tenantId,
      activationId: activation.id,
      routerId: hotspot?.routerId,
      macAddress: hotspot?.macAddress,
      ipAddress: hotspot?.ipAddress,
      status: ReconnectionStatus.ALLOWED,
      message: 'Returning device has active access',
    })

    // Refresh Session-Timeout in radreply to the ACTUAL remaining seconds.
    // The original radreply was written at activation time with a fixed value.
    // If MikroTik re-authenticates on reconnect, it reads Session-Timeout again —
    // so we must update it to reflect real remaining time, not the original duration.
    const radiusUsername =
      activation.radiusCredential?.username ?? activation.radiusUsername
    if (radiusUsername) {
      const remainingSeconds = Math.max(
        1,
        Math.floor((activation.endsAt.getTime() - Date.now()) / 1000),
      )
      try {
        await this.prisma.radReply.updateMany({
          where: { username: radiusUsername, attribute: 'Session-Timeout' },
          data: { value: remainingSeconds.toString() },
        })
      } catch (err) {
        // Non-fatal — stale Session-Timeout is better than a broken reconnect.
        this.logger.warn(
          `detectReturningDevice: failed to refresh Session-Timeout for ${radiusUsername}: ${err instanceof Error ? err.message : err}`,
        )
      }
    }

    return {
      existingActiveAccess: true,
      message: 'Welcome back. Your package is still active.',
      activation: this.mapActivation(activation),
      reconnect: this.issueReconnectLoginPayload(activation, hotspot?.loginUrl),
    }
  }

  private async resolveHotspotContext(hotspot?: {
    macAddress?: string
    ipAddress?: string
    routerId?: string
    routerKey?: string
    hotspotServerName?: string
    loginUrl?: string
  }) {
    if (!hotspot?.routerKey) {
      return hotspot ?? {}
    }

    const router = await this.prisma.router.findUnique({
      where: { registrationKey: hotspot.routerKey },
      select: {
        id: true,
        tenantId: true,
        hotspotServerName: true,
        tenant: {
          select: {
            domain: true,
          },
        },
      },
    })

    if (!router) {
      return hotspot
    }

    return {
      ...hotspot,
      routerId: hotspot.routerId || router.id,
      hotspotServerName: hotspot.hotspotServerName || router.hotspotServerName || undefined,
      tenantDomain: router.tenant.domain ?? undefined,
      tenantId: router.tenantId,
    }
  }

  private async findActiveAccessByMacAndRouter(macAddress?: string | null, routerId?: string | null, tenantId?: string) {
    const normalizedMac = this.normalizeMac(macAddress)
    if (!normalizedMac) {
      return null
    }

    return this.prisma.packageActivation.findFirst({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: PackageActivationStatus.ACTIVE,
        endsAt: { gt: new Date() },
        boundMacAddress: normalizedMac,
        // Any router/AP under the same business (tenantId) recognizes active access.
        // Router-level filter only applies as fallback when tenantId is unknown.
        ...(!tenantId && routerId ? { OR: [{ routerId }, { routerId: null }] } : {}),
      },
      include: {
        ...this.activationInclude,
        radiusCredential: true,
      },
      orderBy: { endsAt: 'desc' },
    })
  }

  private issueReconnectLoginPayload(
    activation: {
      radiusUsername: string | null
      radiusPassword: string | null
      radiusCredential?: { username: string; password: string } | null
    },
    loginUrl?: string | null,
  ) {
    // Fall back to the AROFi hotspot gateway (set by the provisioning script as
    // hotspot-address=10.55.0.1) rather than a dead placeholder host, so
    // auto-login still has a real target when the captive link-login param was
    // not captured.
    const username = activation.radiusCredential?.username ?? activation.radiusUsername
    const password = activation.radiusCredential?.password ?? activation.radiusPassword

    // Defensive diagnostics for the "redeemed/paid but router rejects login"
    // class of incidents. Never logs the password itself — only whether the
    // pieces the router needs are actually present. If username or password is
    // missing here, the captive page would submit an unusable login and
    // MikroTik would answer "login fail".
    if (!username || !password) {
      this.logger.warn(
        `Reconnect payload INCOMPLETE: hasCredentialRow=${!!activation.radiusCredential} hasUsername=${!!username} hasPassword=${!!password} hasLoginUrl=${!!(loginUrl || process.env.HOTSPOT_LOGIN_URL)}`,
      )
    }

    return {
      loginUrl: loginUrl || process.env.HOTSPOT_LOGIN_URL || 'http://10.55.0.1/login',
      username,
      password,
      method: 'mikrotik-hotspot-post',
    }
  }

  private normalizeVoucherCode(value?: string | null) {
    return (value ?? '')
      .trim()
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/\s+/g, '')
      .toUpperCase()
  }

  private maskVoucherCode(value?: string | null) {
    const code = this.normalizeVoucherCode(value)
    if (code.length <= 4) {
      return '****'
    }
    return `${code.slice(0, 4)}...${code.slice(-4)}`
  }

  private async markReconnectionAttempt(input: {
    tenantId: string
    activationId?: string
    routerId?: string | null
    macAddress?: string | null
    ipAddress?: string | null
    status: ReconnectionStatus
    message?: string
    payload?: unknown
  }) {
    await this.prisma.reconnectionLog.create({
      data: {
        tenantId: input.tenantId,
        activationId: input.activationId,
        routerId: input.routerId,
        macAddress: this.normalizeMac(input.macAddress),
        ipAddress: input.ipAddress,
        status: input.status,
        message: input.message,
        payload: input.payload ? this.toJsonValue(input.payload) : undefined,
      },
    })
  }

  private async clearStaleSessionIfNeeded(activationId: string) {
    // MikroTik sends interim-update every 60s. No signal in 3 minutes = dead session.
    // 15 minutes was too long — stale ACTIVE sessions blocked reconnect detection
    // and caused the portal to show "existingActiveAccess=true" incorrectly.
    const staleBefore = new Date(Date.now() - 3 * 60 * 1000)
    const result = await this.prisma.networkSession.updateMany({
      where: {
        activationId,
        status: SessionStatus.ACTIVE,
        OR: [{ lastAccountingAt: null }, { lastAccountingAt: { lt: staleBefore } }],
      },
      data: {
        status: SessionStatus.STALE,
        endedAt: new Date(),
      },
    })

    if (result.count > 0) {
      const activation = await this.prisma.packageActivation.findUnique({ where: { id: activationId } })
      if (activation) {
        await this.markReconnectionAttempt({
          tenantId: activation.tenantId,
          activationId,
          routerId: activation.routerId,
          macAddress: activation.boundMacAddress,
          ipAddress: activation.firstSeenIp,
          status: ReconnectionStatus.STALE_SESSION_CLEARED,
          message: `${result.count} stale session(s) cleared before reconnect`,
        })
      }
    }
  }

  async startTrial(dto: {
    packageId: string
    macAddress?: string
    clientIp?: string
    routerId?: string
    routerKey?: string
    hotspotServerName?: string
    loginUrl?: string
    sessionReference?: string
  }) {
    const resolvedHotspot = await this.resolveHotspotContext({
      macAddress: dto.macAddress,
      ipAddress: dto.clientIp,
      routerId: dto.routerId,
      routerKey: dto.routerKey,
      hotspotServerName: dto.hotspotServerName,
      loginUrl: dto.loginUrl,
    })

    const tenantId = 'tenantId' in resolvedHotspot ? resolvedHotspot.tenantId : undefined
    if (!tenantId) {
      throw new BadRequestException('Unable to identify the business for this trial package')
    }

    const normalizedMac = this.normalizeMac(dto.macAddress)
    const normalizedIp = dto.clientIp?.trim() || undefined
    if (!normalizedMac && !normalizedIp) {
      throw new BadRequestException(
        'A device MAC address or client IP is required to start the free trial',
      )
    }

    const pkg = await this.prisma.package.findFirst({
      where: {
        id: dto.packageId,
        tenantId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        code: true,
        durationMinutes: true,
        dataLimitMb: true,
        deviceLimit: true,
        downloadSpeedKbps: true,
        uploadSpeedKbps: true,
        isTrialEnabled: true,
      },
    })

    if (!pkg || !pkg.isTrialEnabled) {
      throw new BadRequestException('This package is not a free trial')
    }

    const trialReuseWhere: Prisma.PackageActivationWhereInput = {
      tenantId,
      packageId: pkg.id,
      metadata: {
        path: ['trial'],
        equals: true,
      } as Prisma.JsonFilter,
      OR: [
        ...(normalizedMac ? [{ boundMacAddress: normalizedMac }] : []),
        ...(normalizedIp ? [{ firstSeenIp: normalizedIp }] : []),
      ],
    }

    const previousTrial = await this.prisma.packageActivation.findFirst({
      where: trialReuseWhere,
      select: {
        id: true,
        status: true,
        startedAt: true,
        endsAt: true,
        boundMacAddress: true,
        firstSeenIp: true,
      },
    })

    if (previousTrial) {
      throw new BadRequestException(
        'This device already used the free trial. Use a paid package or a different device.',
      )
    }

    const activation = await this.prisma.$transaction(async (tx) => {
      const created = await this.packageActivationService.activateInTransaction(tx, {
        tenantId,
        packageId: pkg.id,
        source: PackageActivationSource.VOUCHER,
        customerReference: 'TRIAL',
        durationMinutes: pkg.durationMinutes,
        dataLimitMb: pkg.dataLimitMb,
        deviceLimit: pkg.deviceLimit,
        downloadSpeedKbps: pkg.downloadSpeedKbps,
        uploadSpeedKbps: pkg.uploadSpeedKbps,
        radiusUsername: normalizedMac || normalizedIp || undefined,
        radiusPassword: normalizedMac || normalizedIp || undefined,
        boundMacAddress: normalizedMac || undefined,
        firstSeenIp: normalizedIp || undefined,
        routerId: 'routerId' in resolvedHotspot ? resolvedHotspot.routerId : undefined,
        hotspotServerName:
          'hotspotServerName' in resolvedHotspot ? resolvedHotspot.hotspotServerName : undefined,
        sessionReference: dto.sessionReference,
        metadata: this.toJsonValue({
          trial: true,
          loginUrl: dto.loginUrl ?? null,
          routerKey: dto.routerKey ?? null,
          clientIp: normalizedIp ?? null,
          macAddress: normalizedMac ?? null,
        }),
      })

      return tx.packageActivation.findUnique({
        where: { id: created.id },
        include: {
          package: { select: { id: true, name: true, code: true } },
          radiusCredential: { select: { username: true, password: true } },
        },
      })
    })

    const loginUrl = dto.loginUrl ?? null
    const username = activation?.radiusCredential?.username ?? activation?.radiusUsername ?? null
    const password = activation?.radiusCredential?.password ?? activation?.radiusPassword ?? null

    return {
      activation,
      reconnect:
        loginUrl && username && password
          ? {
              method: 'mikrotik-hotspot-post',
              loginUrl,
              username,
              password,
              routerId: 'routerId' in resolvedHotspot ? resolvedHotspot.routerId : null,
              hotspotServerName:
                'hotspotServerName' in resolvedHotspot ? resolvedHotspot.hotspotServerName : null,
              expiresAt: activation?.endsAt?.toISOString() ?? null,
            }
          : null,
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
    method: string
    network: string
    amountUgx: number
    phoneNumber: string
    customerReference: string | null
    externalReference: string
    providerReference: string | null
    providerStatus: string | null
    statusMessage: string | null
    statusToken?: string | null
    responsePayload: Prisma.JsonValue | null
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
      method: payment.method,
      network: payment.network,
      amountUgx: payment.amountUgx,
      phoneNumber: payment.phoneNumber,
      customerReference: payment.customerReference,
      externalReference: payment.externalReference,
      providerReference: payment.providerReference,
      providerStatus: payment.providerStatus,
      statusMessage: payment.statusMessage,
      statusToken: payment.statusToken,
      checkoutUrl: this.extractCheckoutUrl(payment.responsePayload),
      responsePayload: payment.responsePayload,
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

  private normalizeMac(value?: string | null) {
    if (!value) {
      return undefined
    }

    const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    if (!/^[A-F0-9]{12}$/.test(compact)) {
      return undefined
    }

    return compact.match(/.{1,2}/g)?.join(':')
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
    const secret =
      this.configService.get<string>('PORTAL_TOKEN_SECRET') ??
      this.configService.get<string>('JWT_SECRET')

    if (!secret) {
      throw new UnauthorizedException('Portal token secret is not configured')
    }

    return secret
  }

  private toMegabytes(value: bigint) {
    return Math.round((Number(value) / (1024 * 1024)) * 100) / 100
  }

  private extractCheckoutUrl(payload: Prisma.JsonValue | null) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null
    }

    const value = payload['checkoutUrl']
    return typeof value === 'string' && value.trim().length > 0 ? value : null
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue
  }

  async createPortalSupportTicket(dto: {
    tenantId: string
    phoneNumber?: string
    subject: string
    category: string
    body?: string
    customerReference?: string
  }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true },
    })
    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    const reference = `PRT-${Date.now().toString(36).toUpperCase().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`

    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId: dto.tenantId,
        reference,
        subject: dto.subject.trim(),
        category: dto.category.trim(),
        channel: 'PORTAL',
        phoneNumber: dto.phoneNumber?.trim(),
        customerReference: dto.customerReference?.trim() ?? dto.phoneNumber?.trim(),
        openedBy: dto.phoneNumber ?? 'Portal customer',
      },
      include: { messages: true },
    })

    if (dto.body?.trim()) {
      await this.prisma.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          authorName: dto.phoneNumber ?? 'Customer',
          authorRole: 'Customer',
          body: dto.body.trim(),
          isInternal: false,
        },
      })
    }

    return this.prisma.supportTicket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { messages: { where: { isInternal: false }, orderBy: { createdAt: 'asc' } } },
    })
  }

  async getPortalSupportTicket(reference: string, tenantId?: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: {
        reference: reference.toUpperCase().trim(),
        ...(tenantId ? { tenantId } : {}),
      },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!ticket) {
      throw new NotFoundException('Support ticket not found. Check the reference number and try again.')
    }

    return ticket
  }
}
