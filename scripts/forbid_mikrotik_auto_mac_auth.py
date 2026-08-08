#!/usr/bin/env python3
"""Hard build/CI guard: automatic MikroTik HotSpot MAC auth is forbidden.

This repository may still use a MAC address as device identity, bind one paid
activation to one device, or explicitly provision a Smart TV from the portal.
It must NEVER make RouterOS automatically authenticate a newly connected phone
by MAC address. That mode delays captive detection and caused repeated customer
failures.

Run this only after all build-time source patches. It rejects the build if any
final provisioning command enables ``mac`` in ``login-by`` or sets
``mac-auth-mode``. It also verifies the runtime removal patch, agent policy and
CI/Docker gates remain installed.
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


def fail(message: str) -> None:
    raise RuntimeError(f"AUTOMATIC MAC AUTH IS FORBIDDEN: {message}")


def main() -> None:
    required_files = (MIKROTIK, FLOW, FINALIZER, DOCKERFILE, CI, DEPLOY, AGENTS, COPILOT)
    missing_files = [str(path.relative_to(ROOT)) for path in required_files if not path.exists()]
    if missing_files:
        fail("required guard/policy files missing: " + ", ".join(missing_files))

    generated_source = MIKROTIK.read_text(encoding="utf-8")

    # Match real RouterOS command values after build patches. Comments in policy
    # documents are intentionally not scanned here.
    login_values = re.findall(r"login-by=([^\s`\"']+)", generated_source)
    bad_values = [
        value for value in login_values
        if "mac" in {part.strip().lower() for part in value.split(",")}
    ]
    if bad_values:
        fail("final MikroTik provisioning still contains login-by MAC mode: " + ", ".join(bad_values))

    if re.search(r"mac-auth-mode\s*=", generated_source, flags=re.IGNORECASE):
        fail("final MikroTik provisioning still sets mac-auth-mode")

    if "login-by=cookie,http-pap" not in generated_source:
        fail("final MikroTik provisioning does not explicitly use cookie,http-pap")

    flow = FLOW.read_text(encoding="utf-8")
    required_flow_markers = (
        ".filter((mode) => mode && mode !== 'mac')",
        "const safeModes = Array.from(new Set([...modes, 'cookie', 'http-pap']))",
        "f.method='post';f.action=target;f.style.display='none'",
        "document.body.appendChild(f);f.submit();}",
    )
    for marker in required_flow_markers:
        if marker not in flow:
            fail(f"runtime captive-flow protection missing marker: {marker}")

    forbidden_flow_markers = (
        "[...modes, 'mac'",
        "modes.push('mac')",
        "window.setTimeout",
        "arofiLoginFrame",
    )
    for marker in forbidden_flow_markers:
        if marker in flow:
            fail(f"runtime captive flow contains forbidden behavior: {marker}")

    finalizer = FINALIZER.read_text(encoding="utf-8")
    if "verify_router_captive_invariants.py" not in finalizer:
        fail("the final source-normalization stage no longer runs captive invariants")

    # Docker and both GitHub workflows independently run this guard. This makes
    # accidental removal visible in local/Coolify builds and in branch/main CI.
    for path in (DOCKERFILE, CI, DEPLOY):
        text = path.read_text(encoding="utf-8")
        if GUARD_COMMAND not in text:
            fail(f"guard command missing from {path.relative_to(ROOT)}")

    for path in (AGENTS, COPILOT):
        text = path.read_text(encoding="utf-8")
        if POLICY_MARKER not in text:
            fail(f"AI/agent policy marker missing from {path.relative_to(ROOT)}")

    print(
        "AROFI_NO_AUTOMATIC_MAC_AUTH verified: RouterOS login-by is cookie,http-pap, "
        "direct voucher POST is intact, and Docker/CI/agent guards are installed."
    )


if __name__ == "__main__":
    main()
