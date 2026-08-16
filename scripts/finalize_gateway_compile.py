#!/usr/bin/env python3
"""Apply final compile normalization and production invariant checks.

This runs after every feature patch. It removes TypeScript enum-alias
comparisons and unresolved platform settings constants recreated by later
gateway patches, validates the final ioTec OAuth/diagnostics output, restores
the business-specific voucher QR route, installs the active-bundle disconnect
guard, locks the operator-facing MikroTik onboarding command, finalizes the
captive portal once, then verifies the MikroTik captive/session, seamless-close,
and no-automatic-MAC-auth policies.

The diagnostics patch is deliberately NOT executed again here. The Docker build
already runs it before the OAuth compatibility patch; executing it a second time
made the build fail because the OAuth patch had correctly replaced that token
block with its final fallback implementation.
"""

from pathlib import Path
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "apps/api/src/modules/payments/payment-router.service.ts"
PAYMENTS = ROOT / "apps/api/src/modules/payments/payments.service.ts"
IOTEC = ROOT / "apps/api/src/modules/payments/iotec-pay.service.ts"
SETTINGS = ROOT / "apps/admin-web/src/components/SettingsManager.tsx"
BUSINESS_QR_GUARD = ROOT / "scripts/enforce_business_voucher_qr.py"
ACTIVE_BUNDLE_GUARD = ROOT / "scripts/guard_active_bundle_disconnects.py"
SIMPLE_ONBOARDING_GUARD = ROOT / "scripts/enforce_simple_mikrotik_onboarding.py"
FINAL_CAPTIVE_PATCH = ROOT / "scripts/finalize_captive_portal_contract.py"
CAPTIVE_VERIFY = ROOT / "scripts/verify_router_captive_invariants.py"
SEAMLESS_CAPTIVE_GUARD = ROOT / "scripts/forbid_customer_post_auth_pages.py"
MAC_AUTH_GUARD = ROOT / "scripts/forbid_mikrotik_auto_mac_auth.py"


def normalize_router() -> None:
    text = ROUTER.read_text(encoding="utf-8")

    providers = ("YO_UGANDA", "IOTEC_PAY", "PESAPAL")
    for provider in providers:
        pattern = re.compile(
            rf"selected\s*===\s*PlatformPaymentGateway\.{provider}\s*\|\|\s*"
            rf"selected\s*===\s*PaymentProvider\.{provider}"
        )
        text, _ = pattern.subn(
            f"selected === PlatformPaymentGateway.{provider}",
            text,
        )

    forbidden = [
        f"selected === PlatformPaymentGateway.{provider} || selected === PaymentProvider.{provider}"
        for provider in providers
    ]
    for expression in forbidden:
        if expression in text:
            raise RuntimeError(f"Gateway enum alias comparison remains: {expression}")

    ROUTER.write_text(text, encoding="utf-8")


def normalize_payments() -> None:
    text = PAYMENTS.read_text(encoding="utf-8")
    text = re.sub(r"\bPLATFORM_SETTINGS_ID\b", "'global'", text)

    if "PLATFORM_SETTINGS_ID" in text:
        raise RuntimeError("Unresolved PLATFORM_SETTINGS_ID remains in PaymentsService")

    PAYMENTS.write_text(text, encoding="utf-8")


def validate_iotec_final_state() -> None:
    if not IOTEC.exists() or not SETTINGS.exists():
        raise RuntimeError("Required ioTec source or Admin settings file is missing")

    iotec_text = IOTEC.read_text(encoding="utf-8")
    settings_text = SETTINGS.read_text(encoding="utf-8")

    for marker in (
        "client_secret_post",
        "client_secret_basic",
        "Loaded client ID",
        "Buffer.from(`${clientId}:${clientSecret}`",
    ):
        if marker not in iotec_text:
            raise RuntimeError(f"Final ioTec OAuth marker missing: {marker}")

    for marker in (
        "gatewayTestFailed",
        "Testing live connection",
        "Test live gateway",
    ):
        if marker not in settings_text:
            raise RuntimeError(f"Final ioTec Admin diagnostics marker missing: {marker}")


def enforce_business_qr() -> None:
    if not BUSINESS_QR_GUARD.exists():
        raise RuntimeError("Business voucher QR guard is missing")
    runpy.run_path(str(BUSINESS_QR_GUARD), run_name="__main__")


def install_active_bundle_guard() -> None:
    if not ACTIVE_BUNDLE_GUARD.exists():
        raise RuntimeError("Active-bundle disconnect guard is missing")
    runpy.run_path(str(ACTIVE_BUNDLE_GUARD), run_name="__main__")


def lock_simple_mikrotik_onboarding() -> None:
    if not SIMPLE_ONBOARDING_GUARD.exists():
        raise RuntimeError("IP-first MikroTik onboarding guard is missing")
    runpy.run_path(str(SIMPLE_ONBOARDING_GUARD), run_name="__main__")


def finalize_captive_portal_once() -> None:
    if not FINAL_CAPTIVE_PATCH.exists():
        raise RuntimeError("Final captive portal normalizer is missing")
    runpy.run_path(str(FINAL_CAPTIVE_PATCH), run_name="__main__")


def verify_captive_flow_last() -> None:
    if not CAPTIVE_VERIFY.exists():
        raise RuntimeError("Final MikroTik captive-flow verifier is missing")
    runpy.run_path(str(CAPTIVE_VERIFY), run_name="__main__")


def enforce_seamless_captive_last() -> None:
    if not SEAMLESS_CAPTIVE_GUARD.exists():
        raise RuntimeError("Permanent seamless-captive guard is missing")
    runpy.run_path(str(SEAMLESS_CAPTIVE_GUARD), run_name="__main__")


def enforce_no_automatic_mac_auth_last() -> None:
    if not MAC_AUTH_GUARD.exists():
        raise RuntimeError("Permanent automatic-MAC-auth guard is missing")
    runpy.run_path(str(MAC_AUTH_GUARD), run_name="__main__")


def main() -> None:
    if not ROUTER.exists() or not PAYMENTS.exists():
        raise RuntimeError("Required payment gateway source file is missing")

    normalize_router()
    normalize_payments()
    validate_iotec_final_state()
    enforce_business_qr()
    install_active_bundle_guard()
    lock_simple_mikrotik_onboarding()
    finalize_captive_portal_once()
    verify_captive_flow_last()
    enforce_seamless_captive_last()
    enforce_no_automatic_mac_auth_last()
    print(
        "Final payment gateway, ioTec diagnostics, business voucher QR, active-bundle "
        "disconnect guard, RouterOS 6/7 IP-first onboarding, Smart-TV captive layout, "
        "seamless captive close, and no-automatic-MAC-auth policy verified."
    )


if __name__ == "__main__":
    main()
