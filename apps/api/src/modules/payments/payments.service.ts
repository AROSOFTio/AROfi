import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  BillingChannel,
  BillingTransactionType,
  PackageActivationStatus,
  PackageActivationSource,
  PaymentMethod,
  PackageStatus,
  PaymentEventType,
  PaymentNetwork,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client'
import { createHash, randomBytes, randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { BillingService } from '../billing/billing.service'
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
  ) {}

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

  async getPortalContext(tenantDomain?: string, phoneNumber?: string) {
    const tenant = await this.resolvePortalTenant(tenantDomain)
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
    const availablePaymentNetworks = platformSettings.allowedPaymentNetworks.filter((network) => {
      if (network === PaymentNetwork.MTN) return readiness.collection.MTN.ready
      if (network === PaymentNetwork.AIRTEL) return readiness.collection.AIRTEL.ready
      return false
    })

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        logoUrl: tenant.logoUrl,
        brandColor: tenant.brandColor,
        supportPhone: tenant.supportPhone,
        supportEmail: tenant.supportEmail,
      },
      packages: packages.map((pkg) => {
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
          amountUgx: activePrice?.amountUgx ?? 0,
        }
      }),
      paymentNetworks: availablePaymentNetworks,
      activeActivation,
      latestPayment,
    }
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
      throw new BadRequestException('Package does not belong to the requested tenant portal')
    }

    const activePrice = pkg.prices.find((price) => price.endsAt === null) ?? pkg.prices[0]

    if (!activePrice) {
      throw new BadRequestException('Package has no active price configured')
    }

    if (dto.network !== PaymentNetwork.MTN && dto.network !== PaymentNetwork.AIRTEL) {
      throw new BadRequestException('Select MTN or Airtel before paying')
    }

    const network = dto.network
    const provider = this.paymentRouterService.providerFor(network, 'COLLECTION')
    const method = PaymentMethod.MOBILE_MONEY
    const phoneNumber = this.phoneNumberService.normalizeForNetwork(dto.phoneNumber, network)
    const normalizedMac = this.normalizeMac(dto.macAddress)

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
      const message = error instanceof Error ? error.message : 'Unable to submit the payment request'

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
      return this.getPayment(payment.id)
    }

    const referenceId = payment.providerReference ?? payment.externalReference
    const gatewayResponse = await this.paymentRouterService
      .resolveCollection(payment.network)
      .getPaymentStatus(referenceId)

    return this.applyProviderTransition(payment.id, gatewayResponse, {
      eventType: PaymentEventType.STATUS_CHECK,
      notes: gatewayResponse.statusMessage ?? 'Payment status check completed',
      payload: gatewayResponse,
    })
  }

  async handleProviderWebhook(
    provider: PaymentProvider,
    network: PaymentNetwork,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    direction: 'collection' | 'disbursement',
  ) {
    const extracted = this.extractWebhookReferences(payload)
    const payment = await this.findPaymentByReferences(extracted.externalReference, extracted.providerReference)
    const idempotencyKey = this.buildWebhookIdempotencyKey(provider, extracted.externalReference, extracted.providerReference, payload)
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
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: this.paymentInclude,
      })

      if (!payment) {
        throw new NotFoundException('Payment not found')
      }

      const nextStatus = this.mapProviderStatus(gatewayResponse)
      if (payment.status === PaymentStatus.COMPLETED && nextStatus === PaymentStatus.COMPLETED) {
        const completedPayment = await tx.payment.findUnique({
          where: { id: payment.id },
          include: this.paymentDetailInclude,
        })
        return this.attachReconnectPayload(completedPayment)
      }
      const now = new Date()
      const providerReference =
        gatewayResponse.transactionReference ??
        gatewayResponse.orderTrackingId ??
        payment.providerReference
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          providerReference,
          providerStatus: gatewayResponse.transactionStatus ?? payment.providerStatus,
          statusMessage:
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
            customerReference: payment.customerReference ?? payment.phoneNumber,
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

        const activation = await this.packageActivationService.activateInTransaction(tx, {
          tenantId: payment.tenantId,
          packageId: payment.packageId,
          paymentId: payment.id,
          source: PackageActivationSource.MOBILE_MONEY,
          customerReference: payment.customerReference ?? payment.phoneNumber,
          accessPhoneNumber: payment.phoneNumber,
          durationMinutes: packageRecord.durationMinutes,
          dataLimitMb: packageRecord.dataLimitMb,
          deviceLimit: packageRecord.deviceLimit,
          downloadSpeedKbps: packageRecord.downloadSpeedKbps,
          uploadSpeedKbps: packageRecord.uploadSpeedKbps,
          boundMacAddress: this.readMetadataString(payment.metadata, 'macAddress'),
          firstSeenIp: this.readMetadataString(payment.metadata, 'clientIp'),
          routerId: this.readMetadataString(payment.metadata, 'routerId'),
          hotspotServerName: this.readMetadataString(payment.metadata, 'hotspotServerName'),
          metadata: this.toJsonValue({
            paymentId: payment.id,
            providerReference,
            provider: payment.provider,
            method: payment.method,
            macAddress: this.readMetadataString(payment.metadata, 'macAddress'),
            clientIp: this.readMetadataString(payment.metadata, 'clientIp'),
            routerId: this.readMetadataString(payment.metadata, 'routerId'),
            routerKey: this.readMetadataString(payment.metadata, 'routerKey'),
            hotspotServerName: this.readMetadataString(payment.metadata, 'hotspotServerName'),
            loginUrl: this.readMetadataString(payment.metadata, 'loginUrl'),
          }),
        })

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            billingTransactionId: billingTransaction.id,
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
  }

  private attachReconnectPayload<T extends { status: PaymentStatus; activation?: {
    radiusUsername?: string | null
    radiusPassword?: string | null
    radiusCredential?: { username: string; password: string } | null
    routerId?: string | null
    hotspotServerName?: string | null
    endsAt?: Date
  } | null; metadata?: Prisma.JsonValue | null } | null>(payment: T) {
    if (!payment || payment.status !== PaymentStatus.COMPLETED || !payment.activation) {
      return payment
    }

    const loginUrl = this.readMetadataString(payment.metadata, 'loginUrl')
    const username = payment.activation.radiusCredential?.username ?? payment.activation.radiusUsername
    const password = payment.activation.radiusCredential?.password ?? payment.activation.radiusPassword

    return {
      ...payment,
      reconnect: {
        method: 'mikrotik-hotspot-post',
        loginUrl: loginUrl ?? null,
        username: username ?? null,
        password: password ?? null,
        routerId: payment.activation.routerId ?? this.readMetadataString(payment.metadata, 'routerId') ?? null,
        hotspotServerName:
          payment.activation.hotspotServerName ?? this.readMetadataString(payment.metadata, 'hotspotServerName') ?? null,
        expiresAt: payment.activation.endsAt ?? null,
        fallbackMessage:
          loginUrl && username && password
            ? null
            : 'Payment confirmed, but automatic connection needs the hotspot login URL from the router. Tap Connect Now if you are still on the Wi-Fi login page.',
      },
    }
  }

  private async resolvePortalTenant(tenantDomain?: string) {
    if (tenantDomain) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { domain: tenantDomain },
      })

      if (!tenant) {
        throw new NotFoundException('Tenant portal not found')
      }

      return tenant
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        packages: {
          some: {
            status: PackageStatus.ACTIVE,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!tenant) {
      throw new NotFoundException('No tenant with an active package catalog was found')
    }

    return tenant
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
      throw new BadRequestException('Router registration context does not belong to this tenant portal')
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
    payload?: unknown,
  ) {
    const raw = JSON.stringify({
      provider,
      externalReference,
      providerReference,
      payload,
    })
    return createHash('sha256').update(raw).digest('hex')
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
      merchantReference: this.readPayloadValue(payload, ['merchant_reference', 'MerchantReference'])?.toString(),
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
          'network_ref',
          'providerReference',
          'order_tracking_id',
          'OrderTrackingId',
          'orderTrackingId',
        ])?.toString(),
    }
  }

  private buildPortalPaymentReturnUrl(paymentId: string, statusToken?: string | null) {
    const base = this.configService.get<string>('PORTAL_BASE_URL') ?? this.configService.get<string>('APP_BASE_URL') ?? 'https://arofi.arosoft.io/portal'
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
}
