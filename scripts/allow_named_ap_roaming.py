#!/usr/bin/env python3
"""Allow same-business roaming without forcing every AP to share one WiFi name.

Authorization must follow the AROFi business + trusted device identity, not the
router name, AP name, or SSID text. The older cross-AP guard intentionally
normalized generated SSIDs to the tenant name; this final guard removes that
coupling while preserving all security boundaries:

- same-business active access is resolved by tenant + bound MAC;
- the AP/router the device is currently on supplies the login endpoint;
- different router/AP/SSID names do not change authorization;
- cross-business reuse remains forbidden;
- automatic login-by=mac stays forbidden and one-device MAC binding stays strict.

This runs after enforce_cross_ap_roaming.py in the final source-normalization
stage, so the older same-SSID rewrite cannot silently return during a build.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTERS_SERVICE = ROOT / "apps/api/src/modules/routers/routers.service.ts"
PORTAL_SERVICE = ROOT / "apps/api/src/modules/portal/portal.service.ts"
PORTAL_SPEC = ROOT / "apps/api/src/modules/portal/portal.service.spec.ts"
RADIUS_POLICY = ROOT / "apps/api/src/modules/radius/radius-authorization-policy.service.ts"

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
    spec = PORTAL_SPEC.read_text(encoding="utf-8")
    radius = RADIUS_POLICY.read_text(encoding="utf-8")

    required_portal = (
        "Any router/AP under the same business (tenantId) recognizes active access.",
        "...(!tenantId && routerId ? { OR: [{ routerId }, { routerId: null }] } : {})",
    )
    for marker in required_portal:
        if marker not in portal:
            raise RuntimeError(f"Named-AP roaming backend invariant missing: {marker}")

    if "reconnects a returning device from another router in the same business" not in spec:
        raise RuntimeError("Named-AP roaming test is missing")
    if "does not reconnect the same MAC across different businesses" not in spec:
        raise RuntimeError("Cross-business isolation test is missing")

    # Do not solve roaming by weakening device security. The same purchased
    # credential remains locked to its trusted MAC; AP/router naming is simply
    # removed from the decision.
    for marker in (
        "boundMac !== observedMac",
        "Credential is already bound to another device",
        "Concurrent session exists for another device",
    ):
        if marker not in radius:
            raise RuntimeError(f"Named-AP roaming security invariant missing: {marker}")


def main() -> None:
    for path in (ROUTERS_SERVICE, PORTAL_SERVICE, PORTAL_SPEC, RADIUS_POLICY):
        if not path.exists():
            raise RuntimeError(f"Named-AP roaming required file missing: {path.relative_to(ROOT)}")

    allow_per_ap_names()
    verify_authorization_boundaries()
    print(
        "Named-AP roaming enabled: same-business AP/router/SSID names are not an authorization boundary; "
        "current-AP login routing, cross-business isolation, strict one-device MAC binding, and captive policies remain locked."
    )


if __name__ == "__main__":
    main()
