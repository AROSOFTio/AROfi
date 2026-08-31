import {
  AuditSeverity,
  BillingChannel,
  BillingTransactionStatus,
  DisbursementStatus,
  LedgerDirection,
  LedgerTransactionType,
  PaymentNetwork,
  Prisma,
} from '@prisma/client'
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { PLATFORM_SETTINGS_ID } from '../billing/billing.constants'
import { PaymentRouterService } from '../payments/payment-router.service'

const SAFE_CANCEL_STATUSES: DisbursementStatus[] = [
  DisbursementStatus.PENDING,
  DisbursementStatus.PENDING_APPROVAL,
  DisbursementStatus.PENDING_NUMBER_APPROVAL,
  DisbursementStatus.FLAGGED_FOR_REVIEW,
]

const TERMINAL_SUCCESS = new Set(['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'SUCCEEDED', 'PAID'])
const TERMINAL_FAILURE = new Set(['FAILED', 'REJECTED', 'DECLINED', 'TIMEOUT', 'ROLLEDBACK'])
const TERMINAL_CANCELLED = new Set(['CANCELLED', 'CANCELED', 'EXPIRED'])

@Injectable()
export class WithdrawalOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRouterService: PaymentRouterService,
  ) {}

  async getDiagnostics(disbursementId: string, scopedTenantId?: string, checkProvider = false) {
    const disbursement = await this.getScopedWithdrawal(disbursementId, scopedTenantId)
    const billingTransaction = disbursement.billingTransactionId
      ? await this.prisma.billingTransaction.findUnique({ where: { id: disbursement.billingTransactionId } })
      : null
    const auditTrail = await this.prisma.auditLog.findMany({
      where: { entity: 'Disbursement', entityId: disbursement.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const metadata = this.objectMetadata(disbursement.metadata)
    const providerSubmitted = Boolean(
      disbursement.providerReference ||
      metadata.providerResponse ||
      disbursement.status === DisbursementStatus.PROCESSING ||
      disbursement.status === DisbursementStatus.COMPLETED,
    )

    let providerStatus: Record<string, unknown> | null = null
    let providerError: string | null = null
    if (checkProvider && disbursement.status === DisbursementStatus.PROCESSING && disbursement.network) {
      try {
        const provider = this.paymentRouterService.resolveDisbursement(disbursement.network)
        const response = await provider.getDisbursementStatus(disbursement.providerReference || disbursement.reference)
        providerStatus = this.sanitizeProviderResponse(response)
      } catch (error) {
        providerError = error instanceof Error ? error.message : 'Provider status check failed'
      }
    }

    const canCancel = SAFE_CANCEL_STATUSES.includes(disbursement.status) && !providerSubmitted
    const canRefreshProvider = disbursement.status === DisbursementStatus.PROCESSING && Boolean(disbursement.network)

    return {
      withdrawal: {
        id: disbursement.id,
        reference: disbursement.reference,
        status: disbursement.status,
        amountUgx: disbursement.amountUgx,
        network: disbursement.network,
        destinationReference: disbursement.destinationReference,
        provider: disbursement.provider,
        providerReference: disbursement.providerReference,
        notes: disbursement.notes,
        createdAt: disbursement.createdAt,
        completedAt: disbursement.completedAt,
        failedAt: disbursement.failedAt,
      },
      reserve: billingTransaction
        ? {
            billingTransactionId: billingTransaction.id,
            billingStatus: billingTransaction.status,
            totalDebitUgx: billingTransaction.grossAmountUgx,
            feeAmountUgx: billingTransaction.feeAmountUgx,
            walletId: billingTransaction.walletId,
          }
        : null,
      safety: {
        providerSubmitted,
        canCancel,
        canRefreshProvider,
        cancellationReason: canCancel
          ? 'Funds are reserved but the payout has not been submitted to the provider.'
          : providerSubmitted
            ? 'This payout may already have reached the mobile-money provider. A local cancel could create a double-payment/refund risk, so refresh provider status instead.'
            : 'This withdrawal is already in a terminal state.',
        retryPolicy:
          disbursement.status === DisbursementStatus.FAILED
            ? 'Failed withdrawals release their reserve. Submit a new withdrawal instead of retrying the old provider reference.'
            : null,
      },
      providerStatus,
      providerError,
      auditTrail: auditTrail.map((item) => ({
        id: item.id,
        action: item.action,
        severity: item.severity,
        details: item.details,
        createdAt: item.createdAt,
        userId: item.userId,
      })),
    }
  }

  async cancelWithdrawal(disbursementId: string, actorUserId: string, reason: string, scopedTenantId?: string) {
    const disbursement = await this.getScopedWithdrawal(disbursementId, scopedTenantId)
    if (!SAFE_CANCEL_STATUSES.includes(disbursement.status)) {
      throw new BadRequestException(
        disbursement.status === DisbursementStatus.PROCESSING
          ? 'This withdrawal has already been submitted for provider processing. Refresh provider status before taking any recovery action.'
          : 'Only withdrawals that have not been submitted to the payout provider can be cancelled.',
      )
    }

    const metadata = this.objectMetadata(disbursement.metadata)
    if (disbursement.providerReference || metadata.providerResponse) {
      throw new BadRequestException('Provider submission evidence exists. Cancellation is blocked to prevent a duplicate refund.')
    }
    if (!disbursement.walletId || !disbursement.billingTransactionId) {
      throw new BadRequestException('Withdrawal reserve is incomplete and cannot be cancelled automatically.')
    }

    const billingTransaction = await this.prisma.billingTransaction.findUnique({
      where: { id: disbursement.billingTransactionId },
    })
    if (!billingTransaction) {
      throw new BadRequestException('Withdrawal billing transaction was not found.')
    }

    const totalDebitUgx = billingTransaction.grossAmountUgx
    const cleanReason = reason.trim() || 'Cancelled by account operator'

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.disbursement.updateMany({
        where: {
          id: disbursement.id,
          tenantId: disbursement.tenantId,
          status: { in: SAFE_CANCEL_STATUSES },
          providerReference: null,
        },
        data: {
          status: DisbursementStatus.CANCELLED,
          failedAt: new Date(),
          notes: `Withdrawal cancelled before provider submission. ${cleanReason}`,
          metadata: this.toJsonValue({
            ...metadata,
            cancelledByUserId: actorUserId,
            cancelledAt: new Date().toISOString(),
            cancellationReason: cleanReason,
          }),
        },
      })
      if (claimed.count !== 1) {
        throw new BadRequestException('Withdrawal status changed while cancellation was being processed. Refresh and try again.')
      }

      await tx.wallet.update({
        where: { id: disbursement.walletId! },
        data: { balanceUgx: { increment: totalDebitUgx } },
      })
      if (disbursement.tenantId === 'platform') {
        await tx.platformSetting.update({
          where: { id: PLATFORM_SETTINGS_ID },
          data: { platformWalletBalanceUgx: { increment: totalDebitUgx } },
        })
      }

      await tx.ledgerTransaction.create({
        data: {
          tenantId: disbursement.tenantId,
          walletId: disbursement.walletId,
          reference: `CANCEL-${disbursement.reference}`,
          type: LedgerTransactionType.DISBURSEMENT,
          channel: BillingChannel.DISBURSEMENT,
          description: 'Business withdrawal cancelled before provider submission',
          grossAmountUgx: totalDebitUgx,
          feeAmountUgx: 0,
          netAmountUgx: totalDebitUgx,
          sourceType: 'VendorWithdrawalCancellation',
          sourceId: disbursement.id,
          metadata: this.toJsonValue({ reason: cleanReason, actorUserId }),
          entries: {
            create: [
              {
                tenantId: disbursement.tenantId,
                walletId: disbursement.walletId,
                accountCode: 'tenant_wallet',
                direction: LedgerDirection.CREDIT,
                amountUgx: totalDebitUgx,
                memo: 'Cancelled withdrawal reserve returned',
              },
              {
                tenantId: disbursement.tenantId,
                accountCode: 'disbursement_clearing',
                direction: LedgerDirection.DEBIT,
                amountUgx: disbursement.amountUgx,
                memo: 'Cancelled payout reserve released',
              },
              ...(totalDebitUgx > disbursement.amountUgx
                ? [
                    {
                      tenantId: disbursement.tenantId,
                      accountCode: 'platform_revenue',
                      direction: LedgerDirection.DEBIT,
                      amountUgx: totalDebitUgx - disbursement.amountUgx,
                      memo: 'Cancelled withdrawal charge released',
                    },
                  ]
                : []),
            ],
          },
        },
      })

      await tx.billingTransaction.update({
        where: { id: disbursement.billingTransactionId! },
        data: { status: BillingTransactionStatus.REVERSED },
      })
      await tx.auditLog.create({
        data: {
          tenantId: disbursement.tenantId,
          userId: actorUserId,
          action: 'withdrawal.cancelled',
          entity: 'Disbursement',
          entityId: disbursement.id,
          severity: AuditSeverity.WARNING,
          details: this.toJsonValue({
            previousStatus: disbursement.status,
            status: DisbursementStatus.CANCELLED,
            totalDebitUgx,
            reason: cleanReason,
          }),
        },
      })

      return tx.disbursement.findUnique({ where: { id: disbursement.id } })
    })
  }

  async refreshProviderStatus(disbursementId: string, actorUserId: string, scopedTenantId?: string) {
    const disbursement = await this.getScopedWithdrawal(disbursementId, scopedTenantId)
    if (disbursement.status !== DisbursementStatus.PROCESSING) {
      return this.getDiagnostics(disbursementId, scopedTenantId, false)
    }
    if (!disbursement.network) {
      throw new BadRequestException('Withdrawal does not have a payout network.')
    }

    const provider = this.paymentRouterService.resolveDisbursement(disbursement.network as PaymentNetwork)
    let response
    try {
      response = await provider.getDisbursementStatus(disbursement.providerReference || disbursement.reference)
    } catch (error) {
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Unable to check payout provider status')
    }

    const normalized = String(response.transactionStatus ?? response.status ?? '').toUpperCase()
    const safeProviderResponse = this.sanitizeProviderResponse(response)
    const providerReference = response.transactionReference || disbursement.providerReference || undefined

    if (response.statusCode === 0 || TERMINAL_SUCCESS.has(normalized)) {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.disbursement.updateMany({
          where: { id: disbursement.id, tenantId: disbursement.tenantId, status: DisbursementStatus.PROCESSING },
          data: {
            status: DisbursementStatus.COMPLETED,
            providerReference,
            completedAt: new Date(),
            notes: 'Provider status refresh confirmed the withdrawal was completed.',
            metadata: this.toJsonValue({
              ...this.objectMetadata(disbursement.metadata),
              providerLastCheck: safeProviderResponse,
              providerLastCheckedAt: new Date().toISOString(),
            }),
          },
        })
        if (claimed.count === 1 && disbursement.billingTransactionId) {
          await tx.billingTransaction.update({
            where: { id: disbursement.billingTransactionId },
            data: { status: BillingTransactionStatus.COMPLETED },
          })
          await tx.auditLog.create({
            data: {
              tenantId: disbursement.tenantId,
              userId: actorUserId,
              action: 'withdrawal.provider_reconciled_completed',
              entity: 'Disbursement',
              entityId: disbursement.id,
              details: this.toJsonValue({ providerReference, providerStatus: normalized }),
            },
          })
        }
      })
    } else if (TERMINAL_FAILURE.has(normalized) || TERMINAL_CANCELLED.has(normalized)) {
      await this.releaseProviderFailedReserve(
        disbursement,
        actorUserId,
        TERMINAL_CANCELLED.has(normalized) ? DisbursementStatus.CANCELLED : DisbursementStatus.FAILED,
        `Provider status: ${normalized || 'FAILED'}`,
        safeProviderResponse,
      )
    } else {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.disbursement.updateMany({
          where: { id: disbursement.id, tenantId: disbursement.tenantId, status: DisbursementStatus.PROCESSING },
          data: {
            providerReference,
            notes: 'Provider status refresh: payout is still processing.',
            metadata: this.toJsonValue({
              ...this.objectMetadata(disbursement.metadata),
              providerLastCheck: safeProviderResponse,
              providerLastCheckedAt: new Date().toISOString(),
            }),
          },
        })
        if (updated.count === 1) {
          await tx.auditLog.create({
            data: {
              tenantId: disbursement.tenantId,
              userId: actorUserId,
              action: 'withdrawal.provider_status_checked',
              entity: 'Disbursement',
              entityId: disbursement.id,
              details: this.toJsonValue({ providerReference, providerStatus: normalized || 'PENDING' }),
            },
          })
        }
      })
    }

    return this.getDiagnostics(disbursementId, scopedTenantId, false)
  }

  private async releaseProviderFailedReserve(
    disbursement: Awaited<ReturnType<WithdrawalOperationsService['getScopedWithdrawal']>>,
    actorUserId: string,
    targetStatus: DisbursementStatus,
    reason: string,
    providerStatus: Record<string, unknown>,
  ) {
    if (!disbursement.walletId || !disbursement.billingTransactionId) {
      throw new BadRequestException('Withdrawal reserve is incomplete. Automatic reconciliation was stopped.')
    }
    const billingTransaction = await this.prisma.billingTransaction.findUnique({ where: { id: disbursement.billingTransactionId } })
    if (!billingTransaction) {
      throw new BadRequestException('Withdrawal billing transaction was not found.')
    }
    const totalDebitUgx = billingTransaction.grossAmountUgx

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.disbursement.updateMany({
        where: {
          id: disbursement.id,
          tenantId: disbursement.tenantId,
          status: DisbursementStatus.PROCESSING,
        },
        data: {
          status: targetStatus,
          failedAt: new Date(),
          notes: 'Provider status refresh confirmed the payout did not complete. Wallet reserve released.',
          metadata: this.toJsonValue({
            ...this.objectMetadata(disbursement.metadata),
            providerLastCheck: providerStatus,
            providerLastCheckedAt: new Date().toISOString(),
            reconciliationReason: reason,
          }),
        },
      })
      if (claimed.count !== 1) return

      await tx.wallet.update({
        where: { id: disbursement.walletId! },
        data: { balanceUgx: { increment: totalDebitUgx } },
      })
      if (disbursement.tenantId === 'platform') {
        await tx.platformSetting.update({
          where: { id: PLATFORM_SETTINGS_ID },
          data: { platformWalletBalanceUgx: { increment: totalDebitUgx } },
        })
      }

      await tx.ledgerTransaction.create({
        data: {
          tenantId: disbursement.tenantId,
          walletId: disbursement.walletId,
          reference: `RECONCILE-${disbursement.reference}`,
          type: LedgerTransactionType.DISBURSEMENT,
          channel: BillingChannel.DISBURSEMENT,
          description: 'Provider reconciliation released failed withdrawal reserve',
          grossAmountUgx: totalDebitUgx,
          feeAmountUgx: 0,
          netAmountUgx: totalDebitUgx,
          sourceType: 'VendorWithdrawalReconciliation',
          sourceId: disbursement.id,
          metadata: this.toJsonValue({ reason, providerStatus }),
          entries: {
            create: [
              {
                tenantId: disbursement.tenantId,
                walletId: disbursement.walletId,
                accountCode: 'tenant_wallet',
                direction: LedgerDirection.CREDIT,
                amountUgx: totalDebitUgx,
                memo: 'Failed payout reserve returned',
              },
              {
                tenantId: disbursement.tenantId,
                accountCode: 'disbursement_clearing',
                direction: LedgerDirection.DEBIT,
                amountUgx: disbursement.amountUgx,
                memo: 'Failed provider payout reserve released',
              },
              ...(totalDebitUgx > disbursement.amountUgx
                ? [
                    {
                      tenantId: disbursement.tenantId,
                      accountCode: 'platform_revenue',
                      direction: LedgerDirection.DEBIT,
                      amountUgx: totalDebitUgx - disbursement.amountUgx,
                      memo: 'Failed withdrawal charge released',
                    },
                  ]
                : []),
            ],
          },
        },
      })
      await tx.billingTransaction.update({
        where: { id: disbursement.billingTransactionId! },
        data: { status: targetStatus === DisbursementStatus.CANCELLED ? BillingTransactionStatus.REVERSED : BillingTransactionStatus.FAILED },
      })
      await tx.auditLog.create({
        data: {
          tenantId: disbursement.tenantId,
          userId: actorUserId,
          action: targetStatus === DisbursementStatus.CANCELLED
            ? 'withdrawal.provider_reconciled_cancelled'
            : 'withdrawal.provider_reconciled_failed',
          entity: 'Disbursement',
          entityId: disbursement.id,
          severity: AuditSeverity.WARNING,
          details: this.toJsonValue({ reason, totalDebitUgx, providerStatus }),
        },
      })
    })
  }

  private async getScopedWithdrawal(disbursementId: string, scopedTenantId?: string) {
    const disbursement = await this.prisma.disbursement.findUnique({ where: { id: disbursementId } })
    if (!disbursement || disbursement.agentId || (scopedTenantId && disbursement.tenantId !== scopedTenantId)) {
      throw new NotFoundException('Withdrawal not found')
    }
    return disbursement
  }

  private sanitizeProviderResponse(response: Record<string, unknown>) {
    return {
      status: response.status,
      statusCode: response.statusCode,
      transactionStatus: response.transactionStatus,
      transactionReference: response.transactionReference,
      statusMessage: response.statusMessage,
      errorMessageCode: response.errorMessageCode,
      errorMessage: response.errorMessage,
      transactionInitiationDate: response.transactionInitiationDate,
      transactionCompletionDate: response.transactionCompletionDate,
    }
  }

  private objectMetadata(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue
  }
}
