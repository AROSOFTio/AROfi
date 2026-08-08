#!/usr/bin/env python3
"""Hard build/CI guard for MikroTik authentication and reconnect policy.

Automatic RADIUS MAC authentication (the exact ``mac`` token in ``login-by``)
is permanently forbidden because it delays captive detection. Trusted
``mac-cookie`` reconnect is required: RouterOS creates it only after a successful
voucher/payment login and uses it to restore that same active customer.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
FLOW = ROOT / "apps/api/src/modules/routers/router-captive-flow.initializer.ts"
CONTROLLER = ROOT / "apps/api/src/modules/routers/mikrotik.controller.ts"
ALOGIN_CONTROLLER = ROOT / "apps/api/src/modules/routers/mikrotik-alogin.controller.ts"
FINALIZER = ROOT / "scripts/finalize_gateway_compile.py"
DOCKERFILE = ROOT / "Dockerfile"
CI = ROOT / ".github/workflows/ci.yml"
DEPLOY = ROOT / ".github/workflows/deploy.yml"
AGENTS = ROOT / "AGENTS.md"
COPILOT = ROOT / ".github/copilot-instructions.md"

GUARD_COMMAND = "python3 scripts/forbid_mikrotik_auto_mac_auth.py"
POLICY_MARKER = "AROFI_NO_AUTOMATIC_MAC_AUTH"
FINAL_LOGIN_BY = "login-by=cookie,mac-cookie,http-pap"
FINAL_PERSISTENCE = (
    "shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d "
    "idle-timeout=none keepalive-timeout=none session-timeout=0s"
)


def fail(message: str) -> None:
    raise RuntimeError(f"MIKROTIK SESSION POLICY REJECTED: {message}")


def main() -> None:
    required_files = (
        MIKROTIK,
        FLOW,
        CONTROLLER,
        ALOGIN_CONTROLLER,
        FINALIZER,
        DOCKERFILE,
        CI,
        DEPLOY,
        AGENTS,
        COPILOT,
    )
    missing_files = [str(path.relative_to(ROOT)) for path in required_files if not path.exists()]
    if missing_files:
        fail("required guard/policy files missing: " + ", ".join(missing_files))

    generated_source = MIKROTIK.read_text(encoding="utf-8")

    # Match real RouterOS login-by values after all build patches. ``mac-cookie``
    # is allowed and required; only a token exactly equal to ``mac`` is forbidden.
    login_values = re.findall(r"login-by=([^\s`\"']+)", generated_source)
    blocking_values = [
        value
        for value in login_values
        if "mac" in {part.strip().lower() for part in value.split(",")}
    ]
    if blocking_values:
        fail(
            "final provisioning contains blocking automatic MAC auth: "
            + ", ".join(blocking_values)
        )

    if re.search(r"mac-auth-mode\s*=", generated_source, flags=re.IGNORECASE):
        fail("final provisioning still sets mac-auth-mode")

    for marker, description in (
        (FINAL_LOGIN_BY, "trusted cookie/mac-cookie/http-pap login policy"),
        ("http-cookie-lifetime=30d", "HTTP cookie lifetime"),
        (FINAL_PERSISTENCE, "no-idle/no-keepalive active-bundle policy"),
    ):
        if marker not in generated_source:
            fail(f"final provisioning is missing {description}: {marker}")

    flow = FLOW.read_text(encoding="utf-8")
    required_flow_markers = (
        "const REQUIRED_LOGIN_METHODS = 'login-by=cookie,mac-cookie,http-pap'",
        "const SESSION_POLICY_SCRIPT = 'arofi-session-policy'",
        "idle-timeout=none keepalive-timeout=none session-timeout=0s",
        "var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;",
        "function finishTarget()",
        "f.method='post';f.action=target;f.style.display='none'",
        "add('dst',finishTarget())",
        "add('popup','false')",
        "document.documentElement.style.visibility='hidden';f.submit();}",
        "prepared = prepared.replace('setTimeout(login, 200);', 'login();')",
        "if(pmt.activation&&pmt.reconnect&&pmt.reconnect.username){closePay();conn(pmt.reconnect);return;}",
        "function check()",
    )
    for marker in required_flow_markers:
        if marker not in flow:
            fail(f"runtime captive-flow protection missing marker: {marker}")

    controller = CONTROLLER.read_text(encoding="utf-8")
    alogin = ALOGIN_CONTROLLER.read_text(encoding="utf-8")
    completion = controller + "\n" + alogin

    for marker in (
        "prepareCompletionHtml(_html: string)",
        "window.close()",
        "body{visibility:hidden}",
        "connectivitycheck.gstatic.com/generate_204",
    ):
        if marker not in controller:
            fail(f"invisible status completion missing marker: {marker}")

    for marker in (
        "@Get('alogin-html/:key')",
        "buildInstantCompletionHtml()",
        "window.close()",
        "body{visibility:hidden}",
        "connectivitycheck.gstatic.com/generate_204",
    ):
        if marker not in alogin:
            fail(f"invisible alogin completion missing marker: {marker}")

    route_count = completion.count("@Get('alogin-html/:key')")
    if route_count != 1:
        fail(f"alogin-html must have exactly one route owner after finalization; found {route_count}")

    # Do not reject literal old-flow strings in FLOW: they intentionally appear
    # as replacement targets. The required replacement markers above and the
    # generated RouterOS source are the authoritative final-state checks.
    forbidden_flow_markers = (
        "login-by=mac,cookie",
        "arofiLoginFrame",
        "idle-timeout=31d",
    )
    for marker in forbidden_flow_markers:
        if marker in flow:
            fail(f"runtime captive flow contains forbidden behavior: {marker}")

    for marker in (
        ">Connected<",
        "You can close this page now",
        "<title>Connected</title>",
        "Connected. <a",
    ):
        if marker in completion:
            fail(f"visible post-login page text remains: {marker}")

    finalizer = FINALIZER.read_text(encoding="utf-8")
    for marker, message in (
        ("enforce_business_voucher_qr.py", "business voucher QR guard"),
        ("enforce_instant_captive_completion.py", "instant captive completion guard"),
        ("guard_active_bundle_disconnects.py", "active-bundle disconnect guard"),
        ("verify_router_captive_invariants.py", "captive invariants"),
        ("forbid_mikrotik_auto_mac_auth.py", "session guard"),
    ):
        if marker not in finalizer:
            fail(f"the final source-normalization stage no longer runs {message}")

    # Docker and both GitHub workflows independently run this guard. This makes
    # accidental removal visible in Coolify/local builds and in branch/main CI.
    for path in (DOCKERFILE, CI, DEPLOY):
        text = path.read_text(encoding="utf-8")
        if GUARD_COMMAND not in text:
            fail(f"guard command missing from {path.relative_to(ROOT)}")

    for path in (AGENTS, COPILOT):
        text = path.read_text(encoding="utf-8")
        if POLICY_MARKER not in text:
            fail(f"AI/agent policy marker missing from {path.relative_to(ROOT)}")
        if "login-by=cookie,mac-cookie,http-pap" not in text:
            fail(f"trusted returning-device policy missing from {path.relative_to(ROOT)}")
        if "AROFI_BUSINESS_VOUCHER_QR" not in text:
            fail(f"business voucher QR policy missing from {path.relative_to(ROOT)}")
        if "AROFI_INSTANT_CAPTIVE_COMPLETION" not in text:
            fail(f"instant captive completion policy missing from {path.relative_to(ROOT)}")

    print(
        "AROFI_NO_AUTOMATIC_MAC_AUTH verified: exact MAC auth is absent, trusted "
        "mac-cookie reconnect is required, active-bundle timers are disabled, and "
        "voucher/MoMo completion is one invisible direct POST."
    )


if __name__ == "__main__":
    main()
