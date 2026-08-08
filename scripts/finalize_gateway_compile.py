#!/usr/bin/env python3
"""Apply final compile-only payment gateway normalization.

This runs after every feature patch. It removes TypeScript enum-alias
comparisons and unresolved platform settings constants recreated by later
gateway patches, then applies the final ioTec live-gateway diagnostics/UI pass.
"""

from pathlib import Path
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "apps/api/src/modules/payments/payment-router.service.ts"
PAYMENTS = ROOT / "apps/api/src/modules/payments/payments.service.ts"


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


def apply_iotec_live_diagnostics() -> None:
    patch = ROOT / "scripts/fix_iotec_live_gateway_diagnostics.py"
    if not patch.exists():
        raise RuntimeError("ioTec live gateway diagnostics patch is missing")
    runpy.run_path(str(patch), run_name="__main__")


def main() -> None:
    if not ROUTER.exists() or not PAYMENTS.exists():
        raise RuntimeError("Required payment gateway source file is missing")

    normalize_router()
    normalize_payments()
    apply_iotec_live_diagnostics()
    print("Final payment gateway TypeScript normalization applied.")


if __name__ == "__main__":
    main()
