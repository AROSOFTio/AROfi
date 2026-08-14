#!/usr/bin/env python3
"""Harden public portal data while preserving captive reconnect behavior.

This transform is intentionally scoped to:
- public payment summaries returned by PaymentsService.getPortalContext;
- portal customer-session payment presentation;
- trusted-router checks around reconnect credential issuance; and
- the portal browser's local payment-token persistence/polling logic.

It does NOT modify RADIUS, MikroTik provisioning, router connectivity,
CoA/disconnect, hotspot credential generation, or remote-access scripts.

Security invariants:
- phone-number lookup never receives payment status tokens or RADIUS secrets;
- reconnect credentials require a validated router registration key/context;
- the unguessable payment status token remains only on the browser that
  initiated the payment (or an explicit provider return URL);
- full reconnect credentials continue to come from the token-protected payment
  status endpoint for that initiating browser.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYMENTS = ROOT / 'apps/api/src/modules/payments/payments.service.ts'
PORTAL_SERVICE = ROOT / 'apps/api/src/modules/portal/portal.service.ts'
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
# Payments API: never return internal Payment scalar fields/radiusCredential
# through anonymous portal context. The shared paymentInclude stays rich for
# authenticated admin/internal uses; only this public presentation is reduced.
# ---------------------------------------------------------------------------
payments = PAYMENTS.read_text()

payments = replace_once(
    payments,
    """      activeActivation,
      latestPayment,
""",
    """      activeActivation,
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
          startedAt: payment.activation.startedAt,
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

# Token comparisons are cheap to harden and this avoids exposing token-prefix
# timing information on the public status endpoint.
payments = replace_once(
    payments,
    """    if (!tenantId && (!payment.statusToken || payment.statusToken !== statusToken)) {
      throw new ForbiddenException('Payment status token is required')
    }
""",
    """    if (
      !tenantId &&
      (!payment.statusToken || !statusToken || !this.secretMatches(statusToken, payment.statusToken))
    ) {
      throw new ForbiddenException('Payment status token is required')
    }
""",
    'constant-time portal payment token comparison',
)
PAYMENTS.write_text(payments)

# ---------------------------------------------------------------------------
# Portal API: the normal MikroTik login template always supplies the generated
# registration key. Require that validated context before returning RADIUS
# reconnect credentials. Public/direct portal links can still browse/buy.
# ---------------------------------------------------------------------------
portal_service = PORTAL_SERVICE.read_text()

portal_service = replace_once(
    portal_service,
    """    const accessToken = this.extractBearerToken(authorization)
    const returningDevice = await this.detectReturningDevice(context.tenant.id, resolvedHotspot)

    if (!accessToken) {
""",
    """    const accessToken = this.extractBearerToken(authorization)
    const trustedHotspot = resolvedHotspot as {
      tenantId?: string
      routerId?: string
      macAddress?: string
      ipAddress?: string
      loginUrl?: string
    }
    const hasTrustedRouterContext =
      Boolean(trustedHotspot.routerId) && trustedHotspot.tenantId === context.tenant.id
    const returningDevice = hasTrustedRouterContext
      ? await this.detectReturningDevice(context.tenant.id, trustedHotspot)
      : {
          existingActiveAccess: false,
          reason: 'Automatic reconnect requires the WiFi login page router context.',
        }

    if (!accessToken) {
""",
    'trusted router context for automatic returning-device credentials',
)

portal_service = replace_once(
    portal_service,
    """  async reconnect(input: {
    macAddress?: string
    ipAddress?: string
    routerId?: string
    routerKey?: string
    hotspotServerName?: string
    loginUrl?: string
  }) {
    const resolvedHotspot = await this.resolveHotspotContext(input)
    const activation = await this.findActiveAccessByMacAndRouter(input.macAddress, resolvedHotspot.routerId)

    if (!activation) {
      throw new NotFoundException('No active access was found for this device')
    }
""",
    """  async reconnect(input: {
    macAddress?: string
    ipAddress?: string
    routerId?: string
    routerKey?: string
    hotspotServerName?: string
    loginUrl?: string
  }) {
    const resolvedHotspot = await this.resolveHotspotContext(input)
    const trustedHotspot = resolvedHotspot as {
      tenantId?: string
      routerId?: string
      loginUrl?: string
    }
    if (!trustedHotspot.tenantId || !trustedHotspot.routerId) {
      throw new BadRequestException(
        'Reconnect must be started from the WiFi login page so the router can be verified.',
      )
    }

    const activation = await this.findActiveAccessByMacAndRouter(
      input.macAddress,
      trustedHotspot.routerId,
      trustedHotspot.tenantId,
    )

    if (!activation) {
      throw new NotFoundException('No active access was found for this device')
    }
""",
    'trusted router context for explicit reconnect endpoint',
)

# Phone-based customer sessions need payment history for display only. Remove
# statusToken and provider diagnostic/reference material from that presentation.
old_map_payment = """    return {
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
"""
new_map_payment = """    return {
      id: payment.id,
      status: payment.status,
      provider: payment.provider,
      method: payment.method,
      network: payment.network,
      amountUgx: payment.amountUgx,
      phoneNumber: payment.phoneNumber,
      statusMessage: payment.statusMessage,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
      package: payment.package,
      activation: payment.activation ? this.mapActivation(payment.activation) : null,
      // Deliberately absent from phone-session history: statusToken,
      // external/provider references, providerStatus and responsePayload.
    }
"""
portal_service = replace_once(
    portal_service,
    old_map_payment,
    new_map_payment,
    'safe customer-session payment history',
)

PORTAL_SERVICE.write_text(portal_service)

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
print('Portal security hardening applied: payment data minimized and reconnect requires trusted router context.')
