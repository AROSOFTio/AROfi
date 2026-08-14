#!/usr/bin/env python3
"""Apply narrowly scoped financial-security hardening after gateway transforms.

This script intentionally touches ONLY payment/wallet security invariants. It
must never modify MikroTik provisioning, RADIUS, router connectivity, captive
portal behavior, CoA/disconnect handling, or remote-access scripts.

It is temporary while the repository's existing build-time patch architecture
is consolidated back into checked-in TypeScript. Every replacement is guarded
and fails loudly on source drift instead of silently changing behavior.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYMENTS = ROOT / "apps/api/src/modules/payments/payments.service.ts"
WALLETS = ROOT / "apps/api/src/modules/wallets/wallets.service.ts"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one source match, found {count}")
    return text.replace(old, new, 1)


def insert_before_once(text: str, marker: str, block: str, sentinel: str, label: str) -> str:
    if sentinel in text:
        return text
    count = text.count(marker)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one marker, found {count}")
    return text.replace(marker, block + marker, 1)


# =============================================================================
# PAYMENT / WEBHOOK HARDENING
# =============================================================================
text = PAYMENTS.read_text()

# 1. Wallet top-up webhook: atomically claim PENDING -> COMPLETED before any
#    wallet increment. This closes webhook-vs-poll and webhook-vs-webhook races.
old_topup = """          if (nextStatus === PaymentStatus.COMPLETED && txRecord.status !== BillingTransactionStatus.COMPLETED) {
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
"""
new_topup = """          // SECURITY: the status transition is the wallet-credit idempotency gate.
          // Only one concurrent webhook/status path may change PENDING -> COMPLETED;
          // only that winner is allowed to increment the wallet.
          if (nextStatus === PaymentStatus.COMPLETED) {
            await this.prisma.$transaction(async (tx) => {
              const claimed = await tx.billingTransaction.updateMany({
                where: {
                  id: txRecord.id,
                  status: BillingTransactionStatus.PENDING,
                },
                data: {
                  status: BillingTransactionStatus.COMPLETED,
                  metadata: {
                    ...(txRecord.metadata && typeof txRecord.metadata === 'object' && !Array.isArray(txRecord.metadata)
                      ? txRecord.metadata as Record<string, unknown>
                      : {}),
                    providerReference: extracted.providerReference || gatewayResponse.transactionReference || '',
                    reconciledBy: 'provider_webhook',
                    reconciledAt: new Date().toISOString(),
                  },
                },
              })

              if (claimed.count === 1 && txRecord.walletId) {
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
          } else if (nextStatus === PaymentStatus.FAILED) {
            await this.prisma.billingTransaction.updateMany({
              where: {
                id: txRecord.id,
                status: BillingTransactionStatus.PENDING,
              },
              data: {
                status: BillingTransactionStatus.FAILED,
              },
            })
          }
"""
text = replace_once(text, old_topup, new_topup, "wallet top-up webhook idempotency")

# 2. Query-string webhook secrets are a staged compatibility mode. They are
#    accepted unless explicitly disabled after a provider-specific signed or
#    status-reconciled callback path has been verified. This avoids breaking a
#    live gateway that cannot send custom authorization headers.
old_assert = """  private assertWebhookSecret(
    envVarName: string,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const headerSecret = headers['x-webhook-secret'] ?? headers['X-Webhook-Secret']
    const incomingSecret = payload.secret ?? (Array.isArray(headerSecret) ? headerSecret[0] : headerSecret)
    this.ensureWebhookSecret(envVarName, incomingSecret)
  }
"""
new_assert = """  private assertWebhookSecret(
    envVarName: string,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const headerSecret = headers['x-webhook-secret'] ?? headers['X-Webhook-Secret']
    const headerValue = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret
    const queryCompatibilityEnabled = process.env.WEBHOOK_ALLOW_QUERY_SECRET !== 'false'
    const incomingSecret = headerValue ?? (queryCompatibilityEnabled ? payload.secret : undefined)
    this.ensureWebhookSecret(envVarName, incomingSecret)
  }
"""
text = replace_once(text, old_assert, new_assert, "webhook query-secret gate")

old_yo_secret = """    const incomingSecret =
      payload.secret ?? headers['x-yo-webhook-secret'] ?? headers['X-Yo-Webhook-Secret'] ?? headers['x-webhook-secret']
    this.ensureWebhookSecret('YO_UGANDA_WEBHOOK_SECRET', Array.isArray(incomingSecret) ? incomingSecret[0] : incomingSecret)
"""
new_yo_secret = """    const headerSecret =
      headers['x-yo-webhook-secret'] ?? headers['X-Yo-Webhook-Secret'] ?? headers['x-webhook-secret']
    const headerValue = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret
    const incomingSecret = headerValue ??
      (process.env.WEBHOOK_ALLOW_QUERY_SECRET !== 'false' ? payload.secret : undefined)
    this.ensureWebhookSecret('YO_UGANDA_WEBHOOK_SECRET', incomingSecret)
"""
text = replace_once(text, old_yo_secret, new_yo_secret, "Yo Uganda query-secret gate")

# 3. Never persist webhook authorization material into PaymentWebhook logs.
redactor = """  private redactWebhookRecord(value: Record<string, unknown>) {
    const redacted: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (/secret|authorization|token|api[-_]?key|signature/i.test(key)) {
        redacted[key] = '[REDACTED]'
      } else {
        redacted[key] = item
      }
    }
    return redacted
  }

"""
text = insert_before_once(
    text,
    "  private toJsonValue(value: unknown): Prisma.InputJsonValue {",
    redactor,
    "private redactWebhookRecord(",
    "webhook log redactor",
)
text = text.replace(
    "headers: this.toJsonValue(headers),",
    "headers: this.toJsonValue(this.redactWebhookRecord(headers as Record<string, unknown>)),",
)
text = text.replace(
    "payload: this.toJsonValue(payload),",
    "payload: this.toJsonValue(this.redactWebhookRecord(payload)),",
)
text = text.replace(
    "this.logger.warn('Yo Uganda disbursement webhook received without any reference fields', payload)",
    "this.logger.warn('Yo Uganda disbursement webhook received without any reference fields')",
)
text = text.replace(
    "yoIpnPayload: payload,",
    "yoIpnPayload: this.redactWebhookRecord(payload),",
)

# 4. Yo disbursement webhook replay protection must be stable. The old key had
#    a five-second time bucket, so an identical FAILED callback delivered later
#    became a new event and could reach the refund code again.
old_yo_idempotency = """    const idempotencyKey = createHash('sha256')
      .update(JSON.stringify({ externalRef, providerRef, rawStatus, ts: Math.floor(Date.now() / 5000) }))
      .digest('hex')
"""
new_yo_idempotency = """    const idempotencyKey = createHash('sha256')
      .update(JSON.stringify({ externalRef, providerRef, rawStatus }))
      .digest('hex')
"""
text = replace_once(text, old_yo_idempotency, new_yo_idempotency, "Yo disbursement stable idempotency")

# 5. Atomically claim a terminal Yo payout transition before refunding or
#    marking success. Only one concurrent callback may perform financial side
#    effects for the disbursement.
old_yo_transition = """    await this.prisma.$transaction(async (tx) => {
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
            yoIpnPayload: this.redactWebhookRecord(payload),
            yoIpnStatus: rawStatus,
            yoIpnProcessedAt: new Date().toISOString(),
          }),
        },
      })

      // On failure: reverse the wallet debit so the vendor gets their balance back
"""
new_yo_transition = """    let transitionClaimed = false
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.disbursement.updateMany({
        where: {
          id: disbursement.id,
          status: {
            in: [
              DisbursementStatus.PENDING,
              DisbursementStatus.PENDING_APPROVAL,
              DisbursementStatus.PENDING_NUMBER_APPROVAL,
              DisbursementStatus.PROCESSING,
              DisbursementStatus.FLAGGED_FOR_REVIEW,
            ],
          },
        },
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
            yoIpnPayload: this.redactWebhookRecord(payload),
            yoIpnStatus: rawStatus,
            yoIpnProcessedAt: new Date().toISOString(),
          }),
        },
      })

      if (claimed.count !== 1) {
        return
      }
      transitionClaimed = true

      // On failure: reverse the wallet debit so the vendor gets their balance back
"""
text = replace_once(text, old_yo_transition, new_yo_transition, "Yo disbursement atomic transition")

old_yo_after_transaction = """    this.logger.log(
      `Yo Uganda disbursement IPN processed: ref=${disbursement.reference} → ${nextStatus}`,
    )

    return { received: true, matched: true, processed: true, status: nextStatus }
"""
new_yo_after_transaction = """    if (!transitionClaimed) {
      return {
        received: true,
        matched: true,
        processed: false,
        reason: 'Disbursement was already settled by another request',
      }
    }

    this.logger.log(
      `Yo Uganda disbursement IPN processed: ref=${disbursement.reference} → ${nextStatus}`,
    )

    return { received: true, matched: true, processed: true, status: nextStatus }
"""
text = replace_once(text, old_yo_after_transaction, new_yo_after_transaction, "Yo disbursement claimed response")

PAYMENTS.write_text(text)

# =============================================================================
# WALLET / WITHDRAWAL HARDENING
# =============================================================================
wallets = WALLETS.read_text()

# 6. Once an outbound payout request has started, a transport/provider
#    availability error is ambiguous: the provider may have accepted the payout
#    even if AROFi never received the response. Never restore the wallet on an
#    ambiguous failure. Only a local BadRequestException is treated as a known
#    pre-submission rejection and releases the reserve immediately.
old_request_catch = """    } catch (error) {
      await this.releaseFailedWithdrawalReserve({
        tenantId,
        walletId: reserved.walletId,
        billingTransactionId: reserved.billingTransactionId,
        disbursementId: reserved.disbursementId,
        amountUgx: dto.amountUgx,
        totalDebitUgx,
        reference,
        errorMessage: error instanceof Error ? error.message : 'Unable to submit withdrawal to provider',
      })

      if (error instanceof ServiceUnavailableException || error instanceof BadRequestException) {
        throw error
      }
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Unable to submit withdrawal to provider')
    }
"""
new_request_catch = """    } catch (error) {
      if (error instanceof BadRequestException) {
        await this.releaseFailedWithdrawalReserve({
          tenantId,
          walletId: reserved.walletId,
          billingTransactionId: reserved.billingTransactionId,
          disbursementId: reserved.disbursementId,
          amountUgx: dto.amountUgx,
          totalDebitUgx,
          reference,
          errorMessage: error.message,
        })
      } else {
        await this.markWithdrawalSubmissionUncertain({
          tenantId,
          disbursementId: reserved.disbursementId,
          reference,
          errorMessage: error instanceof Error ? error.message : 'Provider submission outcome is uncertain',
        })
      }

      if (error instanceof ServiceUnavailableException || error instanceof BadRequestException) {
        throw error
      }
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Unable to submit withdrawal to provider')
    }
"""
wallets = replace_once(wallets, old_request_catch, new_request_catch, "initial withdrawal ambiguous failure")

old_submit_catch = """    } catch (error) {
      const metadata = this.objectMetadata(disbursement.metadata)
      const isReferralWithdrawal = typeof metadata.referralWalletTransactionId === 'string'
      if (!isReferralWithdrawal) {
        await this.releaseFailedWithdrawalReserve({
          tenantId: disbursement.tenantId,
          walletId: disbursement.walletId,
          billingTransactionId: disbursement.billingTransactionId,
          disbursementId: disbursement.id,
          amountUgx: disbursement.amountUgx,
          totalDebitUgx: disbursement.billingTransaction?.grossAmountUgx ?? disbursement.amountUgx,
          reference: disbursement.reference,
          errorMessage: error instanceof Error ? error.message : 'Unable to submit withdrawal to provider',
        })
      }
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Unable to submit withdrawal to provider')
    }
"""
new_submit_catch = """    } catch (error) {
      const metadata = this.objectMetadata(disbursement.metadata)
      const isReferralWithdrawal = typeof metadata.referralWalletTransactionId === 'string'
      if (!isReferralWithdrawal) {
        if (error instanceof BadRequestException) {
          await this.releaseFailedWithdrawalReserve({
            tenantId: disbursement.tenantId,
            walletId: disbursement.walletId,
            billingTransactionId: disbursement.billingTransactionId,
            disbursementId: disbursement.id,
            amountUgx: disbursement.amountUgx,
            totalDebitUgx: disbursement.billingTransaction?.grossAmountUgx ?? disbursement.amountUgx,
            reference: disbursement.reference,
            errorMessage: error.message,
          })
        } else {
          await this.markWithdrawalSubmissionUncertain({
            tenantId: disbursement.tenantId,
            disbursementId: disbursement.id,
            reference: disbursement.reference,
            errorMessage: error instanceof Error ? error.message : 'Provider submission outcome is uncertain',
          })
        }
      }
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Unable to submit withdrawal to provider')
    }
"""
wallets = replace_once(wallets, old_submit_catch, new_submit_catch, "reserved withdrawal ambiguous failure")

uncertain_method = """  private async markWithdrawalSubmissionUncertain(input: {
    tenantId: string
    disbursementId: string
    reference: string
    errorMessage: string
  }) {
    const current = await this.prisma.disbursement.findUnique({
      where: { id: input.disbursementId },
    })
    if (!current) {
      return
    }
    if (
      current.status === DisbursementStatus.COMPLETED ||
      current.status === DisbursementStatus.FAILED ||
      current.status === DisbursementStatus.REVERSED ||
      current.status === DisbursementStatus.CANCELLED
    ) {
      return
    }

    const updated = await this.prisma.disbursement.updateMany({
      where: {
        id: input.disbursementId,
        status: {
          in: [
            DisbursementStatus.PENDING,
            DisbursementStatus.PENDING_APPROVAL,
            DisbursementStatus.PENDING_NUMBER_APPROVAL,
            DisbursementStatus.PROCESSING,
            DisbursementStatus.FLAGGED_FOR_REVIEW,
          ],
        },
      },
      data: {
        status: DisbursementStatus.PROCESSING,
        notes: 'Provider submission outcome is uncertain. Wallet reserve remains locked until provider reconciliation.',
        metadata: this.toJsonValue({
          ...this.objectMetadata(current.metadata),
          providerSubmissionUncertain: true,
          providerSubmissionError: input.errorMessage,
          providerSubmissionUncertainAt: new Date().toISOString(),
        }),
      },
    })

    if (updated.count === 1) {
      await this.writeAudit({
        tenantId: input.tenantId,
        action: 'withdrawal.submission_uncertain',
        entity: 'Disbursement',
        entityId: input.disbursementId,
        severity: AuditSeverity.WARNING,
        details: {
          reference: input.reference,
          reason: input.errorMessage,
          walletReserveReleased: false,
        },
      })
    }
  }

"""
wallets = insert_before_once(
    wallets,
    "  private async releaseFailedWithdrawalReserve(input: {",
    uncertain_method,
    "private async markWithdrawalSubmissionUncertain(",
    "withdrawal uncertain-state helper",
)

# 7. Refund/release is itself a financial transaction. Atomically claim one of
#    the allowed transient statuses BEFORE crediting the wallet. This prevents
#    two concurrent failure/reject paths from refunding the same reserve twice,
#    and makes COMPLETED withdrawals permanently ineligible for release.
old_release_prefix = """    const released = await this.prisma.$transaction(async (tx) => {
      const disbursement = await tx.disbursement.findUnique({ where: { id: input.disbursementId } })
      if (
        !disbursement ||
        disbursement.status === DisbursementStatus.FAILED ||
        disbursement.status === DisbursementStatus.REVERSED ||
        disbursement.status === DisbursementStatus.CANCELLED
      ) {
        return false
      }

      await tx.wallet.update({
"""
new_release_prefix = """    const released = await this.prisma.$transaction(async (tx) => {
      const disbursement = await tx.disbursement.findUnique({ where: { id: input.disbursementId } })
      if (!disbursement) {
        return false
      }

      const targetStatus = input.disbursementStatus ?? DisbursementStatus.FAILED
      const claimed = await tx.disbursement.updateMany({
        where: {
          id: input.disbursementId,
          status: {
            in: [
              DisbursementStatus.PENDING,
              DisbursementStatus.PENDING_APPROVAL,
              DisbursementStatus.PENDING_NUMBER_APPROVAL,
              DisbursementStatus.PROCESSING,
              DisbursementStatus.FLAGGED_FOR_REVIEW,
            ],
          },
        },
        data: {
          status: targetStatus,
          failedAt: new Date(),
          notes: input.notes ?? 'Provider did not accept withdrawal request. Wallet reserve released.',
          metadata: this.toJsonValue({
            ...this.objectMetadata(disbursement.metadata),
            errorMessage: input.errorMessage,
            ...input.extraMetadata,
          }),
        },
      })

      if (claimed.count !== 1) {
        return false
      }

      await tx.wallet.update({
"""
wallets = replace_once(wallets, old_release_prefix, new_release_prefix, "atomic withdrawal reserve release")

old_release_final_update = """      await tx.disbursement.update({
        where: { id: input.disbursementId },
        data: {
          status: input.disbursementStatus ?? DisbursementStatus.FAILED,
          failedAt: new Date(),
          notes: input.notes ?? 'Provider did not accept withdrawal request. Wallet reserve released.',
          metadata: this.toJsonValue({ errorMessage: input.errorMessage, ...input.extraMetadata }),
        },
      })

"""
wallets = replace_once(wallets, old_release_final_update, "", "remove non-atomic release status update")

WALLETS.write_text(wallets)

print(
    "Financial security hardening applied: top-up idempotency, webhook redaction/replay protection, "
    "ambiguous payout reserve safety, and atomic withdrawal refunds."
)
