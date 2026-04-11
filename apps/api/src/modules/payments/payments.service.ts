import {
  BadRequestException,
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
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { BillingService } from '../billing/billing.service'
import { InitiatePortalPaymentDto } from './dto/initiate-portal-payment.dto'
import { PackageActivationService } from './package-activation.service'
import { PesapalGatewayResponse, PesapalGatewayService } from './pesapal.gateway.service'
import { YoGatewayResponse, YoUgandaGatewayService } from './yo-uganda.gateway.service'

type ProviderGatewayResponse = YoGatewayResponse &
  PesapalGatewayResponse & {
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
    private readonly yoUgandaGatewayService: YoUgandaGatewayService,
    private readonly pesapalGatewayService: PesapalGatewayService,
    private readonly packageActivationService: PackageActivationService,
  ) {}

  async getOverview(tenantId?: string) {
    const [payments, recentLogs, activeActivations] = await Promise.all([
      this.prisma.payment.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: this.paymentInclude,
        orderBy: { createdAt: 'desc' },
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

    const provider = this.resolvePaymentProvider(dto.provider)
    const method = this.resolvePaymentMethod(provider, dto.method)
    const network =
      method === PaymentMethod.CARD
        ? PaymentNetwork.UNKNOWN
        : dto.network ?? PaymentNetwork.UNKNOWN

    if (provider === PaymentProvider.YO_UGANDA && method !== PaymentMethod.MOBILE_MONEY) {
      throw new BadRequestException('Yo Uganda supports only mobile money collections')
    }

    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber)
    const idempotencyKey = dto.idempotencyKey?.trim() || randomUUID()
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
      include: this.paymentDetailInclude,
    })

    if (existingPayment) {
      return existingPayment
    }

    const externalReference = this.buildExternalReference()
    const requestMetadata = this.toJsonValue({
      hotspotName: dto.hotspotName,
      sessionReference: dto.sessionReference,
      tenantDomain: dto.tenantDomain ?? pkg.tenant.domain,
      provider,
      method,
      network,
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
        customerReference: dto.customerReference,
        externalReference,
        idempotencyKey,
        requestPayload: requestMetadata,
        metadata: requestMetadata,
      },
    })

    try {
      const gatewayResponse =
        provider === PaymentProvider.PESAPAL
          ? await this.pesapalGatewayService.initiateCheckout({
              amountUgx: activePrice.amountUgx,
              phoneNumber,
              externalReference,
              customerReference: dto.customerReference ?? phoneNumber,
              narrative: `${pkg.name} internet package`,
              method,
              network,
              callbackUrl: this.buildPesapalCallbackUrl(externalReference),
            })
          : await this.yoUgandaGatewayService.initiateCollection({
              amountUgx: activePrice.amountUgx,
              phoneNumber,
              externalReference,
              internalReference: dto.sessionReference,
              narrative: `${pkg.name} internet package`,
              providerReferenceText: 'AROFi Internet Access',
              instantNotificationUrl: this.buildWebhookUrl('instant', externalReference),
              failureNotificationUrl: this.buildWebhookUrl('failure', externalReference),
              network: network === PaymentNetwork.UNKNOWN ? undefined : network,
            })

      return this.applyProviderTransition(payment.id, gatewayResponse, {
        eventType: PaymentEventType.REQUESTED,
        notes:
          gatewayResponse.statusMessage ??
          (provider === PaymentProvider.PESAPAL
            ? 'Pesapal checkout initialized'
            : 'Yo Uganda collection request submitted'),
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

  async checkPaymentStatus(paymentId: string, tenantId?: string) {
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

    if (this.terminalPaymentStatuses.has(payment.status)) {
      return this.getPayment(payment.id)
    }

    const gatewayResponse =
      payment.provider === PaymentProvider.PESAPAL
        ? await this.pesapalGatewayService.checkTransactionStatus({
            orderTrackingId: payment.providerReference,
            externalReference: payment.externalReference,
          })
        : await this.yoUgandaGatewayService.checkTransactionStatus({
            transactionReference: payment.providerReference,
            externalReference: payment.externalReference,
          })

    return this.applyProviderTransition(payment.id, gatewayResponse, {
      eventType: PaymentEventType.STATUS_CHECK,
      notes:
        gatewayResponse.statusMessage ??
        (payment.provider === PaymentProvider.PESAPAL
          ? 'Pesapal status check completed'
          : 'Yo Uganda status check completed'),
      payload: gatewayResponse,
    })
  }

  async handleYoWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    token?: string,
    event?: string,
    externalReferenceHint?: string,
  ) {
    const extracted = this.extractWebhookReferences(payload, externalReferenceHint)
    const payment = await this.findPaymentByReferences(extracted.externalReference, extracted.providerReference)
    const tokenAccepted = this.verifyWebhookToken(token)

    await this.prisma.paymentWebhook.create({
      data: {
        tenantId: payment?.tenantId,
        paymentId: payment?.id,
        provider: PaymentProvider.YO_UGANDA,
        eventType: PaymentEventType.WEBHOOK_RECEIVED,
        externalReference: extracted.externalReference,
        providerReference: extracted.providerReference,
        verificationStatus: tokenAccepted ? 'accepted' : 'rejected',
        headers: this.toJsonValue(headers),
        payload: this.toJsonValue(payload),
        notes: event ? `Yo Uganda webhook received (${event})` : 'Yo Uganda webhook received',
      },
    })

    if (!tokenAccepted) {
      await this.prisma.paymentWebhook.create({
        data: {
          tenantId: payment?.tenantId,
          paymentId: payment?.id,
          provider: PaymentProvider.YO_UGANDA,
          eventType: PaymentEventType.WEBHOOK_REJECTED,
          externalReference: extracted.externalReference,
          providerReference: extracted.providerReference,
          verificationStatus: 'rejected',
          headers: this.toJsonValue(headers),
          payload: this.toJsonValue(payload),
          notes: 'Webhook token rejected',
        },
      })

      return {
        received: true,
        matched: Boolean(payment),
        processed: false,
        reason: 'Webhook token rejected',
      }
    }

    if (!payment) {
      return {
        received: true,
        matched: false,
        processed: false,
      }
    }

    if (payment.provider !== PaymentProvider.YO_UGANDA) {
      return {
        received: true,
        matched: true,
        processed: false,
        reason: 'Payment provider mismatch',
      }
    }

    const gatewayResponse = this.mapWebhookToGatewayResponse(payload, event)
    const updatedPayment = await this.applyProviderTransition(payment.id, gatewayResponse, {
      eventType: PaymentEventType.WEBHOOK_PROCESSED,
      notes: event ? `Webhook processed (${event})` : 'Webhook processed',
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

  async handlePesapalWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    token?: string,
    orderTrackingId?: string,
    merchantReference?: string,
    eventType?: string,
  ) {
    const providerReference =
      orderTrackingId ??
      this.readPayloadValue(payload, ['orderTrackingId', 'OrderTrackingId', 'tracking_id'])?.toString()
    const externalReference =
      merchantReference ??
      this.readPayloadValue(payload, [
        'merchantReference',
        'OrderMerchantReference',
        'merchant_reference',
        'externalReference',
      ])?.toString()
    const payment = await this.findPaymentByReferences(externalReference, providerReference)
    const tokenAccepted = this.verifyPesapalWebhookToken(token)

    await this.prisma.paymentWebhook.create({
      data: {
        tenantId: payment?.tenantId,
        paymentId: payment?.id,
        provider: PaymentProvider.PESAPAL,
        eventType: PaymentEventType.WEBHOOK_RECEIVED,
        externalReference,
        providerReference,
        verificationStatus: tokenAccepted ? 'accepted' : 'rejected',
        headers: this.toJsonValue(headers),
        payload: this.toJsonValue(payload),
        notes: eventType ? `Pesapal webhook received (${eventType})` : 'Pesapal webhook received',
      },
    })

    if (!tokenAccepted) {
      await this.prisma.paymentWebhook.create({
        data: {
          tenantId: payment?.tenantId,
          paymentId: payment?.id,
          provider: PaymentProvider.PESAPAL,
          eventType: PaymentEventType.WEBHOOK_REJECTED,
          externalReference,
          providerReference,
          verificationStatus: 'rejected',
          headers: this.toJsonValue(headers),
          payload: this.toJsonValue(payload),
          notes: 'Pesapal webhook token rejected',
        },
      })

      return {
        received: true,
        matched: Boolean(payment),
        processed: false,
        reason: 'Webhook token rejected',
      }
    }

    if (!payment) {
      return {
        received: true,
        matched: false,
        processed: false,
      }
    }

    if (payment.provider !== PaymentProvider.PESAPAL) {
      return {
        received: true,
        matched: true,
        processed: false,
        reason: 'Payment provider mismatch',
      }
    }

    const gatewayResponse = await this.pesapalGatewayService.checkTransactionStatus({
      orderTrackingId: providerReference ?? payment.providerReference,
      externalReference: externalReference ?? payment.externalReference,
    })

    const updatedPayment = await this.applyProviderTransition(payment.id, gatewayResponse, {
      eventType: PaymentEventType.WEBHOOK_PROCESSED,
      notes: eventType ? `Pesapal webhook processed (${eventType})` : 'Pesapal webhook processed',
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
            paymentMethod: gatewayResponse.paymentMethod,
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
          eventType: log.eventType,
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
            description: `${payment.method === PaymentMethod.CARD ? 'Card' : 'Mobile money'} payment settled via ${payment.provider === PaymentProvider.PESAPAL ? 'Pesapal' : 'Yo! Uganda'}`,
            customerReference: payment.customerReference ?? payment.phoneNumber,
            externalReference: payment.externalReference,
            paymentProvider: payment.provider === PaymentProvider.PESAPAL ? 'Pesapal' : 'Yo! Uganda',
            metadata: this.toJsonValue({
              paymentId: payment.id,
              providerReference,
              network: payment.network,
              provider: payment.provider,
              method: payment.method,
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
          metadata: this.toJsonValue({
            paymentId: payment.id,
            providerReference,
            provider: payment.provider,
            method: payment.method,
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

      return tx.payment.findUnique({
        where: { id: payment.id },
        include: this.paymentDetailInclude,
      })
    })
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

  private buildWebhookUrl(event: 'instant' | 'failure', externalReference: string) {
    const baseUrl = this.configService.get<string>('YO_WEBHOOK_BASE_URL')

    if (!baseUrl) {
      return undefined
    }

    const url = new URL(baseUrl)
    const token = this.configService.get<string>('YO_WEBHOOK_TOKEN')

    url.searchParams.set('event', event)
    url.searchParams.set('externalReference', externalReference)

    if (token) {
      url.searchParams.set('token', token)
    }

    return url.toString()
  }

  private buildPesapalCallbackUrl(externalReference: string) {
    const configured = this.configService.get<string>('PESAPAL_CALLBACK_URL')

    if (!configured) {
      return undefined
    }

    try {
      const url = new URL(configured)
      const token = this.configService.get<string>('PESAPAL_WEBHOOK_TOKEN')

      url.searchParams.set('externalReference', externalReference)

      if (token) {
        url.searchParams.set('token', token)
      }

      return url.toString()
    } catch {
      return undefined
    }
  }

  private verifyWebhookToken(token?: string) {
    const configuredToken = this.configService.get<string>('YO_WEBHOOK_TOKEN')

    if (!configuredToken) {
      return true
    }

    return token === configuredToken
  }

  private verifyPesapalWebhookToken(token?: string) {
    const configuredToken = this.configService.get<string>('PESAPAL_WEBHOOK_TOKEN')

    if (!configuredToken) {
      return true
    }

    return token === configuredToken
  }

  private buildExternalReference() {
    return `AROFI-PAY-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`
  }

  private mapProviderStatus(gatewayResponse: ProviderGatewayResponse) {
    const providerStatus = (gatewayResponse.transactionStatus ?? '').toUpperCase()

    if (providerStatus === 'SUCCEEDED' || providerStatus === 'PAID' || providerStatus === 'COMPLETED') {
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

  private mapWebhookToGatewayResponse(payload: Record<string, unknown>, event?: string): YoGatewayResponse {
    const transactionStatus = (
      this.readPayloadValue(payload, [
        'TransactionStatus',
        'transactionStatus',
        'transaction_status',
        'TransactionStatusName',
      ]) ??
      (event === 'failure' ? 'FAILED' : undefined) ??
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
        ])?.toString() ?? externalReferenceHint,
      providerReference:
        this.readPayloadValue(payload, [
          'TransactionReference',
          'transactionReference',
          'network_ref',
          'providerReference',
        ])?.toString(),
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

  private resolvePaymentProvider(provider?: PaymentProvider) {
    if (provider) {
      return provider
    }

    const configured = (this.configService.get<string>('PAYMENT_DEFAULT_PROVIDER') ?? 'YO_UGANDA').toUpperCase()
    return configured === PaymentProvider.PESAPAL ? PaymentProvider.PESAPAL : PaymentProvider.YO_UGANDA
  }

  private resolvePaymentMethod(provider: PaymentProvider, method?: PaymentMethod) {
    if (provider === PaymentProvider.YO_UGANDA) {
      return PaymentMethod.MOBILE_MONEY
    }

    if (method === PaymentMethod.CARD) {
      return PaymentMethod.CARD
    }

    return PaymentMethod.MOBILE_MONEY
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue
  }
}
