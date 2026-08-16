#!/usr/bin/env python3
"""Permanent guard against RouterOS template expansion breaking captive JavaScript.

RouterOS expands ``$(...)`` tokens in HotSpot HTML before the browser sees the
page. A browser helper that contains a literal ``'$(`` can therefore be altered
by RouterOS and make the entire inline script fail to parse. When that happens,
packages never load and every onclick/onchange handler appears dead.

This guard is intentionally small and source-level. It runs before every API
build and rejects the exact unsafe pattern while requiring the safe sentinel
construction used by the captive flow and completion page.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
FLOW = ROOT / "apps/api/src/modules/routers/router-captive-flow.initializer.ts"
CONTROLLER = ROOT / "apps/api/src/modules/routers/mikrotik.controller.ts"
UI = ROOT / "apps/api/src/modules/routers/router-captive-ui-v3.initializer.ts"


def fail(message: str) -> None:
    raise RuntimeError(f"ROUTEROS TEMPLATE/JS GUARD REJECTED: {message}")


def main() -> None:
    for path in (MIKROTIK, FLOW, CONTROLLER, UI):
        if not path.exists():
            fail(f"required captive source missing: {path.relative_to(ROOT)}")

    mik = MIKROTIK.read_text(encoding="utf-8")
    flow = FLOW.read_text(encoding="utf-8")
    controller = CONTROLLER.read_text(encoding="utf-8")
    ui = UI.read_text(encoding="utf-8")

    # Known RouterOS macros such as $(mac) are intentional in the base HTML.
    # What is forbidden is spelling '$(' literally inside browser helper code.
    for path, text in ((MIKROTIK, mik), (FLOW, flow), (CONTROLLER, controller)):
        for bad in ("indexOf('$(')", 'indexOf("$(")'):
            if bad in text:
                fail(f"unsafe RouterOS macro sentinel remains in {path.relative_to(ROOT)}: {bad}")

    safe = "String.fromCharCode(36,40)"
    if safe not in mik:
        fail("base captive login helper is missing the safe RouterOS macro sentinel")
    if safe not in flow:
        fail("runtime captive-flow helper is missing the safe RouterOS macro sentinel")
    if safe not in controller:
        fail("completion page is missing the safe RouterOS macro sentinel")

    # The compact visual layer is decoration only. It must never own package,
    # payment, Smart-TV, recovery or post-auth behavior again.
    forbidden_ui = (
        "function poll(id,tok)",
        "function setPayState(",
        "utility-row",
        "buildSessionStatusHtml",
        "prepareCompletionHtml =",
    )
    for token in forbidden_ui:
        if token in ui:
            fail(f"compact UI wrapper is changing captive behavior again: {token}")

    required_mik = (
        'id="vTvMode" onchange="toggleVoucherTv()"',
        'id="vTvMac"',
        'onclick="toggleFind()"',
        'id="rtxn" placeholder="Phone number or Transaction ID"',
        "function load(attempt){",
        "Packages did not load. Tap to retry.",
        "function login(){",
        "function rec(){",
        "function conn(rc){",
    )
    for token in required_mik:
        if token not in mik:
            fail(f"final captive source missing functional marker: {token}")

    print(
        "ROUTEROS_TEMPLATE_JS_SAFE verified: browser helpers cannot be consumed "
        "as RouterOS macros; package, voucher, Smart-TV, recovery and direct-login "
        "handlers remain present."
    )


if __name__ == "__main__":
    main()
