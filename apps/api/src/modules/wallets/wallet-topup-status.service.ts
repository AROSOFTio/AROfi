import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  BillingTransactionStatus,
  PaymentProvider,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { PaymentRouterService } from '../payments/payment-router.service'
import { PhoneNumberService } from '../payments/phone-number.service'

/**
 * Reconciles tenant wallet top-ups without allowing duplicate wallet credits.
 *
 * The legacy WalletsService status path read PENDING outside the transaction and
 * then incremented the wallet inside a later transaction. Two simultaneous
 * status polls could therefore both observe PENDING and both credit the same
 * payment. This service uses an atomic conditional state transition as the
 * claim: only the request that successfully changes PENDING -> COMPLETED may
 * increment the wallet.
 *
 * Payment-provider routing itself is deliberately unchanged. Historical
 * transactions reuse the provider saved in metadata; older rows fall back to
 * the currently selected platform gateway.
 */
@Injectable()
export class WalletTopupStatusService {
  private readonly logger = new Logger(WalletTopupStatusService.name)
  private readonly amountToleranceUgx = 1

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRouterService: PaymentRouterService,
    private readonly phoneNumberService: PhoneNumberService,
  ) {}

  async check(reference: string, tenantId: string) {
    const txRecord = await this.prisma.billingTransaction.findUnique({
      where: { externalReference: reference },
    })

    if (!txRecord || txRecord.tenantId !== tenantId) {
      throw new NotFoundException('Topup transaction not found')
    }

    if (txRecord.status !== BillingTransactionStatus.PENDING) {
      return txRecord
    }

    const network = this.phoneNumberService.resolveNetwork(txRecord.customerReference || '')
    const metadata = this.objectMetadata(txRecord.metadata)
    const historicalProvider = this.readPaymentProvider(metadata.provider)
    const platformSettings = historicalProvider
      ? null
      : await this.prisma.platformSetting.upsert({
          where: { id: 'global' },
          update: {},
          create: { id: 'global' },
        })

    const provider = this.paymentRouterService.resolveCollection(
      network,
      historicalProvider ?? platformSettings?.paymentGateway,
    )
    const providerReference =
      typeof metadata.providerReference === 'string' && metadata.providerReference.trim()
        ? metadata.providerReference.trim()
        : txRecord.externalReference || reference

    try {
      const gatewayResponse = await provider.getPaymentStatus(providerReference)
      const providerStatus = String(
        gatewayResponse.transactionStatus ?? gatewayResponse.status ?? '',
      ).toUpperCase()

      if (this.isSuccessful(providerStatus)) {
        const paidAmount = this.parseAmountUgx(gatewayResponse.amount)
        if (
          paidAmount !== null &&
          paidAmount + this.amountToleranceUgx < txRecord.grossAmountUgx
        ) {
          this.logger.error(
            `Wallet topup ${reference} rejected because provider amount was below the requested amount.`,
          )
          await this.prisma.billingTransaction.updateMany({
            where: {
              id: txRecord.id,
              tenantId,
              status: BillingTransactionStatus.PENDING,
            },
            data: {
              status: BillingTransactionStatus.FAILED,
              metadata: {
                ...metadata,
                provider: provider.provider,
                providerReference:
                  gatewayResponse.transactionReference || providerReference,
                reconciliation: 'provider_amount_mismatch',
              },
            },
          })
          return this.reload(reference)
        }

        await this.prisma.$transaction(async (tx) => {
          // Atomic idempotency gate. Exactly one concurrent caller can claim
          // this PENDING transaction and therefore exactly one can credit it.
          const claimed = await tx.billingTransaction.updateMany({
            where: {
              id: txRecord.id,
              tenantId,
              status: BillingTransactionStatus.PENDING,
            },
            data: {
              status: BillingTransactionStatus.COMPLETED,
              metadata: {
                ...metadata,
                provider: provider.provider,
                providerReference:
                  gatewayResponse.transactionReference || providerReference,
                reconciledAt: new Date().toISOString(),
              },
            },
          })

          if (claimed.count !== 1) {
            return
          }

          if (txRecord.walletId) {
            // Preserve the existing top-up accounting behavior exactly: the
            // top-up immediately changes balanceUgx. earnedBalanceUgx is still
            // normalized by the existing wallet reconciliation path.
            await tx.wallet.update({
              where: { id: txRecord.walletId },
              data: {
                balanceUgx: { increment: txRecord.grossAmountUgx },
              },
            })
          }
        })
      } else if (this.isFailed(providerStatus)) {
        await this.prisma.billingTransaction.updateMany({
          where: {
            id: txRecord.id,
            tenantId,
            status: BillingTransactionStatus.PENDING,
          },
          data: {
            status: BillingTransactionStatus.FAILED,
            metadata: {
              ...metadata,
              provider: provider.provider,
              providerReference:
                gatewayResponse.transactionReference || providerReference,
            },
          },
        })
      }
    } catch (error) {
      // Preserve the existing UX: temporary provider-status failures leave the
      // top-up pending rather than falsely failing or crediting it.
      this.logger.warn(
        `Unable to reconcile wallet topup ${reference}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    return this.reload(reference)
  }

  private reload(reference: string) {
    return this.prisma.billingTransaction.findUnique({
      where: { externalReference: reference },
    })
  }

  private isSuccessful(status: string) {
    return ['SUCCESSFUL', 'SUCCEEDED', 'PAID', 'COMPLETED', 'SUCCESS'].includes(status)
  }

  private isFailed(status: string) {
    return ['FAILED', 'REJECTED', 'DECLINED', 'CANCELLED', 'ROLLEDBACK'].includes(status)
  }

  private readPaymentProvider(value: unknown): PaymentProvider | undefined {
    if (typeof value !== 'string') return undefined
    return Object.values(PaymentProvider).includes(value as PaymentProvider)
      ? (value as PaymentProvider)
      : undefined
  }

  private objectMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  }

  private parseAmountUgx(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value)
    }
    if (typeof value !== 'string') return null
    const normalized = value.replace(/,/g, '').trim()
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? Math.round(parsed) : null
  }
}
