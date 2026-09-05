#!/usr/bin/env python3
"""Lock seamless same-business roaming across differently named APs/SSIDs.

A customer who buys on AP A must be accepted immediately on AP Z while the
package is still active. Router/AP/SSID names are presentation and radio
configuration, never an authorization boundary.

The final policy deliberately supports both real-world phone behaviours:
- same MAC on AP Z: tenant-scoped active access reconnects normally;
- a new per-SSID private MAC on AP Z: the tenant-local `.wifi` page reuses the
  already-issued reconnect credential and RADIUS performs a verified
  same-business AP handoff/rebind.

Cross-business use remains forbidden. A different MAC trying to reuse the same
credential on the same AP is still rejected, so roaming is not implemented by
opening the credential globally.

This runs after enforce_cross_ap_roaming.py in the final source-normalization
stage, so older same-SSID or strict-MAC-only rewrites cannot silently regress the
AP-A -> AP-Z behaviour during a production build.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTERS_SERVICE = ROOT / "apps/api/src/modules/routers/routers.service.ts"
PORTAL_SERVICE = ROOT / "apps/api/src/modules/portal/portal.service.ts"
PORTAL_SPEC = ROOT / "apps/api/src/modules/portal/portal.service.spec.ts"
RADIUS_POLICY = ROOT / "apps/api/src/modules/radius/radius-authorization-policy.service.ts"
RADIUS_SPEC = ROOT / "apps/api/src/modules/radius/radius-authorization-policy.service.spec.ts"
HANDOFF_INITIALIZER = ROOT / "apps/api/src/modules/routers/cross-ap-instant-handoff.initializer.ts"
ROUTERS_MODULE = ROOT / "apps/api/src/modules/routers/routers.module.ts"

TENANT_WIDE = "hotspotNetworkName: router.tenant.name || router.siteLabel || router.name,"
PER_AP = "hotspotNetworkName: router.siteLabel ?? router.name,"


def allow_per_ap_names() -> None:
    text = ROUTERS_SERVICE.read_text(encoding="utf-8")

    # The preceding legacy roaming guard may have rewritten both provisioning
    # paths to TENANT_WIDE. Restore per-AP/site naming. SSID text is presentation
    # and radio configuration only; it must never be an authorization key.
    text = text.replace(TENANT_WIDE, PER_AP)

    if TENANT_WIDE in text:
        raise RuntimeError("Named-AP roaming rejected: tenant-wide SSID forcing still remains")
    if text.count(PER_AP) < 2:
        raise RuntimeError("Named-AP roaming rejected: every provisioning path must permit its own AP/site name")

    ROUTERS_SERVICE.write_text(text, encoding="utf-8")


def verify_authorization_boundaries() -> None:
    portal = PORTAL_SERVICE.read_text(encoding="utf-8")
    portal_spec = PORTAL_SPEC.read_text(encoding="utf-8")
    radius = RADIUS_POLICY.read_text(encoding="utf-8")
    radius_spec = RADIUS_SPEC.read_text(encoding="utf-8")
    handoff = HANDOFF_INITIALIZER.read_text(encoding="utf-8")
    module = ROUTERS_MODULE.read_text(encoding="utf-8")

    required_portal = (
        "Any router/AP under the same business (tenantId) recognizes active access.",
        "...(!tenantId && routerId ? { OR: [{ routerId }, { routerId: null }] } : {})",
    )
    for marker in required_portal:
        if marker not in portal:
            raise RuntimeError(f"Named-AP roaming backend invariant missing: {marker}")

    if "reconnects a returning device from another router in the same business" not in portal_spec:
        raise RuntimeError("Named-AP roaming portal test is missing")
    if "does not reconnect the same MAC across different businesses" not in portal_spec:
        raise RuntimeError("Cross-business portal isolation test is missing")

    # RADIUS must explicitly recognize a current router in the same tenant as a
    # handoff and transfer binding when needed, while retaining the same-AP and
    # cross-business rejection paths.
    for marker in (
        "sameTenantCrossApHandoff",
        "currentRouter?.tenantId === activation.tenantId",
        "Activation is active and same-business AP handoff is allowed",
        "Credential is already bound to another device",
        "Concurrent session exists for another device",
        "Credential is not valid on this business network",
    ):
        if marker not in radius:
            raise RuntimeError(f"Named-AP roaming RADIUS invariant missing: {marker}")

    for marker in (
        "allows an active voucher to hand off instantly from AP A to AP Z in the same business",
        "still rejects a different MAC trying the credential on the same AP",
        "rejects a handoff through an AP belonging to another business",
    ):
        if marker not in radius_spec:
            raise RuntimeError(f"Named-AP roaming RADIUS test missing: {marker}")

    # The local tenant .wifi page is the second half of instant roaming. It
    # remembers a successful reconnect credential and posts it directly to the
    # CURRENT RouterOS link-login endpoint before another purchase is shown.
    for marker in (
        "arofi-cross-ap-instant-handoff-v1",
        "arofi.cross_ap.credential.v1",
        "localStorage.setItem",
        "form.action=lo",
        "form.submit()",
    ):
        if marker not in handoff:
            raise RuntimeError(f"Named-AP local handoff invariant missing: {marker}")

    if "CrossApInstantHandoffInitializer" not in module:
        raise RuntimeError("Cross-AP instant handoff initializer is not registered in RoutersModule")


def main() -> None:
    required = (
        ROUTERS_SERVICE,
        PORTAL_SERVICE,
        PORTAL_SPEC,
        RADIUS_POLICY,
        RADIUS_SPEC,
        HANDOFF_INITIALIZER,
        ROUTERS_MODULE,
    )
    for path in required:
        if not path.exists():
            raise RuntimeError(f"Named-AP roaming required file missing: {path.relative_to(ROOT)}")

    allow_per_ap_names()
    verify_authorization_boundaries()
    print(
        "Named-AP roaming locked: active access follows the buyer from AP A to AP Z inside the same business, "
        "including per-SSID private-MAC handoff; current-AP login routing and cross-business isolation remain enforced."
    )


if __name__ == "__main__":
    main()
