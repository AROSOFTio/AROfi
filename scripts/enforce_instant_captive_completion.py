#!/usr/bin/env python3
"""Enforce one invisible RouterOS post-login completion route.

The repository historically had a dedicated alogin controller. A later emergency
fix also added the same route to MikrotikController, leaving duplicate Express
routes whose selection depended on controller registration order. This build
patch removes the duplicate and validates that both status.html and alogin.html
remain invisible close/connectivity documents with no customer-facing
"Connected" page.
"""

from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK_CONTROLLER = ROOT / "apps/api/src/modules/routers/mikrotik.controller.ts"
ALOGIN_CONTROLLER = ROOT / "apps/api/src/modules/routers/mikrotik-alogin.controller.ts"


def main() -> None:
    main_text = MIKROTIK_CONTROLLER.read_text(encoding="utf-8")

    # Remove the duplicate alogin endpoint from MikrotikController. The dedicated
    # MikrotikAloginController remains the single owner of that route.
    if "async getAloginHtml(" in main_text:
        pattern = re.compile(
            r"\n  // RouterOS uses alogin\.html immediately after accepting credentials\..*?"
            r"\n  @Get\('mobile-setup/:key'\)",
            flags=re.S,
        )
        main_text, count = pattern.subn("\n  @Get('mobile-setup/:key')", main_text, count=1)
        if count != 1:
            raise RuntimeError(
                "Could not remove duplicate alogin route from MikrotikController."
            )
        MIKROTIK_CONTROLLER.write_text(main_text, encoding="utf-8")

    main_text = MIKROTIK_CONTROLLER.read_text(encoding="utf-8")
    alogin_text = ALOGIN_CONTROLLER.read_text(encoding="utf-8")
    combined = main_text + "\n" + alogin_text

    if combined.count("@Get('alogin-html/:key')") != 1:
        raise RuntimeError(
            "Captive completion build rejected: alogin-html must have exactly one route owner."
        )

    required_main = (
        "return this.prepareCompletionHtml(html)",
        "prepareCompletionHtml(_html: string)",
        "body{visibility:hidden}",
        "window.close()",
        "connectivitycheck.gstatic.com/generate_204",
    )
    required_alogin = (
        "buildInstantCompletionHtml()",
        "body{visibility:hidden}",
        "window.close()",
        "connectivitycheck.gstatic.com/generate_204",
        "www.msftconnecttest.com/connecttest.txt",
        "captive.apple.com/hotspot-detect.html",
    )

    missing = [
        *[f"status:{marker}" for marker in required_main if marker not in main_text],
        *[f"alogin:{marker}" for marker in required_alogin if marker not in alogin_text],
    ]
    if missing:
        raise RuntimeError(
            "Captive completion build rejected; missing: " + ", ".join(missing)
        )

    forbidden = (
        ">Connected<",
        "You can close this page now",
        "<title>Connected</title>",
        "Connected. <a",
    )
    present = [marker for marker in forbidden if marker in combined]
    if present:
        raise RuntimeError(
            "Captive completion build rejected; visible completion text remains: "
            + ", ".join(present)
        )

    print(
        "Instant captive completion verified: one alogin route, invisible status/alogin, no connected page."
    )


if __name__ == "__main__":
    for required in (MIKROTIK_CONTROLLER, ALOGIN_CONTROLLER):
        if not required.exists():
            raise RuntimeError(f"Required captive completion source missing: {required.relative_to(ROOT)}")
    main()
