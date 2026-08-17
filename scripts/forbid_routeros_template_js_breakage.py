#!/usr/bin/env python3
"""Permanent guard against RouterOS template expansion or stale v6 portal files.

The rendered HotSpot page must not merely contain handlers in TypeScript source;
its browser JavaScript must be valid after all build patches and RouterOS servlet
values must live outside <script>. RouterOS 6 flash devices must also install the
same current page into persistent flash/hotspot, while RouterOS 7 keeps the
existing root hotspot behavior.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
FLOW = ROOT / "apps/api/src/modules/routers/router-captive-flow.initializer.ts"
CONTROLLER = ROOT / "apps/api/src/modules/routers/mikrotik.controller.ts"
ALOGIN = ROOT / "apps/api/src/modules/routers/mikrotik-alogin.controller.ts"
INTERCEPTOR = ROOT / "apps/api/src/modules/routers/mikrotik-instant-login.interceptor.ts"


def fail(message: str) -> None:
    raise RuntimeError(f"ROUTEROS TEMPLATE/JS GUARD REJECTED: {message}")


def scripts(text: str):
    return re.findall(r"<script(?:\s[^>]*)?>(.*?)</script>", text, flags=re.S | re.I)


def main() -> None:
    for path in (MIKROTIK, FLOW, CONTROLLER, ALOGIN, INTERCEPTOR):
        if not path.exists():
            fail(f"required captive source missing: {path.relative_to(ROOT)}")

    mik = MIKROTIK.read_text(encoding="utf-8")
    flow = FLOW.read_text(encoding="utf-8")
    controller = CONTROLLER.read_text(encoding="utf-8")
    alogin = ALOGIN.read_text(encoding="utf-8")
    interceptor = INTERCEPTOR.read_text(encoding="utf-8")

    for path, text in ((MIKROTIK, mik), (FLOW, flow), (CONTROLLER, controller), (ALOGIN, alogin)):
        for bad in ("indexOf('$(')", 'indexOf("$(")'):
            if bad in text:
                fail(f"unsafe RouterOS macro sentinel remains in {path.relative_to(ROOT)}: {bad}")

    safe = "String.fromCharCode(36,40)"
    for label, text in (("base captive", mik), ("runtime flow", flow), ("completion", controller)):
        if safe not in text:
            fail(f"{label} helper is missing the safe RouterOS macro sentinel")

    login_start = mik.find("  buildLoginHtml(registrationKey: string")
    login_end = mik.find("  // Post-auth", login_start)
    if login_start < 0 or login_end <= login_start:
        fail("buildLoginHtml() could not be isolated")
    login = mik[login_start:login_end]
    login_scripts = scripts(login)
    if not login_scripts:
        fail("login template has no browser script")
    for script in login_scripts:
        if "$(" in script:
            fail("RouterOS servlet token remains inside login browser JavaScript")

    for label, text in (("status", controller), ("alogin", alogin)):
        for script in scripts(text):
            if "$(" in script:
                fail(f"RouterOS servlet token remains inside {label} browser JavaScript")

    required_mik = (
        'value="$(mac-esc)"',
        'value="$(ip-esc)"',
        'value="$(link-login-only-esc)"',
        'value="$(server-name-esc)"',
        'value="$(link-orig-esc)"',
        "function arofiRosValue(id)",
        'id="vTvMode" onchange="toggleVoucherTv()"',
        'id="vTvMac"',
        'onclick="toggleFind()"',
        'id="rtxn" placeholder="Phone number or Transaction ID"',
        "function load(attempt){",
        "Packages did not load. Tap to retry.",
        "function login(){",
        "function rec(){",
        "function conn(rc){",
        ':if ($arofiPortalRosMajor = "6" && [:len [/file find name="flash"]] > 0)',
        ':set arofiPortalDir "flash/hotspot"',
        'dst-path=$arofiLoginPath',
        'dst-path=$arofiStatusPath',
        'html-directory=$arofiPortalDir',
    )
    for token in required_mik:
        if token not in mik:
            fail(f"final captive source missing functional/runtime marker: {token}")

    if ':if ($arofiPortalRosMajor = "7")' in mik:
        fail("RouterOS 7 was added to the RouterOS 6 flash portal compatibility branch")

    for token in (
        ':if ($arofiAloginRosMajor = "6" && [:len [/file find name="flash"]] > 0)',
        ':set arofiAloginDir "flash/hotspot"',
        'dst-path=$arofiAloginPath',
    ):
        if token not in interceptor:
            fail(f"flash-aware invisible alogin installer missing marker: {token}")

    if "var target=finishTarget();" not in controller or "var target=finishTarget();" not in alogin:
        fail("post-auth completion is not pinned to the OS connectivity target")

    print(
        "ROUTEROS_TEMPLATE_JS_SAFE verified: final login JS has no RouterOS macros and parses before compile; "
        "RouterOS6 persistent flash/hotspot receives the live portal, RouterOS7 remains unchanged, and "
        "package/voucher/Smart-TV/recovery/direct-login handlers remain present."
    )


if __name__ == "__main__":
    main()
