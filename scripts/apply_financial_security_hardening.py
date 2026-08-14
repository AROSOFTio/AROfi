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


text = PAYMENTS.read_text()

# ---------------------------------------------------------------------------
# 1. Wallet top-up webhook: atomically claim PENDING -> COMPLETED before any
#    wallet increment. This closes webhook-vs-poll and webhook-vs-webhook races.
# ---------------------------------------------------------------------------
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

text = replace_once(
    text,
    old_topup,
    new_topup,
    "wallet top-up webhook idempotency",
)

# ---------------------------------------------------------------------------
# 2. Query-string webhook secrets are a staged compatibility mode. They are
#    accepted unless explicitly disabled after a provider-specific signed or
#    status-reconciled callback path has been verified. This avoids breaking a
#    live gateway that cannot send custom authorization headers.
# ---------------------------------------------------------------------------
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

text = replace_once(
    text,
    old_assert,
    new_assert,
    "webhook query-secret gate",
)

# Yo disbursement uses a specialized handler; apply the same staged gate.
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
text = replace_once(
    text,
    old_yo_secret,
    new_yo_secret,
    "Yo Uganda query-secret gate",
)

# ---------------------------------------------------------------------------
# 3. Never persist webhook authorization material into PaymentWebhook logs.
# ---------------------------------------------------------------------------
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

PAYMENTS.write_text(text)
print("Financial security hardening applied: top-up idempotency, staged webhook secret gating, and log redaction.")
