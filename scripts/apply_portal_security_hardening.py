#!/usr/bin/env python3
"""Harden public portal payment data while preserving captive reconnect behavior.

This transform is intentionally scoped to:
- the public payment summary returned by PaymentsService.getPortalContext; and
- the portal browser's local payment-token persistence/polling logic.

It does NOT modify RADIUS, MikroTik provisioning, router connectivity,
CoA/disconnect, hotspot login credentials, or remote-access scripts.

Security invariant:
- a phone-number lookup may reveal only a safe payment status summary;
- the unguessable payment status token remains only on the browser that
  initiated the payment (or an explicit provider return URL);
- full reconnect credentials continue to come from the token-protected payment
  status endpoint for that initiating browser.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYMENTS = ROOT / 'apps/api/src/modules/payments/payments.service.ts'
PORTAL = ROOT / 'apps/portal-web/src/components/PortalCheckout.tsx'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one source match, found {count}')
    return text.replace(old, new, 1)


def insert_before_once(text: str, marker: str, block: str, sentinel: str, label: str) -> str:
    if sentinel in text:
        return text
    count = text.count(marker)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one marker, found {count}')
    return text.replace(marker, block + marker, 1)


# ---------------------------------------------------------------------------
# API: never return internal Payment scalar fields / radiusCredential through
# anonymous portal context. The shared paymentInclude is intentionally rich for
# authenticated admin/internal uses, so sanitize only this public presentation.
# ---------------------------------------------------------------------------
payments = PAYMENTS.read_text()

payments = replace_once(
    payments,
    """      paymentNetworks: availablePaymentNetworks,
      activeActivation,
      latestPayment,
""",
    """      paymentNetworks: availablePaymentNetworks,
      activeActivation,
      latestPayment: this.presentPublicPortalPayment(latestPayment),
""",
    'public portal latest-payment presentation',
)

presenter = """  private presentPublicPortalPayment(payment: any) {
    if (!payment) {
      return null
    }

    const activation = payment.activation
      ? {
          id: payment.activation.id,
          status: payment.activation.status,
          source: payment.activation.source,
          // PortalActivation calls this field startedAt. Keep the wire shape
          // stable while selecting only non-secret activation fields.
          startedAt: payment.activation.startsAt,
          endsAt: payment.activation.endsAt,
          package: payment.activation.package
            ? {
                id: payment.activation.package.id,
                name: payment.activation.package.name,
                code: payment.activation.package.code,
              }
            : payment.package
              ? {
                  id: payment.package.id,
                  name: payment.package.name,
                  code: payment.package.code,
                }
              : null,
          hotspot: payment.activation.hotspot
            ? {
                id: payment.activation.hotspot.id,
                name: payment.activation.hotspot.name,
              }
            : null,
        }
      : null

    return {
      id: payment.id,
      status: payment.status,
      method: payment.method,
      network: payment.network,
      amountUgx: payment.amountUgx,
      // This endpoint is queried with the same customer phone number, so
      // returning it does not disclose a new identifier. Keep it for UI state.
      phoneNumber: payment.phoneNumber,
      statusMessage: payment.statusMessage,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
      package: payment.package
        ? {
            id: payment.package.id,
            name: payment.package.name,
            code: payment.package.code,
            durationMinutes: payment.package.durationMinutes,
          }
        : null,
      activation,
      // Deliberately absent: statusToken, idempotencyKey, external/provider
      // references, request/response payloads, metadata, billing transaction,
      // provider internals, radiusCredential, reconnect username/password.
    }
  }

"""
payments = insert_before_once(
    payments,
    '  private resolveAvailablePaymentNetworks(',
    presenter,
    'private presentPublicPortalPayment(',
    'public portal payment presenter',
)
PAYMENTS.write_text(payments)

# ---------------------------------------------------------------------------
# Browser: keep the random status token on the device that initiated payment.
# Context refreshes may update status, but can never manufacture/disclose a
# token from a phone-number lookup.
# ---------------------------------------------------------------------------
portal = PORTAL.read_text()

old_context_set = """    setContext(data)
    setCurrentPayment(data.latestPayment ?? null)
    setSelectedPackage((previous) => {
"""
new_context_set = """    setContext(data)
    const storedPaymentReturn = readStoredPaymentReturn()
    const localStatusToken = data.latestPayment
      ? (
          currentPayment?.id === data.latestPayment.id
            ? currentPayment.statusToken
            : storedPaymentReturn?.paymentId === data.latestPayment.id
              ? storedPaymentReturn.statusToken
              : null
        )
      : null
    setCurrentPayment(
      data.latestPayment
        ? {
            ...data.latestPayment,
            ...(localStatusToken ? { statusToken: localStatusToken } : {}),
          }
        : null,
    )
    setSelectedPackage((previous) => {
"""
portal = replace_once(portal, old_context_set, new_context_set, 'portal local token merge')

old_poll_guard = """    if (!currentPayment || (!pendingStatuses.includes(currentPayment.status) && !waitingForReconnect)) {
      return
    }

    // Poll sequentially so a slow provider never creates overlapping requests.
"""
new_poll_guard = """    if (!currentPayment || (!pendingStatuses.includes(currentPayment.status) && !waitingForReconnect)) {
      return
    }
    // Anonymous context intentionally never contains a payment status token.
    // Only the browser that initiated this payment may poll the privileged
    // status/reconnect endpoint.
    if (!currentPayment.statusToken) {
      return
    }

    // Poll sequentially so a slow provider never creates overlapping requests.
"""
portal = replace_once(portal, old_poll_guard, new_poll_guard, 'portal token-required polling')

old_payment_created = """      const payment = body as PortalPayment
      setCurrentPayment(payment)

      if (payment.status === 'FAILED') {
"""
new_payment_created = """      const payment = body as PortalPayment
      setCurrentPayment(payment)
      // Persist only on the device that initiated the payment. This survives
      // low-memory Android tab suspension during the Mobile Money PIN/USSD
      // prompt while keeping the token out of anonymous phone-number context.
      if (typeof window !== 'undefined' && payment.statusToken) {
        try {
          window.localStorage.setItem(
            paymentReturnStorageKey,
            JSON.stringify({
              paymentId: payment.id,
              statusToken: payment.statusToken,
              phoneNumber: payment.phoneNumber,
              hotspotParams,
            }),
          )
        } catch {
          // Storage may be blocked/full. The in-memory token still supports
          // this active tab; only reload recovery is unavailable.
        }
      }

      if (payment.status === 'FAILED') {
"""
portal = replace_once(portal, old_payment_created, new_payment_created, 'portal payment token persistence')

PORTAL.write_text(portal)
print('Portal security hardening applied: anonymous payment data minimized and local token polling preserved.')
