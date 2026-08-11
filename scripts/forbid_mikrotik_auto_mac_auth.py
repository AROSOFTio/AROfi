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
    required_files = (MIKROTIK, FLOW, FINALIZER, DOCKERFILE, CI, DEPLOY, AGENTS, COPILOT)
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
        "f.method='post';f.action=target;f.style.display='none'",
    )
    for marker in required_flow_markers:
        if marker not in flow:
            fail(f"runtime captive-flow protection missing marker: {marker}")

    # The stable 713e3f7 captive flow hides the document synchronously between
    # appendChild() and submit(). That is still an immediate native POST and must
    # not be rejected merely because the two calls are not textually adjacent.
    immediate_submit = re.search(
        r"document\.body\.appendChild\(f\);\s*"
        r"(?:document\.documentElement\.style\.visibility\s*=\s*['\"]hidden['\"];\s*)?"
        r"f\.submit\(\);\s*}",
        flow,
    )
    if not immediate_submit:
        fail("runtime captive-flow protection missing immediate native form submission")

    # Do not reject the literal mac-auth-mode text in FLOW: it intentionally
    # appears inside the removal regex. Final generated RouterOS commands above
    # are the authoritative place where its absence is enforced.
    forbidden_flow_markers = (
        "login-by=mac,cookie",
        "window.setTimeout",
        "arofiLoginFrame",
        "idle-timeout=31d",
    )
    for marker in forbidden_flow_markers:
        if marker in flow:
            fail(f"runtime captive flow contains forbidden behavior: {marker}")

    finalizer = FINALIZER.read_text(encoding="utf-8")
    for marker, message in (
        ("guard_active_bundle_disconnects.py", "active-bundle disconnect guard"),
        ("enforce_simple_mikrotik_onboarding.py", "RouterOS 6/7 IP-first onboarding guard"),
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

    print(
        "AROFI_NO_AUTOMATIC_MAC_AUTH verified: automatic login-by=mac is absent, "
        "trusted post-login mac-cookie reconnect remains, RouterOS 6/7 onboarding guard "
        "is locked, and captive/session policy is intact."
    )


if __name__ == "__main__":
    main()
