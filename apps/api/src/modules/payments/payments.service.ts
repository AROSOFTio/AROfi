import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AuditSeverity,
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  DisbursementStatus,
  LedgerDirection,
  LedgerTransactionType,
  PackageActivationStatus,
  PackageActivationSource,
  PaymentMethod,
  PackageStatus,
  PaymentEventType,
  PaymentNetwork,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  ReferralWalletTransactionStatus,
  ReferralWalletTransactionType,
} from '@prisma/client'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { BillingService } from '../billing/billing.service'
import { MailService } from '../mail/mail.service'
import { WhatsAppService } from '../whatsapp/whatsapp.service'
import { InitiatePortalPaymentDto } from './dto/initiate-portal-payment.dto'
import { PackageActivationService } from './package-activation.service'
import { PaymentProviderResult } from './payment-provider.interface'
import { PaymentRouterService } from './payment-router.service'
import { PhoneNumberService } from './phone-number.service'

type ProviderGatewayResponse = PaymentProviderResult & {
  checkoutUrl?: string
  orderTrackingId?: string
  merchantReference?: string
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

  private readonly pendingPaymentStatuses = new Set<PaymentStatus>([
    PaymentStatus.INITIATED,
    PaymentStatus.PENDING,
    PaymentStatus.INDETERMINATE,
  ])

  private readonly terminalPaymentStatuses = new Set<PaymentStatus>([
    PaymentStatus.COMPLETED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
    PaymentStatus.EXPIRED,
  ])

  // Tolerance (UGX) when reconciling a provider-reported paid amount against the
  // billed amount, to absorb minor gateway rounding. UGX has no minor units so
  // this is deliberately tiny — real underpayments are always well beyond it.
  private readonly paymentAmountToleranceUgx = 1

  // Portal clients can resume from a mobile-money PIN screen at the same time
  // as the normal poll runs. Coalesce those checks and back off only when the
  // provider explicitly reports temporary unavailability.
  private readonly paymentStatusChecksInFlight = new Set<string>()
  private readonly paymentStatusRetryAfter = new Map<string, { until: number; failures: number }>()

  private readonly paymentInclude = {
    tenant: {
      select: {
        id: true,
        name: true,
        domain: true,
      },
    },
    package: {
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
    },
    billingTransaction: {
      select: {
        id: true,
        status: true,
        externalReference: true,
        grossAmountUgx: true,
        feeAmountUgx: true,
        netAmountUgx: true,
        createdAt: true,
      },
    },
    activation: {
      include: {
        radiusCredential: true,
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
      },
    },
  }

  private readonly paymentDetailInclude = {
    ...this.paymentInclude,
    webhooks: {
      orderBy: { createdAt: 'desc' as const },
      take: 20,
    },
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
    private readonly paymentRouterService: PaymentRouterService,
    private readonly phoneNumberService: PhoneNumberService,
    private readonly packageActivationService: PackageActivationService,
    private readonly mailService: MailService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  async exportPaymentsCsv(tenantId?: string, from?: string, to?: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: this.paymentInclude,
      orderBy: { createdAt: 'desc' },
      take: 50_000,
    })

    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    const headers = ['date', 'business', 'phoneNumber', 'package', 'provider', 'network', 'status', 'amountUgx', 'externalReference', 'providerReference']
    const rows = payments.map((payment) =>
      [
        payment.createdAt.toISOString(),
        payment.tenant.name,
        payment.phoneNumber,
        payment.package?.name ?? '',
        payment.provider,
        payment.network,
        payment.status,
        payment.amountUgx,
        payment.externalReference ?? '',
        payment.providerReference ?? '',
      ]
        .map(escape)
        .join(','),
    )

    return {
      filename: `payments-${Date.now()}.csv`,
      contentType: 'text/csv',
      buffer: Buffer.from([headers.map(escape).join(','), ...rows].join('\n'), 'utf-8'),
    }
  }

  async getOverview(tenantId?: string) {
    const [payments, recentLogs, activeActivations] = await Promise.all([
      this.prisma.payment.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: this.paymentInclude,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.paymentWebhook.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          payment: {
            select: {
              id: true,
              externalReference: true,
              status: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.packageActivation.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          status: PackageActivationStatus.ACTIVE,
          endsAt: {
            gt: new Date(),
          },
        },
      }),
    ])

    return {
      summary: {
        totalPayments: payments.length,
        pendingPayments: payments.filter((payment) => this.pendingPaymentStatuses.has(payment.status)).length,
        completedPayments: payments.filter((payment) => payment.status === PaymentStatus.COMPLETED).length,
        failedPayments: payments.filter((payment) => payment.status === PaymentStatus.FAILED).length,
        grossCollectionsUgx: payments
          .filter((payment) => payment.status === PaymentStatus.COMPLETED)
          .reduce((total, payment) => total + payment.amountUgx, 0),
        activeActivations,
        mobileMoneyRequests: payments.filter((payment) => payment.method === PaymentMethod.MOBILE_MONEY).length,
      },
      payments,
      recentLogs,
    }
  }

  async getPortalContext(tenantDomain?: string, phoneNumber?: string, tenantId?: string) {
    const tenant = await this.resolvePortalTenant(tenantDomain, tenantId)
    const normalizedPhone = phoneNumber ? this.normalizePhoneNumber(phoneNumber) : null
    const phoneVariants = normalizedPhone
      ? Array.from(new Set([normalizedPhone, `+${normalizedPhone}`, `0${normalizedPhone.slice(3)}`]))
      : []

    const [packages, activeActivation, latestPayment] = await Promise.all([
      this.prisma.package.findMany({
        where: {
          tenantId: tenant.id,
          status: PackageStatus.ACTIVE,
        },
        include: {
          prices: {
            orderBy: { startsAt: 'desc' },
          },
        },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      }),
      normalizedPhone
        ? this.prisma.packageActivation.findFirst({
            where: {
              tenantId: tenant.id,
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
              status: PackageActivationStatus.ACTIVE,
              endsAt: {
                gt: new Date(),
              },
            },
            include: {
              package: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : null,
      normalizedPhone
        ? this.prisma.payment.findFirst({
            where: {
              tenantId: tenant.id,
              phoneNumber: normalizedPhone,
            },
            include: this.paymentInclude,
            orderBy: { createdAt: 'desc' },
          })
        : null,
    ])
    const platformSettings = await this.prisma.platformSetting.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global' },
    })
    const readiness = this.paymentRouterService.getProviderReadiness()
    const availablePaymentNetworks = this.resolveAvailablePaymentNetworks(
      platformSettings.allowedPaymentNetworks,
      readiness,
    )

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        logoUrl: tenant.logoUrl,
        brandColor: tenant.brandColor,
        portalTemplate: tenant.portalTemplate,
        supportPhone: tenant.supportPhone,
        supportEmail: tenant.supportEmail,
        // Platform-level fallback so tenants who haven't set their own contact
        // still show a WhatsApp button pointing to AROFi support.
        platformSupportPhone: tenant.supportPhone ? null : (platformSettings.supportPhone ?? null),
        platformSupportEmail: tenant.supportEmail ? null : (platformSettings.supportEmail ?? null),
      },
      packages: packages
        .map((pkg) => {
          const activePrice = pkg.prices.find((price) => price.endsAt === null) ?? pkg.prices[0]
          return {
            id: pkg.id,
            name: pkg.name,
            code: pkg.code,
            description: pkg.description,
            durationMinutes: pkg.durationMinutes,
            dataLimitMb: pkg.dataLimitMb,
            deviceLimit: pkg.deviceLimit,
            downloadSpeedKbps: pkg.downloadSpeedKbps,
            uploadSpeedKbps: pkg.uploadSpeedKbps,
            isFeatured: pkg.isFeatured,
            isTrialEnabled: pkg.isTrialEnabled,
            amountUgx: activePrice?.amountUgx ?? 0,
          }
        })
        .sort((a, b) => {
          // Featured packages always come first, then sort by price ascending
          if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
          return a.amountUgx - b.amountUgx
        }),
      paymentNetworks: availablePaymentNetworks,
      activeActivation,
      latestPayment,
    }
  }

  private resolveAvailablePaymentNetworks(
    configuredNetworks: PaymentNetwork[],
    readiness: ReturnType<PaymentRouterService['getProviderReadiness']>,
  ) {
    const resolved = new Set(configuredNetworks)

    // Legacy installs created the global PlatformSetting row with MTN-only as
    // the default even after Yo! Uganda began handling both MTN and Airtel.
    // Without this fallback, Airtel numbers are blocked in the portal before
    // the payment request is even sent, which looks like "no MoMo popup".
    if (
      resolved.size === 1 &&
      resolved.has(PaymentNetwork.MTN) &&
      readiness.collection.MTN.ready &&
      readiness.collection.AIRTEL.ready
    ) {
      resolved.add(PaymentNetwork.AIRTEL)
    }

    return [...resolved].filter((network) => {
      if (network === PaymentNetwork.MTN) return readiness.collection.MTN.ready
      if (network === PaymentNetwork.AIRTEL) return readiness.collection.AIRTEL.ready
      return false
    })
  }

  async initiatePortalPayment(dto: InitiatePortalPaymentDto) {
    const pkg = await this.prisma.package.findUnique({
      where: { id: dto.packageId },
      include: {
        tenant: true,
        prices: {
          orderBy: { startsAt: 'desc' },
        },
      },
    })

    if (!pkg || pkg.status !== PackageStatus.ACTIVE) {
      throw new NotFoundException('Package is not available for purchase')
    }

    if (dto.tenantDomain && pkg.tenant.domain !== dto.tenantDomain) {
      throw new BadRequestException('Package does not belong to the requested business portal')
    }

    const activePrice = pkg.prices.find((price) => price.endsAt === null) ?? pkg.prices[0]

    if (!activePrice) {
      throw new BadRequestException('Package has no active price configured')
    }

    if (this.isTrialPackage(pkg, activePrice.amountUgx)) {
      throw new BadRequestException('Free trial access must be started from the portal trial button, not Mobile Money checkout.')
    }

    if (activePrice.amountUgx <= 0) {
      throw new BadRequestException('Mobile Money checkout requires a paid package.')
    }

    if (dto.network !== PaymentNetwork.MTN && dto.network !== PaymentNetwork.AIRTEL) {
      throw new BadRequestException('Select MTN or Airtel before paying')
    }

    const network = dto.network
    const provider = this.paymentRouterService.providerFor(network, 'COLLECTION')
    const method = PaymentMethod.MOBILE_MONEY
    const phoneNumber = this.phoneNumberService.normalizeForNetwork(dto.phoneNumber, network)
    const normalizedMac = this.normalizeMac(dto.macAddress)
    if (!normalizedMac) {
      console.warn(`[payments] Payment initiated without MAC address — credentials will not be device-bound. package=${dto.packageId} phone=****${dto.phoneNumber?.slice(-4)}`)
    }

    const idempotencyKey = dto.idempotencyKey?.trim() || randomUUID()
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
      include: this.paymentDetailInclude,
    })

    if (existingPayment) {
      return existingPayment
    }

    const externalReference = this.buildExternalReference()
    const routerContext = await this.resolveRouterContext(pkg.tenantId, dto.routerId, dto.routerKey)
    const requestMetadata = this.toJsonValue({
      hotspotName: dto.hotspotName,
      sessionReference: dto.sessionReference,
      tenantDomain: dto.tenantDomain ?? pkg.tenant.domain,
      provider,
      method,
      network,
      macAddress: normalizedMac,
      clientIp: dto.clientIp,
      routerId: routerContext.routerId,
      routerKey: dto.routerKey,
      hotspotServerName: dto.hotspotServerName,
      loginUrl: dto.loginUrl,
    })

    const payment = await this.prisma.payment.create({
      data: {
        tenantId: pkg.tenantId,
        packageId: pkg.id,
        provider,
        method,
        network,
        status: PaymentStatus.INITIATED,
        amountUgx: activePrice.amountUgx,
        phoneNumber,
        normalizedPhone: phoneNumber,
        customerReference: dto.customerReference,
        externalReference,
        idempotencyKey,
        statusToken: randomBytes(24).toString('base64url'),
        requestPayload: requestMetadata,
        metadata: requestMetadata,
      },
    })

    try {
      const collectionProvider = this.paymentRouterService.resolveCollection(network)
      const gatewayResponse = await collectionProvider.collectPayment({
        amountUgx: activePrice.amountUgx,
        currency: activePrice.currency || this.configService.get<string>('PAYMENT_DEFAULT_CURRENCY') || 'UGX',
        phoneNumber,
        externalReference,
        customerReference: dto.customerReference,
        narrative: `${pkg.name} internet package`,
        network,
        returnUrl: this.buildPortalPaymentReturnUrl(payment.id, payment.statusToken),
      })

      return this.applyProviderTransition(payment.id, gatewayResponse, {
        eventType: PaymentEventType.REQUESTED,
        notes: gatewayResponse.statusMessage ?? 'Payment collection request submitted',
        payload: {
          request: {
            packageId: pkg.id,
            packageCode: pkg.code,
            tenantId: pkg.tenantId,
            phoneNumber,
            amountUgx: activePrice.amountUgx,
            externalReference,
            provider,
            method,
            network,
          },
          gateway: gatewayResponse,
        },
      })
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Unable to submit the payment request'
      const message = rawMessage.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) || 'Payment gateway error. Please try again.'

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          statusMessage: message,
          failedAt: new Date(),
        },
      })

      await this.prisma.paymentWebhook.create({
        data: {
          tenantId: payment.tenantId,
          paymentId: payment.id,
          provider: payment.provider,
          network: payment.network,
          eventType: PaymentEventType.REQUESTED,
          externalReference: payment.externalReference,
          verificationStatus: 'accepted',
          headers: this.toJsonValue({}),
          payload: this.toJsonValue({
            error: message,
          }),
          notes: 'Payment initiation failed before provider acceptance',
        },
      })

      const failedPayment = await this.prisma.payment.findUnique({
        where: { id: payment.id },
        include: this.paymentDetailInclude,
      })

      if (failedPayment) {
        return failedPayment
      }

      throw error
    }
  }

  async getPayment(paymentId: string, tenantId?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: this.paymentDetailInclude,
    })

    if (!payment) {
      throw new NotFoundException('Payment not found')
    }

    if (tenantId && payment.tenantId !== tenantId) {
      throw new NotFoundException('Payment not found')
    }

    return payment
  }

  async checkPaymentStatus(paymentId: string, tenantId?: string, statusToken?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: this.paymentInclude,
    })

    if (!payment) {
      throw new NotFoundException('Payment not found')
    }

    if (tenantId && payment.tenantId !== tenantId) {
      throw new NotFoundException('Payment not found')
    }

    if (!tenantId && (!payment.statusToken || payment.statusToken !== statusToken)) {
      throw new ForbiddenException('Payment status token is required')
    }

    if (this.terminalPaymentStatuses.has(payment.status)) {
      // A completed payment must still carry the MikroTik reconnect
      // credentials — the portal polls this endpoint after the webhook has
      // already transitioned the payment, and without the payload the
      // customer sees "COMPLETED" but never gets logged in.
      const fullPayment = await this.getPayment(payment.id)
      return this.attachReconnectPayload(fullPayment)
    }

    const retryState = this.paymentStatusRetryAfter.get(payment.id)
    if (this.paymentStatusChecksInFlight.has(payment.id) || (retryState && retryState.until > Date.now())) {
      return this.attachReconnectPayload(await this.getPayment(payment.id))
    }

    const referenceId = payment.providerReference ?? payment.externalReference
    this.paymentStatusChecksInFlight.add(payment.id)
    try {
      const gatewayResponse = await this.paymentRouterService
        .resolveCollection(payment.network, payment.provider)
        .getPaymentStatus(referenceId)

      this.paymentStatusRetryAfter.delete(payment.id)
      return this.applyProviderTransition(payment.id, gatewayResponse, {
        eventType: PaymentEventType.STATUS_CHECK,
        notes: gatewayResponse.statusMessage ?? 'Payment status check completed',
        payload: gatewayResponse,
      })
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        throw error
      }

      const failures = Math.min((retryState?.failures ?? 0) + 1, 5)
      const retryDelayMs = Math.min(30_000, 1_000 * 2 ** failures)
      this.paymentStatusRetryAfter.set(payment.id, { until: Date.now() + retryDelayMs, failures })
      this.logger.warn(`Payment provider is temporarily unavailable; delaying the next status check by ${retryDelayMs}ms.`)
      return this.attachReconnectPayload(await this.getPayment(payment.id))
    } finally {
      this.paymentStatusChecksInFlight.delete(payment.id)
    }
  }

  // Shared-secret verification for provider webhooks, matching the pattern
  // already used for Yo Uganda disbursement IPNs below. MTN/Airtel/Pesapal
  // callback URLs are registered directly with the provider (see
  // *_CALLBACK_URL in .env.example) — appending ?secret=<value> there, and
  // setting the matching env var, is what closes the endpoint to spoofed
  // "payment succeeded" POSTs from anyone who guesses a payment reference.
  // Warn-but-allow when unset, same as Yo Uganda, so existing deployments
  // that haven't rotated their callback URLs yet don't silently break.
  private resolveWebhookSecretEnvVar(provider: PaymentProvider, direction: 'collection' | 'disbursement') {
    if (provider === PaymentProvider.MTN_MOMO_DIRECT) {
      return direction === 'disbursement' ? 'MTN_MOMO_DISBURSEMENT_WEBHOOK_SECRET' : 'MTN_MOMO_COLLECTION_WEBHOOK_SECRET'
    }
    if (provider === PaymentProvider.AIRTEL_MONEY_DIRECT) {
      return direction === 'disbursement' ? 'AIRTEL_MONEY_DISBURSEMENT_WEBHOOK_SECRET' : 'AIRTEL_MONEY_COLLECTION_WEBHOOK_SECRET'
    }
    return 'AGGREGATOR_WEBHOOK_SECRET'
  }

  // Constant-time secret comparison so an attacker cannot recover the secret
  // byte-by-byte via response timing.
  private secretMatches(incoming: unknown, configured: string): boolean {
    if (incoming == null) {
      return false
    }
    const incomingBuffer = Buffer.from(String(incoming))
    const configuredBuffer = Buffer.from(configured)
    if (incomingBuffer.length !== configuredBuffer.length) {
      return false
    }
    return timingSafeEqual(incomingBuffer, configuredBuffer)
  }

  // Shared fail-closed secret gate for every webhook handler. In production a
  // missing secret is a hard reject (never fail-open — an unconfigured secret
  // must not leave the "payment succeeded" endpoint spoofable). Outside
  // production it warns and allows so local/dev stacks work without secrets.
  private ensureWebhookSecret(envVarName: string, incomingSecret: unknown) {
    const configuredSecret = process.env[envVarName] || this.configService.get<string>(envVarName)
    if (!configuredSecret) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          `${envVarName} is not configured — rejecting webhook (production fail-closed). Set ${envVarName} to accept provider callbacks.`,
        )
        throw new ForbiddenException('Webhook authorization is not configured')
      }
      this.logger.warn(`WARNING: ${envVarName} is not configured; accepting webhook (non-production only).`)
      return
    }

    if (!this.secretMatches(incomingSecret, configuredSecret)) {
      this.logger.warn(`Webhook authorization failed for ${envVarName}: invalid or missing secret`)
      throw new ForbiddenException('Invalid webhook authorization secret')
    }
  }

  private assertWebhookSecret(
    envVarName: string,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const headerSecret = headers['x-webhook-secret'] ?? headers['X-Webhook-Secret']
    const incomingSecret = payload.secret ?? (Array.isArray(headerSecret) ? headerSecret[0] : headerSecret)
    this.ensureWebhookSecret(envVarName, incomingSecret)
  }

  async handleProviderWebhook(
    provider: PaymentProvider,
    network: PaymentNetwork,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    direction: 'collection' | 'disbursement',
  ) {
    this.assertWebhookSecret(this.resolveWebhookSecretEnvVar(provider, direction), payload, headers)

    const extracted = this.extractWebhookReferences(payload)
    const payment = await this.findPaymentByReferences(extracted.externalReference, extracted.providerReference)
    const mappedStatus = this.mapProviderStatus(this.mapWebhookToGatewayResponse(payload))
    const idempotencyKey = this.buildWebhookIdempotencyKey(
      provider,
      extracted.externalReference,
      extracted.providerReference,
      mappedStatus,
      payload,
    )
    const duplicateWebhook = await this.prisma.paymentWebhook.findUnique({ where: { idempotencyKey } })

    if (duplicateWebhook) {
      return {
        received: true,
        matched: Boolean(payment),
        processed: false,
        duplicate: true,
      }
    }

    await this.prisma.paymentWebhook.create({
      data: {
        tenantId: payment?.tenantId,
        paymentId: payment?.id,
        provider,
        network,
        eventType: PaymentEventType.WEBHOOK_RECEIVED,
        status: String(payload.status ?? payload.transactionStatus ?? ''),
        idempotencyKey,
        externalReference: extracted.externalReference,
        providerReference: extracted.providerReference,
        verificationStatus: 'accepted',
        headers: this.toJsonValue(headers),
        payload: this.toJsonValue(payload),
        notes: `${provider} ${direction} webhook received`,
      },
    })

    if (!payment) {
      if (extracted.externalReference?.startsWith('BUSINESS-TOPUP-') || extracted.externalReference?.startsWith('TENANT-TOPUP-')) {
        const txRecord = await this.prisma.billingTransaction.findUnique({
          where: { externalReference: extracted.externalReference },
        })
        if (txRecord) {
          const gatewayResponse = this.mapWebhookToGatewayResponse(payload)
          let nextStatus = this.mapProviderStatus(gatewayResponse)

          // Reconcile the amount the provider says was actually paid against the
          // top-up we expected. An underpaid (or spoofed low) callback must not
          // credit the wallet the full requested amount.
          if (nextStatus === PaymentStatus.COMPLETED) {
            const paidUgx = this.parseGatewayAmountUgx(gatewayResponse.amount)
            if (paidUgx != null && paidUgx + this.paymentAmountToleranceUgx < txRecord.grossAmountUgx) {
              this.logger.error(
                `Top-up ${txRecord.externalReference} rejected: provider reported ${paidUgx} UGX for a ${txRecord.grossAmountUgx} UGX top-up.`,
              )
              nextStatus = PaymentStatus.FAILED
            }
          }

          if (nextStatus === PaymentStatus.COMPLETED && txRecord.status !== BillingTransactionStatus.COMPLETED) {
            await this.prisma.$transaction(async (tx) => {
              await tx.billingTransaction.update({
                where: { id: txRecord.id },
                data: {
                  status: BillingTransactionStatus.COMPLETED,
                  metadata: {
                    providerReference: extracted.providerReference || gatewayResponse.transactionReference || '',
                  },
                },
              })

              if (txRecord.walletId) {
                await tx.wallet.update({
                  where: { id: txRecord.walletId },
                  data: {
                    balanceUgx: {
                      increment: txRecord.grossAmountUgx,
                    },
                  },
                })
              }
            })
          } else if (nextStatus === PaymentStatus.FAILED && txRecord.status === BillingTransactionStatus.PENDING) {
            await this.prisma.billingTransaction.update({
              where: { id: txRecord.id },
              data: {
                status: BillingTransactionStatus.FAILED,
              },
            })
          }

          return {
            received: true,
            matched: true,
            processed: true,
          }
        }
      }

      return {
        received: true,
        matched: false,
        processed: false,
      }
    }

    if (payment.provider !== provider || payment.network !== network) {
      return {
        received: true,
        matched: true,
        processed: false,
        reason: 'Payment provider mismatch',
      }
    }

    const gatewayResponse = this.mapWebhookToGatewayResponse(payload)
    const updatedPayment = await this.applyProviderTransition(payment.id, gatewayResponse, {
      eventType: PaymentEventType.WEBHOOK_PROCESSED,
      notes: `${provider} ${direction} webhook processed`,
      payload: {
        webhook: payload,
        gateway: gatewayResponse,
      },
      headers,
    })

    return {
      received: true,
      matched: true,
      processed: true,
      payment: updatedPayment,
    }
  }

  private async applyProviderTransition(
    paymentId: string,
    gatewayResponse: ProviderGatewayResponse,
    log: {
      eventType: PaymentEventType
      notes?: string
      payload?: unknown
      headers?: Record<string, string | string[] | undefined>
    },
  ) {
    let receiptInfo: {
      tenantId: string
      packageName: string
      grossAmountUgx: number
      feeAmountUgx: number
      netAmountUgx: number
      customerReference?: string | null
      reference: string
    } | null = null

    let customerWhatsAppInfo: {
      phoneNumber: string
      packageName: string
      durationMinutes: number
      companionVoucherCodes: string[]
    } | null = null

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: this.paymentInclude,
      })

      if (!payment) {
        throw new NotFoundException('Payment not found')
      }

      let nextStatus = this.mapProviderStatus(gatewayResponse)
      if (payment.status === PaymentStatus.COMPLETED && nextStatus === PaymentStatus.COMPLETED) {
        const completedPayment = await tx.payment.findUnique({
          where: { id: payment.id },
          include: this.paymentDetailInclude,
        })
        return this.attachReconnectPayload(completedPayment)
      }

      // Reconcile the amount the provider says was actually paid against the
      // amount we billed for this order. A "SUCCESSFUL" callback that paid less
      // than the package price (partial payment, or a spoofed low amount) must
      // NOT activate the package. When the provider omits the amount we cannot
      // verify, so we fall through — the shared secret already gates the caller
      // and the check-status path re-queries the provider as source of truth.
      let amountMismatchMessage: string | undefined
      if (nextStatus === PaymentStatus.COMPLETED) {
        const paidUgx = this.parseGatewayAmountUgx(gatewayResponse.amount)
        if (paidUgx != null && paidUgx + this.paymentAmountToleranceUgx < payment.amountUgx) {
          amountMismatchMessage = `Amount mismatch: provider reported ${paidUgx} ${gatewayResponse.currencyCode ?? 'UGX'} for a ${payment.amountUgx} UGX order. Activation withheld.`
          this.logger.error(`Payment ${payment.id} rejected — ${amountMismatchMessage}`)
          nextStatus = PaymentStatus.FAILED
        }
      }
      const now = new Date()
      const providerReference =
        gatewayResponse.transactionReference ??
        gatewayResponse.orderTrackingId ??
        payment.providerReference
      const updatedCustomerRef = gatewayResponse.payerName || payment.customerReference
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          providerReference,
          customerReference: updatedCustomerRef,
          providerStatus: gatewayResponse.transactionStatus ?? payment.providerStatus,
          statusMessage:
            amountMismatchMessage ??
            gatewayResponse.statusMessage ??
            gatewayResponse.errorMessage ??
            payment.statusMessage,
          responsePayload: this.toJsonValue({
            status: gatewayResponse.status,
            statusCode: gatewayResponse.statusCode,
            transactionStatus: gatewayResponse.transactionStatus,
            transactionReference: gatewayResponse.transactionReference,
            mnoTransactionReferenceId: gatewayResponse.mnoTransactionReferenceId,
            issuedReceiptNumber: gatewayResponse.issuedReceiptNumber,
            statusMessage: gatewayResponse.statusMessage,
            errorMessageCode: gatewayResponse.errorMessageCode,
            errorMessage: gatewayResponse.errorMessage,
            amount: gatewayResponse.amount,
            currencyCode: gatewayResponse.currencyCode,
            checkoutUrl: gatewayResponse.checkoutUrl,
            orderTrackingId: gatewayResponse.orderTrackingId,
            merchantReference: gatewayResponse.merchantReference,
            transactionInitiationDate: gatewayResponse.transactionInitiationDate,
            transactionCompletionDate: gatewayResponse.transactionCompletionDate,
            rawRequest: gatewayResponse.rawRequest,
            rawResponse: gatewayResponse.rawResponse,
          }),
          status: nextStatus,
          completedAt:
            nextStatus === PaymentStatus.COMPLETED
              ? payment.completedAt ?? now
              : payment.completedAt,
          failedAt:
            nextStatus === PaymentStatus.FAILED
              ? payment.failedAt ?? now
              : payment.failedAt,
        },
      })

      await tx.paymentWebhook.create({
        data: {
          tenantId: payment.tenantId,
          paymentId: payment.id,
          provider: payment.provider,
          network: payment.network,
          eventType: log.eventType,
          status: nextStatus,
          externalReference: payment.externalReference,
          providerReference,
          verificationStatus: 'accepted',
          headers: this.toJsonValue(log.headers ?? {}),
          payload: this.toJsonValue(log.payload ?? gatewayResponse),
          notes: log.notes,
          isProcessed: nextStatus === PaymentStatus.COMPLETED,
          processedAt: nextStatus === PaymentStatus.COMPLETED ? now : undefined,
        },
      })

      if (nextStatus === PaymentStatus.COMPLETED) {
        const packageRecord = await tx.package.findUnique({
          where: { id: payment.packageId },
        })

        if (!packageRecord) {
          throw new NotFoundException('Package not found for payment activation')
        }

        const existingBillingTransaction =
          payment.billingTransaction?.id
            ? payment.billingTransaction
            : await tx.billingTransaction.findUnique({
                where: { externalReference: payment.externalReference },
              })

        const billingTransaction =
          existingBillingTransaction ??
          (await this.billingService.recordSaleInTransaction(tx, {
            tenantId: payment.tenantId,
            packageId: payment.packageId,
            channel: BillingChannel.MOBILE_MONEY,
            type: BillingTransactionType.MOBILE_MONEY_SALE,
            grossAmountUgx: payment.amountUgx,
            description: `${payment.method === PaymentMethod.CARD ? 'Card' : 'Mobile money'} payment - ${payment.network} network`,
            customerReference: updatedCustomerRef ?? payment.phoneNumber,
            externalReference: payment.externalReference,
            paymentProvider: payment.provider.replace(/_/g, ' '),
            metadata: this.toJsonValue({
              paymentId: payment.id,
              providerReference,
              network: payment.network,
              provider: payment.provider,
              method: payment.method,
              routerId: this.readMetadataString(payment.metadata, 'routerId'),
              routerKey: this.readMetadataString(payment.metadata, 'routerKey'),
              hotspotServerName: this.readMetadataString(payment.metadata, 'hotspotServerName'),
              loginUrl: this.readMetadataString(payment.metadata, 'loginUrl'),
            }),
          }))

        receiptInfo = {
          tenantId: payment.tenantId,
          packageName: packageRecord.name,
          grossAmountUgx: billingTransaction.grossAmountUgx,
          feeAmountUgx: billingTransaction.feeAmountUgx,
          netAmountUgx: billingTransaction.netAmountUgx,
          customerReference: updatedCustomerRef ?? payment.phoneNumber,
          reference: payment.externalReference,
        }

        const paymentMacAddress = this.readMetadataString(payment.metadata, 'macAddress')
        const smartTvCredential = paymentMacAddress && this.isSmartTvPackage(packageRecord)

        const activation = await this.packageActivationService.activateInTransaction(tx, {
          tenantId: payment.tenantId,
          packageId: payment.packageId,
          paymentId: payment.id,
          source: PackageActivationSource.MOBILE_MONEY,
          customerReference: updatedCustomerRef ?? payment.phoneNumber,
          accessPhoneNumber: payment.phoneNumber,
          durationMinutes: packageRecord.durationMinutes,
          dataLimitMb: packageRecord.dataLimitMb,
          deviceLimit: packageRecord.deviceLimit,
          downloadSpeedKbps: packageRecord.downloadSpeedKbps,
          uploadSpeedKbps: packageRecord.uploadSpeedKbps,
          radiusUsername: smartTvCredential ? paymentMacAddress : undefined,
          radiusPassword: smartTvCredential ? paymentMacAddress : undefined,
          boundMacAddress: paymentMacAddress,
          firstSeenIp: this.readMetadataString(payment.metadata, 'clientIp'),
          routerId: this.readMetadataString(payment.metadata, 'routerId'),
          hotspotServerName: this.readMetadataString(payment.metadata, 'hotspotServerName'),
          metadata: this.toJsonValue({
            paymentId: payment.id,
            providerReference,
            provider: payment.provider,
            method: payment.method,
            macAddress: paymentMacAddress,
            clientIp: this.readMetadataString(payment.metadata, 'clientIp'),
            routerId: this.readMetadataString(payment.metadata, 'routerId'),
            routerKey: this.readMetadataString(payment.metadata, 'routerKey'),
            hotspotServerName: this.readMetadataString(payment.metadata, 'hotspotServerName'),
            loginUrl: this.readMetadataString(payment.metadata, 'loginUrl'),
            targetDevice: smartTvCredential ? 'SMART_TV' : undefined,
          }),
        })

        const companionVoucherCodes = await this.packageActivationService.generateCompanionVouchersForPackage(tx, {
          tenantId: payment.tenantId,
          packageId: payment.packageId,
          deviceLimit: packageRecord.deviceLimit,
        })

        if (payment.phoneNumber) {
          customerWhatsAppInfo = {
            phoneNumber: payment.phoneNumber,
            packageName: packageRecord.name,
            durationMinutes: packageRecord.durationMinutes,
            companionVoucherCodes,
          }
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            billingTransactionId: billingTransaction.id,
            metadata: this.toJsonValue({
              ...(payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata) ? payment.metadata : {}),
              companionVoucherCodes,
            }),
          },
        })

        await tx.paymentWebhook.create({
          data: {
            tenantId: payment.tenantId,
            paymentId: payment.id,
            provider: payment.provider,
            network: payment.network,
            eventType: PaymentEventType.ACTIVATION_POSTED,
            externalReference: payment.externalReference,
            providerReference,
            verificationStatus: 'accepted',
            headers: this.toJsonValue({}),
            payload: this.toJsonValue({
              activationId: activation.id,
              billingTransactionId: billingTransaction.id,
            }),
            notes: 'Package activation posted successfully',
            isProcessed: true,
            processedAt: now,
          },
        })
      }

      const refreshedPayment = await tx.payment.findUnique({
        where: { id: payment.id },
        include: this.paymentDetailInclude,
      })
      return this.attachReconnectPayload(refreshedPayment)
    })

    if (receiptInfo) {
      // Best-effort, fire-and-forget: a slow/broken mail server must never
      // delay or fail a payment confirmation that already succeeded.
      void this.sendSaleReceiptEmailSafely(receiptInfo)
    }

    if (customerWhatsAppInfo) {
      void this.sendCustomerWhatsAppConfirmation(customerWhatsAppInfo)
    }

    return result
  }

  private async sendCustomerWhatsAppConfirmation(input: {
    phoneNumber: string
    packageName: string
    durationMinutes: number
    companionVoucherCodes: string[]
  }) {
    if (!this.whatsAppService.isConfigured()) {
      return
    }

    const lines = [
      `✅ Payment confirmed for *${input.packageName}*.`,
      `Your device is connecting now.`,
    ]
    if (input.companionVoucherCodes.length > 0) {
      lines.push('', `Your package covers ${input.companionVoucherCodes.length + 1} devices. Share these codes so your friends can connect on their own phones:`)
      for (const code of input.companionVoucherCodes) {
        lines.push(`• ${code}`)
      }
      lines.push('', 'Each code works on one device only and expires soon, so share them right away.')
    }

    try {
      await this.whatsAppService.sendTextMessage(input.phoneNumber, lines.join('\n'))
    } catch (error) {
      this.logger.warn(
        `Failed to send WhatsApp confirmation to ${input.phoneNumber}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async sendSaleReceiptEmailSafely(input: {
    tenantId: string
    packageName: string
    grossAmountUgx: number
    feeAmountUgx: number
    netAmountUgx: number
    customerReference?: string | null
    reference: string
  }) {
    // Per-sale receipt emails are opt-in: a busy hotspot generates dozens of
    // sales an hour and the owner's inbox drowned in them. Sales remain fully
    // visible in the dashboard; set SALE_RECEIPT_EMAILS_ENABLED=true to turn
    // the emails back on.
    if (process.env.SALE_RECEIPT_EMAILS_ENABLED !== 'true') {
      return
    }
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: {
          name: true,
          supportEmail: true,
          users: { select: { email: true, firstName: true, lastName: true }, take: 1 },
        },
      })
      const recipientEmail = tenant?.supportEmail ?? tenant?.users[0]?.email
      if (!tenant || !recipientEmail) {
        return
      }

      const recipientName = tenant.users[0]
        ? `${tenant.users[0].firstName ?? ''} ${tenant.users[0].lastName ?? ''}`.trim() || tenant.name
        : tenant.name

      await this.mailService.sendSaleReceiptEmail({
        to: recipientEmail,
        tenantName: tenant.name,
        recipientName,
        packageName: input.packageName,
        channel: 'Mobile Money',
        grossAmountUgx: input.grossAmountUgx,
        feeAmountUgx: input.feeAmountUgx,
        netAmountUgx: input.netAmountUgx,
        customerReference: input.customerReference,
        reference: input.reference,
        occurredAt: new Date(),
      })
    } catch (error) {
      this.logger.warn(
        `Failed to send sale receipt email for tenant ${input.tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private attachReconnectPayload<T extends { status: PaymentStatus; activation?: {
    radiusUsername?: string | null
    radiusPassword?: string | null
    radiusCredential?: { username: string; password: string } | null
    routerId?: string | null
    hotspotServerName?: string | null
    endsAt?: Date
    metadata?: Prisma.JsonValue | null
  } | null; metadata?: Prisma.JsonValue | null } | null>(payment: T) {
    if (!payment || payment.status !== PaymentStatus.COMPLETED || !payment.activation) {
      return payment
    }

    const loginUrl =
      this.readMetadataString(payment.metadata, 'loginUrl') ||
      this.readMetadataString(payment.activation.metadata, 'loginUrl') ||
      null   // keep null if not found — frontend will try sessionStorage fallback

    const username = payment.activation.radiusCredential?.username ?? payment.activation.radiusUsername
    const password = payment.activation.radiusCredential?.password ?? payment.activation.radiusPassword

    const companionVoucherCodes =
      payment.metadata &&
      typeof payment.metadata === 'object' &&
      !Array.isArray(payment.metadata) &&
      Array.isArray((payment.metadata as Record<string, unknown>).companionVoucherCodes)
        ? ((payment.metadata as Record<string, unknown>).companionVoucherCodes as string[])
        : []

    return {
      ...payment,
      companionVoucherCodes,
      reconnect: {
        method: 'mikrotik-hotspot-post',
        loginUrl,
        username: username ?? null,
        password: password ?? null,
        routerId: payment.activation.routerId ?? this.readMetadataString(payment.metadata, 'routerId') ?? null,
        hotspotServerName:
          payment.activation.hotspotServerName ??
          this.readMetadataString(payment.metadata, 'hotspotServerName') ??
          null,
        expiresAt: payment.activation.endsAt ?? null,
        fallbackMessage: (!loginUrl || !username || !password)
          ? 'Payment confirmed. Your access is active — reconnect to the WiFi and this page will connect you automatically.'
          : null,
      },
    }
  }

  private async resolvePortalTenant(tenantDomain?: string, tenantId?: string) {
    if (tenantDomain) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { domain: tenantDomain },
      })

      if (!tenant) {
        throw new NotFoundException('Business portal not found')
      }

      return tenant
    }

    // Fallback: resolve by tenantId (provided when routerKey resolved the router
    // but the tenant has no domain configured yet)
    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      })
      if (tenant) {
        return tenant
      }
    }

    throw new NotFoundException('Business portal context is required')
  }

  private async resolveRouterContext(tenantId: string, routerId?: string, routerKey?: string) {
    if (!routerKey) {
      return { routerId }
    }

    const router = await this.prisma.router.findUnique({
      where: { registrationKey: routerKey },
      select: {
        id: true,
        tenantId: true,
      },
    })

    if (!router) {
      throw new NotFoundException('Router registration context was not found')
    }

    if (router.tenantId !== tenantId) {
      throw new BadRequestException('Router registration context does not belong to this business portal')
    }

    if (routerId && routerId !== router.id) {
      throw new BadRequestException('Router ID does not match the portal router key')
    }

    return { routerId: router.id }
  }

  private buildExternalReference() {
    return `AROFI-PAY-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`
  }

  async handleAggregatorCollectionWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const extracted = this.extractWebhookReferences(payload)
    const payment = await this.findPaymentByReferences(extracted.externalReference, extracted.providerReference)
    return this.handleProviderWebhook(
      PaymentProvider.AGGREGATOR,
      payment?.network ?? PaymentNetwork.MTN,
      payload,
      headers,
      'collection',
    )
  }

  private buildWebhookIdempotencyKey(
    provider: PaymentProvider,
    externalReference?: string,
    providerReference?: string,
    mappedStatus?: string,
    payload?: unknown,
  ) {
    // Key on the stable identity of the event: provider + references + the
    // mapped status. This dedups replays (including ones with a tweaked payload)
    // while still letting a genuine PENDING → SUCCESSFUL transition through,
    // because the mapped status differs. Only when both references are missing
    // (unmatched webhooks we merely log) do we fall back to the raw payload so
    // distinct unmatched events don't collide.
    const hasReference = Boolean(externalReference || providerReference)
    const raw = JSON.stringify({
      provider,
      externalReference,
      providerReference,
      mappedStatus,
      payload: hasReference ? undefined : payload,
    })
    return createHash('sha256').update(raw).digest('hex')
  }

  // Parse a provider-reported amount ("5000", "5000.00", "5,000") into whole
  // UGX. Returns null when absent or unparseable so callers can distinguish
  // "underpaid" from "amount not reported".
  private parseGatewayAmountUgx(amount?: string | number | null): number | null {
    if (amount == null) {
      return null
    }
    const parsed = Number.parseFloat(String(amount).replace(/,/g, '').trim())
    if (!Number.isFinite(parsed)) {
      return null
    }
    return Math.round(parsed)
  }

  private mapProviderStatus(gatewayResponse: ProviderGatewayResponse) {
    const providerStatus = (gatewayResponse.transactionStatus ?? '').toUpperCase()

    if (providerStatus === 'SUCCESSFUL' || providerStatus === 'SUCCEEDED' || providerStatus === 'PAID' || providerStatus === 'COMPLETED' || providerStatus === 'SUCCESS') {
      return PaymentStatus.COMPLETED
    }

    if (providerStatus === 'FAILED') {
      return PaymentStatus.FAILED
    }

    if (providerStatus === 'CANCELLED') {
      return PaymentStatus.CANCELLED
    }

    if (providerStatus === 'EXPIRED') {
      return PaymentStatus.EXPIRED
    }

    if (providerStatus === 'PENDING') {
      return PaymentStatus.PENDING
    }

    if (providerStatus === 'INDETERMINATE') {
      return PaymentStatus.INDETERMINATE
    }

    if (gatewayResponse.status.toUpperCase() !== 'OK') {
      return PaymentStatus.FAILED
    }

    if (gatewayResponse.statusCode === 0) {
      return PaymentStatus.COMPLETED
    }

    return PaymentStatus.PENDING
  }

  private mapWebhookToGatewayResponse(payload: Record<string, unknown>): ProviderGatewayResponse {
    const transactionStatus = (
      this.readPayloadValue(payload, [
        'TransactionStatus',
        'transactionStatus',
        'transaction_status',
        'TransactionStatusName',
        'payment_status_description',
        'payment_status',
        'status',
      ]) ??
      'PENDING'
    ).toString()

    const status = (
      this.readPayloadValue(payload, ['Status', 'status', 'result']) ??
      'OK'
    ).toString()

    const statusCodeValue = this.readPayloadValue(payload, ['StatusCode', 'statusCode'])
    const statusCode = statusCodeValue ? Number.parseInt(statusCodeValue.toString(), 10) || 0 : 0

    return {
      status,
      statusCode,
      transactionStatus,
      transactionReference: this.readPayloadValue(payload, [
        'TransactionReference',
        'transactionReference',
        'transaction_reference',
        'yopayment_reference',
        'network_ref',
        'providerReference',
        'order_tracking_id',
        'OrderTrackingId',
      ])?.toString(),
      mnoTransactionReferenceId: this.readPayloadValue(payload, [
        'MNOTransactionReferenceId',
        'mnoTransactionReferenceId',
        'network_ref',
      ])?.toString(),
      statusMessage: this.readPayloadValue(payload, [
        'StatusMessage',
        'statusMessage',
        'message',
      ])?.toString(),
      errorMessageCode: this.readPayloadValue(payload, [
        'ErrorMessageCode',
        'errorMessageCode',
      ])?.toString(),
      errorMessage: this.readPayloadValue(payload, [
        'ErrorMessage',
        'errorMessage',
      ])?.toString(),
      amount: this.readPayloadValue(payload, ['Amount', 'amount'])?.toString(),
      currencyCode: this.readPayloadValue(payload, ['CurrencyCode', 'currency'])?.toString(),
      orderTrackingId: this.readPayloadValue(payload, ['order_tracking_id', 'OrderTrackingId'])?.toString(),
      merchantReference: this.readPayloadValue(payload, ['merchant_reference', 'MerchantReference', 'reference'])?.toString(),
      rawRequest: '',
      rawResponse: JSON.stringify(payload),
    }
  }

  private extractWebhookReferences(payload: Record<string, unknown>, externalReferenceHint?: string) {
    return {
      externalReference:
        this.readPayloadValue(payload, [
          'ExternalReference',
          'externalReference',
          'external_ref',
          'reference',
          'privateTransactionReference',
          'PrivateTransactionReference',
          'merchant_reference',
          'MerchantReference',
          'OrderMerchantReference',
          'orderMerchantReference',
        ])?.toString() ?? externalReferenceHint,
      providerReference:
        this.readPayloadValue(payload, [
          'TransactionReference',
          'transactionReference',
          'transaction_reference',
          'yopayment_reference',
          'network_ref',
          'providerReference',
          'order_tracking_id',
          'OrderTrackingId',
          'orderTrackingId',
        ])?.toString(),
    }
  }

  private buildPortalPaymentReturnUrl(paymentId: string, statusToken?: string | null) {
    const base = this.configService.get<string>('PORTAL_BASE_URL') ?? this.configService.get<string>('APP_BASE_URL') ?? 'https://arofi.net/portal'
    try {
      const url = new URL(base)
      url.searchParams.set('paymentId', paymentId)
      if (statusToken) {
        url.searchParams.set('token', statusToken)
      }
      return url.toString()
    } catch {
      const separator = base.includes('?') ? '&' : '?'
      const token = statusToken ? `&token=${encodeURIComponent(statusToken)}` : ''
      return `${base}${separator}paymentId=${encodeURIComponent(paymentId)}${token}`
    }
  }

  private async findPaymentByReferences(externalReference?: string, providerReference?: string) {
    if (externalReference) {
      const payment = await this.prisma.payment.findUnique({
        where: { externalReference },
        include: this.paymentInclude,
      })

      if (payment) {
        return payment
      }
    }

    if (providerReference) {
      return this.prisma.payment.findUnique({
        where: { providerReference },
        include: this.paymentInclude,
      })
    }

    return null
  }

  private readPayloadValue(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      if (key in payload && payload[key] !== undefined && payload[key] !== null) {
        return payload[key]
      }
    }

    return undefined
  }

  private normalizePhoneNumber(phoneNumber: string) {
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

    throw new BadRequestException('Phone number must be a valid Uganda mobile number')
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

  private readMetadataString(metadata: Prisma.JsonValue | null, key: string) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined
    }

    const value = metadata[key]
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue
  }

  // ── Yo Uganda Disbursement IPN Webhook ─────────────────────────────────────
  // Called by POST/GET /payments/webhooks/yo-uganda/disbursement
  // Yo Uganda sends this when a vendor payout (acwithdrawfunds) completes or fails.
  // The payload contains:
  //   external_ref         → our disbursement reference
  //   transaction_reference → Yo's internal ref
  //   status / transaction_status → SUCCEEDED | FAILED | PENDING | CANCELLED
  async handleYoDisbursementWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const incomingSecret =
      payload.secret ?? headers['x-yo-webhook-secret'] ?? headers['X-Yo-Webhook-Secret'] ?? headers['x-webhook-secret']
    this.ensureWebhookSecret('YO_UGANDA_WEBHOOK_SECRET', Array.isArray(incomingSecret) ? incomingSecret[0] : incomingSecret)

    const externalRef = this.readPayloadValue(payload, [
      'ExternalReference', 'external_ref', 'reference', 'PrivateTransactionReference',
    ])?.toString()

    const providerRef = this.readPayloadValue(payload, [
      'TransactionReference', 'transaction_reference', 'yopayment_reference',
    ])?.toString()

    const rawStatus = (
      this.readPayloadValue(payload, [
        'Status', 'status', 'TransactionStatus', 'transaction_status',
      ])?.toString() ?? 'PENDING'
    ).toUpperCase()

    // Log every webhook — even unmatched ones — for debugging
    const idempotencyKey = createHash('sha256')
      .update(JSON.stringify({ externalRef, providerRef, rawStatus, ts: Math.floor(Date.now() / 5000) }))
      .digest('hex')

    try {
      await this.prisma.paymentWebhook.create({
        data: {
          provider: PaymentProvider.AGGREGATOR,
          network: PaymentNetwork.MTN,
          eventType: PaymentEventType.WEBHOOK_RECEIVED,
          status: rawStatus,
          idempotencyKey,
          externalReference: externalRef,
          providerReference: providerRef,
          verificationStatus: 'accepted',
          headers: this.toJsonValue(headers),
          payload: this.toJsonValue(payload),
          notes: 'Yo Uganda disbursement IPN webhook',
        },
      })
    } catch {
      // Duplicate webhook — already processed
      return { received: true, matched: false, processed: false, duplicate: true }
    }

    if (!externalRef && !providerRef) {
      this.logger.warn('Yo Uganda disbursement webhook received without any reference fields', payload)
      return { received: true, matched: false }
    }

    // Look up Disbursement by our reference (external_ref) OR Yo's reference (transaction_reference)
    const disbursement = await this.prisma.disbursement.findFirst({
      where: {
        OR: [
          ...(externalRef ? [{ reference: externalRef }] : []),
          ...(providerRef ? [{ providerReference: providerRef }] : []),
        ],
      },
      include: { billingTransaction: true, wallet: true },
    })

    if (!disbursement) {
      this.logger.warn(
        `Yo Uganda disbursement IPN: no Disbursement found for external_ref=${externalRef} transaction_reference=${providerRef}`,
      )
      return { received: true, matched: false }
    }

    // Already in a terminal state — idempotent no-op
    if (
      disbursement.status === DisbursementStatus.COMPLETED ||
      disbursement.status === DisbursementStatus.REVERSED ||
      disbursement.status === DisbursementStatus.FAILED ||
      disbursement.status === DisbursementStatus.CANCELLED
    ) {
      return { received: true, matched: true, processed: false, reason: 'Already in terminal state', status: disbursement.status }
    }

    const isSuccess = ['SUCCEEDED', 'SUCCESSFUL', 'SUCCESS', 'COMPLETED'].includes(rawStatus)
    const isFailed  = ['FAILED', 'FAILED_UNKNOWN', 'CANCELLED', 'CANCELED'].includes(rawStatus)

    // Still pending — update providerReference if we now have it, then wait
    if (!isSuccess && !isFailed) {
      if (providerRef && !disbursement.providerReference) {
        await this.prisma.disbursement.update({
          where: { id: disbursement.id },
          data: { providerReference: providerRef },
        })
      }
      return { received: true, matched: true, processed: false, reason: 'Payment still PENDING' }
    }

    const nextStatus = isSuccess ? DisbursementStatus.COMPLETED : DisbursementStatus.FAILED
    const disbursementMetadata =
      typeof disbursement.metadata === 'object' && disbursement.metadata !== null && !Array.isArray(disbursement.metadata)
        ? disbursement.metadata as Record<string, unknown>
        : {}
    const referralWalletTransactionId =
      typeof disbursementMetadata.referralWalletTransactionId === 'string'
        ? disbursementMetadata.referralWalletTransactionId
        : null

    await this.prisma.$transaction(async (tx) => {
      await tx.disbursement.update({
        where: { id: disbursement.id },
        data: {
          status: nextStatus,
          providerReference: providerRef ?? disbursement.providerReference,
          completedAt: isSuccess ? new Date() : undefined,
          failedAt: isFailed ? new Date() : undefined,
          notes: isSuccess
            ? 'Payout confirmed by Yo Uganda IPN callback.'
            : `Payout failed per Yo Uganda IPN callback. Status: ${rawStatus}`,
          metadata: this.toJsonValue({
            ...disbursementMetadata,
            yoIpnPayload: payload,
            yoIpnStatus: rawStatus,
            yoIpnProcessedAt: new Date().toISOString(),
          }),
        },
      })

      // On failure: reverse the wallet debit so the vendor gets their balance back
      if (isFailed && referralWalletTransactionId) {
        const referralWithdrawal = await tx.referralWalletTransaction.findUnique({
          where: { id: referralWalletTransactionId },
          include: { referrerProfile: true },
        })
        if (referralWithdrawal && referralWithdrawal.status !== ReferralWalletTransactionStatus.FAILED) {
          const releaseAmount = Math.max(0, referralWithdrawal.previousBalanceUgx - referralWithdrawal.newBalanceUgx)
          const profile = await tx.referralProfile.update({
            where: { id: referralWithdrawal.referrerProfileId },
            data: { availableBalanceUgx: { increment: releaseAmount } },
          })
          await tx.referralWalletTransaction.update({
            where: { id: referralWithdrawal.id },
            data: {
              type: ReferralWalletTransactionType.FAILED_WITHDRAWAL,
              status: ReferralWalletTransactionStatus.FAILED,
              newBalanceUgx: profile.availableBalanceUgx,
              description: `Referral payout failed per provider callback. Status: ${rawStatus}`,
            },
          })
        }
      } else if (isSuccess && referralWalletTransactionId) {
        const referralWithdrawal = await tx.referralWalletTransaction.update({
          where: { id: referralWalletTransactionId },
          data: {
            type: ReferralWalletTransactionType.PAID_WITHDRAWAL,
            status: ReferralWalletTransactionStatus.PAID,
            description: 'Referral payout confirmed by provider callback',
          },
        })
        await tx.referralProfile.update({
          where: { id: referralWithdrawal.referrerProfileId },
          data: { withdrawnAmountUgx: { increment: referralWithdrawal.amountUgx } },
        })
      }

      if (isFailed && !referralWalletTransactionId && disbursement.walletId && disbursement.billingTransactionId && disbursement.wallet) {
        const totalDebitUgx = disbursement.billingTransaction?.grossAmountUgx ?? disbursement.amountUgx

        // Credit the wallet back
        await tx.wallet.update({
          where: { id: disbursement.walletId },
          data: { balanceUgx: { increment: totalDebitUgx } },
        })

        // Reverse the billing transaction
        await tx.billingTransaction.update({
          where: { id: disbursement.billingTransactionId },
          data: { status: BillingTransactionStatus.REVERSED },
        })

        // Ledger reversal entries
        await tx.ledgerTransaction.create({
          data: {
            tenantId: disbursement.tenantId,
            walletId: disbursement.walletId,
            reference: `YO-IPN-REVERSAL-${disbursement.reference}`,
            type: LedgerTransactionType.DISBURSEMENT,
            channel: BillingChannel.DISBURSEMENT,
            description: 'Business withdrawal reversed — Yo Uganda payout failed',
            grossAmountUgx: totalDebitUgx,
            feeAmountUgx: 0,
            netAmountUgx: totalDebitUgx,
            sourceType: 'VendorWithdrawalReversal',
            sourceId: disbursement.id,
            metadata: this.toJsonValue({ yoStatus: rawStatus, providerRef }),
            entries: {
              create: [
                {
                  tenantId: disbursement.tenantId,
                  walletId: disbursement.walletId,
                  accountCode: 'tenant_wallet',
                  direction: LedgerDirection.CREDIT,
                  amountUgx: totalDebitUgx,
                  memo: 'Withdrawal reversed — Yo Uganda payout failed',
                },
                {
                  tenantId: disbursement.tenantId,
                  accountCode: 'disbursement_clearing',
                  direction: LedgerDirection.DEBIT,
                  amountUgx: disbursement.amountUgx,
                  memo: 'Disbursement clearing released',
                },
                ...(totalDebitUgx > disbursement.amountUgx
                  ? [{
                      tenantId: disbursement.tenantId,
                      accountCode: 'platform_revenue',
                      direction: LedgerDirection.DEBIT,
                      amountUgx: totalDebitUgx - disbursement.amountUgx,
                      memo: 'Withdrawal fee reversed',
                    }]
                  : []),
              ],
            },
          },
        })
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId: disbursement.tenantId,
          action: isSuccess ? 'withdrawal.completed' : 'withdrawal.failed',
          entity: 'Disbursement',
          entityId: disbursement.id,
          severity: isFailed ? AuditSeverity.WARNING : AuditSeverity.INFO,
          details: {
            yoStatus: rawStatus,
            providerRef,
            externalRef,
            source: 'yo_ipn_webhook',
          },
        },
      })
    })

    this.logger.log(
      `Yo Uganda disbursement IPN processed: ref=${disbursement.reference} → ${nextStatus}`,
    )

    return { received: true, matched: true, processed: true, status: nextStatus }
  }

  private isSmartTvPackage(pkg?: { name?: string | null; code?: string | null; description?: string | null }) {
    if (!pkg) return false
    const haystack = `${pkg.name ?? ''} ${pkg.code ?? ''} ${pkg.description ?? ''}`.toLowerCase()
    return haystack.includes('tv') || haystack.includes('smart') || haystack.includes('stream')
  }

  private isTrialPackage(
    pkg?: { isTrialEnabled?: boolean | null; name?: string | null; code?: string | null; description?: string | null },
    amountUgx?: number | null,
  ) {
    if (!pkg) return false
    const haystack = `${pkg.name ?? ''} ${pkg.code ?? ''} ${pkg.description ?? ''}`.toLowerCase()
    return Boolean(pkg.isTrialEnabled) || haystack.includes('trial') || Number(amountUgx ?? 0) <= 0
  }
}
