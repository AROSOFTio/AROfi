import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { PaymentEventType, PaymentStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { PaymentRouterService } from './payment-router.service'
import { PaymentsService } from './payments.service'

type MutablePaymentsService = PaymentsService & {
  checkPaymentStatus: (paymentId: string, tenantId?: string, statusToken?: string) => Promise<any>
  initiatePortalPayment: (...args: any[]) => Promise<any>
}

const TERMINAL = new Set<PaymentStatus>([
  PaymentStatus.COMPLETED,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
  PaymentStatus.EXPIRED,
])

/**
 * Captive-payment fast path.
 *
 * The captive browser polls AROFi frequently while the customer approves an
 * MTN/Airtel prompt. A poll must never block on the external provider's status
 * API: those calls can take seconds, which made the portal appear frozen even
 * when the payment had already succeeded via webhook.
 *
 * Public status requests now read our DB immediately and launch a throttled
 * provider reconciliation in the background. Provider webhooks and background
 * reconciliation both update the same payment row; the next lightweight poll
 * sees COMPLETED + reconnect credentials and posts them straight to RouterOS.
 * Admin reconciliation keeps the original synchronous behaviour.
 */
@Injectable()
export class PortalPaymentFastPathInitializer implements OnModuleInit {
  private readonly logger = new Logger(PortalPaymentFastPathInitializer.name)
  private readonly inFlight = new Set<string>()
  private readonly nextProbeAt = new Map<string, number>()
  private readonly failures = new Map<string, number>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRouter: PaymentRouterService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onModuleInit() {
    const service = this.paymentsService as MutablePaymentsService
    const originalCheck = service.checkPaymentStatus.bind(service)
    const originalInitiate = service.initiatePortalPayment.bind(service)

    service.checkPaymentStatus = async (paymentId: string, tenantId?: string, statusToken?: string) => {
      // Admin/manual reconciliation intentionally remains synchronous so an
      // operator gets the provider's current answer in the same request.
      if (tenantId) {
        return originalCheck(paymentId, tenantId, statusToken)
      }

      const payment = await this.readPortalPayment(paymentId)
      if (!payment) {
        throw new NotFoundException('Payment not found')
      }
      if (!payment.statusToken || payment.statusToken !== statusToken) {
        throw new ForbiddenException('Payment status token is required')
      }

      if (!TERMINAL.has(payment.status)) {
        void this.reconcileInBackground(payment.id)
      }

      return this.attachReconnect(payment)
    }

    // Start the first status probe as soon as the collection request has been
    // accepted. The browser does not need to wait for its first poll to trigger
    // provider reconciliation.
    service.initiatePortalPayment = async (...args: any[]) => {
      const result = await originalInitiate(...args)
      if (result?.id && result?.status && !TERMINAL.has(result.status)) {
        void this.reconcileInBackground(result.id)
      }
      return result
    }
  }

  private readPortalPayment(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        activation: {
          include: {
            radiusCredential: true,
          },
        },
      },
    })
  }

  private attachReconnect(payment: any) {
    const service = this.paymentsService as any
    return service.attachReconnectPayload(payment)
  }

  private async reconcileInBackground(paymentId: string) {
    const now = Date.now()
    if (this.inFlight.has(paymentId) || (this.nextProbeAt.get(paymentId) ?? 0) > now) {
      return
    }

    this.inFlight.add(paymentId)
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          status: true,
          network: true,
          provider: true,
          providerReference: true,
          externalReference: true,
        },
      })
      if (!payment || TERMINAL.has(payment.status)) {
        this.nextProbeAt.delete(paymentId)
        this.failures.delete(paymentId)
        return
      }

      const referenceId = payment.providerReference ?? payment.externalReference
      const gatewayResponse = await this.paymentRouter
        .resolveCollection(payment.network, payment.provider)
        .getPaymentStatus(referenceId)

      const service = this.paymentsService as any
      const mappedStatus = service.mapProviderStatus(gatewayResponse) as PaymentStatus
      this.failures.delete(paymentId)

      if (TERMINAL.has(mappedStatus)) {
        // A webhook may have completed the payment while this provider request
        // was in flight. Never let an older status response overwrite a state
        // that has already become terminal (especially COMPLETED -> FAILED).
        const current = await this.prisma.payment.findUnique({
          where: { id: paymentId },
          select: { status: true },
        })
        if (!current || TERMINAL.has(current.status)) {
          this.nextProbeAt.delete(paymentId)
          return
        }

        this.nextProbeAt.delete(paymentId)
        await service.applyProviderTransition(paymentId, gatewayResponse, {
          eventType: PaymentEventType.STATUS_CHECK,
          notes: gatewayResponse.statusMessage ?? 'Background captive payment status check completed',
          payload: gatewayResponse,
        })
        return
      }

      // Do not write another PENDING webhook/event every few hundred ms. The
      // initiation row already records pending state; just schedule the next
      // provider probe while browser polls remain cheap DB reads.
      this.nextProbeAt.set(paymentId, Date.now() + 350)
    } catch (error) {
      const failures = Math.min((this.failures.get(paymentId) ?? 0) + 1, 5)
      this.failures.set(paymentId, failures)
      const delay = Math.min(8_000, 350 * 2 ** failures)
      this.nextProbeAt.set(paymentId, Date.now() + delay)
      this.logger.warn(
        `Background captive payment reconciliation failed for ${paymentId}; retrying after ${delay}ms: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    } finally {
      this.inFlight.delete(paymentId)
    }
  }
}
