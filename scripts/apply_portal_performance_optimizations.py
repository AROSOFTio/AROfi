#!/usr/bin/env python3
"""Reduce captive-portal first-load latency without changing access semantics.

This transform is deliberately limited to portal/API request orchestration:
- a stored portal token is consumed by /portal/context directly instead of
  forcing a sequential /portal/session -> /portal/context waterfall;
- PortalService derives the phone number from the already-signed portal token
  before building context, so one context request still includes customer
  activation/payment state;
- a slow bootstrap is logged in the browser console for staging diagnosis.

It does NOT modify MikroTik provisioning, RouterOS login POST behavior,
FreeRADIUS, package expiry/accounting, payment initiation/callback formats,
wallet logic, voucher redemption rules, or reconnect credential generation.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTAL_SERVICE = ROOT / 'apps/api/src/modules/portal/portal.service.ts'
PORTAL_WEB = ROOT / 'apps/portal-web/src/components/PortalCheckout.tsx'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one source match, found {count}')
    return text.replace(old, new, 1)


portal_service = PORTAL_SERVICE.read_text()

# /portal/context already returns the authenticated customer session. Move token
# parsing before getPortalContext so the same request can also load phone-scoped
# activation/payment state. This remains compatible with the security hardening
# transform when that transform has already run: its trusted-router block comes
# immediately after this anchor and is left untouched.
old_context_preamble = """    const resolvedTenantId =
      'tenantId' in resolvedHotspot ? (resolvedHotspot as { tenantId?: string }).tenantId : undefined
    const context = await this.paymentsService.getPortalContext(
      tenantDomain ?? resolvedTenantDomain,
      phoneNumber,
      resolvedTenantId,
    )
    const accessToken = this.extractBearerToken(authorization)
"""
new_context_preamble = """    const resolvedTenantId =
      'tenantId' in resolvedHotspot ? (resolvedHotspot as { tenantId?: string }).tenantId : undefined
    const accessToken = this.extractBearerToken(authorization)
    let tokenPhoneNumber: string | undefined
    if (accessToken) {
      try {
        tokenPhoneNumber = this.verifyAccessToken(accessToken).phoneNumber
      } catch {
        tokenPhoneNumber = undefined
      }
    }
    const context = await this.paymentsService.getPortalContext(
      tenantDomain ?? resolvedTenantDomain,
      phoneNumber ?? tokenPhoneNumber,
      resolvedTenantId,
    )
"""
portal_service = replace_once(
    portal_service,
    old_context_preamble,
    new_context_preamble,
    'portal context token phone reuse',
)
PORTAL_SERVICE.write_text(portal_service)

portal = PORTAL_WEB.read_text()

old_bootstrap = """  async function bootstrap() {
    const detected = mergeHotspotParams(readStoredPaymentReturn()?.hotspotParams, readHotspotParams())
    setHotspotParams(detected)
    const storedToken = typeof window === 'undefined' ? null : window.localStorage.getItem(portalStorageKey)

    if (storedToken) {
      const session = await loadPortalSession(storedToken)
      if (session) {
        await loadContext(session.customer.phoneNumber, storedToken, detected)
        setIsContextLoading(false)
        return
      }
    }

    await loadContext(undefined, undefined, detected)
    setIsContextLoading(false)
  }
"""
new_bootstrap = """  async function bootstrap() {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const detected = mergeHotspotParams(readStoredPaymentReturn()?.hotspotParams, readHotspotParams())
    setHotspotParams(detected)
    const storedToken = typeof window === 'undefined' ? null : window.localStorage.getItem(portalStorageKey)

    try {
      // One request is enough: /portal/context validates the signed portal
      // token, returns the session, and (server-side) uses the token phone to
      // include phone-scoped activation/payment state. Previously a returning
      // customer waited for /portal/session before this request even started.
      const contextData = await loadContext(undefined, storedToken, detected)
      if (storedToken && contextData?.session) {
        setPortalToken(storedToken)
      } else if (storedToken && contextData) {
        // Successful context with no session means the stored token is no
        // longer valid. Remove it so future portal opens stay on the fast path.
        window.localStorage.removeItem(portalStorageKey)
        setPortalToken(null)
        setPortalSession(null)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load this WiFi portal. Please retry.')
    } finally {
      setIsContextLoading(false)
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const elapsedMs = Math.round(endedAt - startedAt)
      if (elapsedMs >= 500 && typeof console !== 'undefined') {
        console.warn(`[AROFi portal] bootstrap took ${elapsedMs}ms`)
      }
    }
  }
"""
portal = replace_once(portal, old_bootstrap, new_bootstrap, 'single-request portal bootstrap')

old_load_context_tail = """    if (data.session) {
      setPortalSession(data.session)
      setPhoneNumber(data.session.customer.phoneNumber)
      setCustomerReference(data.session.customer.customerReference ?? '')
    }
  }

  async function loadPortalSession(accessToken: string) {
"""
new_load_context_tail = """    if (data.session) {
      setPortalSession(data.session)
      setPhoneNumber(data.session.customer.phoneNumber)
      setCustomerReference(data.session.customer.customerReference ?? '')
    }
    return data
  }

  async function loadPortalSession(accessToken: string) {
"""
portal = replace_once(
    portal,
    old_load_context_tail,
    new_load_context_tail,
    'portal context return value',
)

PORTAL_WEB.write_text(portal)
print('Portal performance optimization applied: returning-user bootstrap uses one context request.')
