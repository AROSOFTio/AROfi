#!/usr/bin/env python3
"""Verify that the guarded MikroTik safety transforms are already present.

This script intentionally does not rewrite source. Earlier production patch
steps own the mutations; this verifier only fails when one of the required
RouterOS safety invariants is missing. Keeping it idempotent prevents CI and
Docker builds from breaking when the source/test files have already been
updated to the newer safe form.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
MIKROTIK_SPEC = ROOT / "apps/api/src/modules/routers/mikrotik.service.spec.ts"


def require(path: Path, needles: list[str], label: str) -> None:
    if not path.exists():
        raise RuntimeError(f"Required source file missing: {path.relative_to(ROOT)}")
    text = path.read_text(encoding="utf-8")
    missing = [needle for needle in needles if needle not in text]
    if missing:
        joined = ", ".join(missing)
        raise RuntimeError(f"{label} missing required safety sentinel(s): {joined}")


def forbid(path: Path, needles: list[str], label: str) -> None:
    text = path.read_text(encoding="utf-8")
    present = [needle for needle in needles if needle in text]
    if present:
        joined = ", ".join(present)
        raise RuntimeError(f"{label} still contains unsafe pattern(s): {joined}")


def main() -> None:
    require(
        ADMIN,
        [
            "function normalizeRouterOsCommand(value: string)",
            "return normalizeRouterOsCommand(command)",
            "http://95.111.234.34/api/mikrotik/script/",
        ],
        "Router command UI",
    )

    require(
        MIKROTIK,
        [
            'dst-address="0.0.0.0/0" active=yes',
            "# 3d-2. Preserve owner management while assigning unused wired ports",
            '$ethName != "ether2"',
            "$ethRunning = false",
            "destination=$arofiWanMgmtAnchor",
            "destination=$arofiHotspotInputAnchor",
            "destination=$arofiHotspotMgmtAnchor",
            "destination=$arofiHotspotForwardAnchor",
            ':do { /ip dns static remove [find comment="AROFi hotspot DNS gateway"] } on-error={}',
            'comment="AROFi hotspot DNS gateway" } on-error={}',
        ],
        "MikroTik provisioning service",
    )
    forbid(
        MIKROTIK,
        [
            "dst-address=0.0.0.0/0 active=yes",
            "# 3d-2. Put wired LAN ports on the captive hotspot bridge too",
            "/ip firewall filter move $r destination=0",
            '/ip dns static remove [find name="${this.escape(input.dnsName)}"]',
        ],
        "MikroTik provisioning service",
    )

    require(
        MIKROTIK_SPEC,
        [
            'dst-address="0.0.0.0/0" active=yes',
            "expect(script).toContain('$ethName != \"ether2\"')",
            "expect(script).toContain('$ethRunning = false')",
            "expect(script).not.toContain('destination=0')",
            'find comment="AROFi hotspot DNS gateway"',
            "expect(script).not.toContain('/ip dns static remove [find name=\"tenantname.wifi\"]')",
        ],
        "MikroTik service tests",
    )

    print("MikroTik command output and provisioning safety invariants verified.")


if __name__ == "__main__":
    main()
