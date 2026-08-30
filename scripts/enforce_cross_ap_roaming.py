#!/usr/bin/env python3
"""Enforce seamless same-business roaming for active AROFi customers.

A customer who activates a voucher/payment on AP/router A must be able to move
onto AP/router B under the same AROFi business without entering the voucher
again. The API already resolves active access by tenant + bound MAC rather than
by the original router. This guard locks the browser/router side to that policy:

- cached context may render immediately, but can never trigger authentication;
- auto-connect waits for fresh context resolved from the AP the device is on now;
- the current AP's MikroTik link-login URL always wins over a stale cached URL;
- router-served captive pages likewise prefer their local $(link-login-only);
- cross-business reuse stays forbidden because the backend tenant scope remains
  authoritative.

This file is intentionally idempotent and runs in the final production source
normalization stage so later patch scripts cannot silently regress roaming.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTAL_WEB = ROOT / "apps/portal-web/src/components/PortalCheckout.tsx"
CAPTIVE_FLOW = ROOT / "apps/api/src/modules/routers/router-captive-flow.initializer.ts"
CAPTIVE_SPEC = ROOT / "apps/api/src/modules/routers/router-captive-flow.initializer.spec.ts"
CAPTIVE_VERIFY = ROOT / "scripts/verify_router_captive_invariants.py"
PORTAL_SERVICE = ROOT / "apps/api/src/modules/portal/portal.service.ts"
PORTAL_SPEC = ROOT / "apps/api/src/modules/portal/portal.service.spec.ts"


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Cross-AP roaming patch rejected: missing {label}")
    return text.replace(old, new, 1)


def patch_portal_web() -> None:
    text = PORTAL_WEB.read_text(encoding="utf-8")

    text = replace_required(
        text,
        "const [isContextLoading, setIsContextLoading] = useState(!cachedCtx)",
        "const [isContextLoading, setIsContextLoading] = useState(true)\n  const [hasFreshHotspotContext, setHasFreshHotspotContext] = useState(false)",
        "portal fresh-context state",
    )

    text = replace_required(
        text,
        "if (!isReturningDeviceReconnectPayload) return",
        "if (isContextLoading || !hasFreshHotspotContext || !isReturningDeviceReconnectPayload) return",
        "auto-connect fresh-context gate",
    )

    text = replace_required(
        text,
        "const signature = `${reconnect.loginUrl ?? ''}|${reconnect.username}|${reconnect.password}`",
        "const signature = `${hotspotParams.routerKey}|${hotspotParams.loginUrl}|${reconnect.username}|${reconnect.password}`",
        "current-AP reconnect signature",
    )

    text = replace_required(
        text,
        "}, [isReturningDeviceReconnectPayload, context?.returningDevice?.reconnect?.loginUrl, context?.returningDevice?.reconnect?.username, context?.returningDevice?.reconnect?.password])",
        "}, [isContextLoading, hasFreshHotspotContext, isReturningDeviceReconnectPayload, hotspotParams.routerKey, hotspotParams.loginUrl, context?.returningDevice?.reconnect?.loginUrl, context?.returningDevice?.reconnect?.username, context?.returningDevice?.reconnect?.password])",
        "auto-connect dependency list",
    )

    text = replace_required(
        text,
        "const loginUrl =\n      reconnect?.loginUrl ||\n      fallbackLoginUrl ||\n      hotspotParams.loginUrl ||\n      readStoredLoginUrl()",
        "const loginUrl =\n      hotspotParams.loginUrl ||\n      fallbackLoginUrl ||\n      reconnect?.loginUrl ||\n      readStoredLoginUrl()",
        "current AP login URL precedence",
    )

    text = replace_required(
        text,
        "const effectiveLoginUrl =\n          redemption.reconnect.loginUrl ||\n          hotspotParams.loginUrl ||\n          readStoredLoginUrl()",
        "const effectiveLoginUrl =\n          hotspotParams.loginUrl ||\n          redemption.reconnect.loginUrl ||\n          readStoredLoginUrl()",
        "voucher current AP login URL precedence",
    )

    text = replace_required(
        text,
        "async function loadContext(phone?: string, accessToken?: string | null, detectedParams = hotspotParams) {\n    const params = new URLSearchParams()",
        "async function loadContext(phone?: string, accessToken?: string | null, detectedParams = hotspotParams) {\n    setHasFreshHotspotContext(false)\n    const params = new URLSearchParams()",
        "fresh-context reset before API lookup",
    )

    text = replace_required(
        text,
        "const data = await readJson<PortalContextResponse>(response)\n    writeCachedContext(data)\n    setContext(data)",
        "const data = await readJson<PortalContextResponse>(response)\n    writeCachedContext(data)\n    setContext(data)\n    setHasFreshHotspotContext(true)",
        "fresh-context success marker",
    )

    required = (
        "hasFreshHotspotContext",
        "hotspotParams.loginUrl ||\n      fallbackLoginUrl ||\n      reconnect?.loginUrl",
        "hotspotParams.loginUrl ||\n          redemption.reconnect.loginUrl",
        "`${hotspotParams.routerKey}|${hotspotParams.loginUrl}|${reconnect.username}|${reconnect.password}`",
    )
    for marker in required:
        if marker not in text:
            raise RuntimeError(f"Cross-AP roaming portal invariant missing: {marker}")

    PORTAL_WEB.write_text(text, encoding="utf-8")


def patch_router_captive_flow() -> None:
    text = CAPTIVE_FLOW.read_text(encoding="utf-8")
    text = replace_required(
        text,
        "var target=(rc.loginUrl||lo||'http://10.55.0.1/login')",
        "var target=(lo||rc.loginUrl||'http://10.55.0.1/login')",
        "router-local link-login precedence",
    )
    CAPTIVE_FLOW.write_text(text, encoding="utf-8")

    spec = CAPTIVE_SPEC.read_text(encoding="utf-8")
    old = "    expect(html).toContain(\"f.method='post';f.action=target;f.style.display='none'\")\n"
    new = (
        old
        + "    expect(html).toContain(\"var target=(lo||rc.loginUrl||'http://10.55.0.1/login')\")\n"
    )
    spec = replace_required(spec, old, new, "router-local roaming assertion")
    CAPTIVE_SPEC.write_text(spec, encoding="utf-8")

    verify = CAPTIVE_VERIFY.read_text(encoding="utf-8")
    verify = replace_required(
        verify,
        '"native login destination": "rc.loginUrl||lo||\'http://10.55.0.1/login\'",',
        '"current-AP native login destination": "lo||rc.loginUrl||\'http://10.55.0.1/login\'",',
        "captive verifier current-AP marker",
    )
    CAPTIVE_VERIFY.write_text(verify, encoding="utf-8")


def verify_backend_scope() -> None:
    service = PORTAL_SERVICE.read_text(encoding="utf-8")
    spec = PORTAL_SPEC.read_text(encoding="utf-8")

    markers = (
        "Any router/AP under the same business (tenantId) recognizes active access.",
        "...(!tenantId && routerId ? { OR: [{ routerId }, { routerId: null }] } : {})",
    )
    for marker in markers:
        if marker not in service:
            raise RuntimeError(f"Cross-AP roaming backend invariant missing: {marker}")

    if "reconnects a returning device from another router in the same business" not in spec:
        raise RuntimeError("Cross-AP roaming backend test is missing")
    if "does not reconnect the same MAC across different businesses" not in spec:
        raise RuntimeError("Cross-business isolation test is missing")


def main() -> None:
    required_files = (PORTAL_WEB, CAPTIVE_FLOW, CAPTIVE_SPEC, CAPTIVE_VERIFY, PORTAL_SERVICE, PORTAL_SPEC)
    missing = [str(path.relative_to(ROOT)) for path in required_files if not path.exists()]
    if missing:
        raise RuntimeError("Cross-AP roaming required files missing: " + ", ".join(missing))

    verify_backend_scope()
    patch_portal_web()
    patch_router_captive_flow()
    verify_backend_scope()
    print(
        "Cross-AP roaming enforced: fresh same-business MAC access follows the customer to the current AP, "
        "uses that AP's RouterOS login endpoint, and remains isolated across businesses."
    )


if __name__ == "__main__":
    main()
