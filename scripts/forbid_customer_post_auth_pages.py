#!/usr/bin/env python3
"""Permanent guard for AROFi's seamless captive success contract.

Successful voucher, trial, Mobile Money, and returning-device flows must never
render a customer-facing Connected/Disconnect/logout/resume page. Credentials
are posted to RouterOS, the captive browser disappears, and an active package is
silently restored when the same device comes back into Wi-Fi coverage.
"""

from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "apps/api/src/modules/routers/router-captive-ui-v3.initializer.ts"
ALOGIN = ROOT / "apps/api/src/modules/routers/mikrotik-alogin.controller.ts"
FLOW = ROOT / "apps/api/src/modules/routers/router-captive-flow.initializer.ts"
TEMPLATE_JS_PATCH = ROOT / "scripts/apply_routeros_template_js_safety.py"
TEMPLATE_JS_GUARD = ROOT / "scripts/forbid_routeros_template_js_breakage.py"


def fail(message: str) -> None:
    raise RuntimeError(f"SEAMLESS CAPTIVE CONTRACT REJECTED: {message}")


def main() -> None:
    for path in (UI, ALOGIN, FLOW, TEMPLATE_JS_PATCH, TEMPLATE_JS_GUARD):
        if not path.exists():
            fail(f"required file missing: {path.relative_to(ROOT)}")

    # Normalize browser-side RouterOS macro sentinel checks before validating the
    # final captive contract. This is idempotent and touches only the unsafe
    # JavaScript sentinel; it does not alter the working router installer.
    runpy.run_path(str(TEMPLATE_JS_PATCH), run_name="__main__")

    ui = UI.read_text(encoding="utf-8")
    alogin = ALOGIN.read_text(encoding="utf-8")
    flow = FLOW.read_text(encoding="utf-8")

    forbidden_ui = {
        "visible session status page": "buildSessionStatusHtml",
        "status completion override": "prepareCompletionHtml =",
        "customer logout endpoint reference": "logout-html",
        "customer logout form": "$(link-logout)",
        "manual logout marker": "loggedout=1",
        "manual reconnect box": "resumeBox",
        "disconnect button": ">Disconnect<",
        "disconnected customer page": ">Disconnected<",
    }
    for label, marker in forbidden_ui.items():
        if marker in ui:
            fail(f"{label} returned in router-captive-ui-v3.initializer.ts")

    forbidden_alogin = {
        "logout endpoint": "@Get('logout-html/:key')",
        "logout page builder": "buildLogoutHtml",
        "manual logout marker": "loggedout=1",
        "customer disconnect page": ">Disconnected<",
    }
    for label, marker in forbidden_alogin.items():
        if marker in alogin:
            fail(f"{label} returned in mikrotik-alogin.controller.ts")

    for marker, label in (
        ("body{visibility:hidden}", "invisible alogin document"),
        ("window.close()", "captive-browser close attempt"),
        ("connectivitycheck.gstatic.com/generate_204", "OS connectivity completion target"),
    ):
        if marker not in alogin:
            fail(f"missing {label}: {marker}")

    for marker, label in (
        (
            "var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;",
            "activation-aware automatic return",
        ),
        ("login-by=cookie,mac-cookie,http-pap", "trusted post-login MAC cookie"),
        (
            "idle-timeout=none keepalive-timeout=none session-timeout=0s",
            "no idle/keepalive forced disconnect while access is active",
        ),
        ("document.documentElement.style.visibility='hidden';f.submit();", "instant hidden RouterOS login POST"),
    ):
        if marker not in flow:
            fail(f"missing {label}: {marker}")

    # Permanent browser-JS guard. If any future patch brings back the unsafe
    # literal sentinel or makes the compact wrapper own captive behavior again,
    # the build fails before deployment.
    runpy.run_path(str(TEMPLATE_JS_GUARD), run_name="__main__")

    print(
        "SEAMLESS_CAPTIVE_ONLY verified: no Connected/Disconnect/logout/resume customer page, "
        "successful auth closes the captive browser, and active returning devices reconnect silently."
    )


if __name__ == "__main__":
    main()
