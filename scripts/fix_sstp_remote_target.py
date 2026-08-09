#!/usr/bin/env python3
"""Verify the SSTP remote-access generator remains RouterOS-version tolerant.

This script is part of the Docker build patch chain. It must be idempotent: if
the TypeScript source already contains the guarded RouterOS 6/7 SSTP commands,
it should only verify them. Older builds used one huge ``/interface
sstp-client add`` line with optional properties inline; one unsupported
property could abort the whole imported vpn.rsc on some RouterOS versions.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "apps/api/src/modules/routers/routers.service.ts"


def fail(message: str) -> None:
    raise RuntimeError(message)


text = TARGET.read_text(encoding="utf-8")

required = (
    "const parseGuard = (command: string, message: string)",
    '/interface sstp-client add name="${remoteClientName}" connect-to=$sstpTarget',
    "AROFi: SSTP add failed - unsupported RouterOS option or SSTP not available.",
    '/interface sstp-client set [find name="${remoteClientName}"] authentication=pap',
    '/interface sstp-client set [find name="${remoteClientName}"] keepalive-timeout=60',
    '/interface sstp-client set [find name="${remoteClientName}"] verify-server-certificate=no',
    'add-default-route=no disabled=yes',
)

for marker in required:
    if marker not in text:
        fail(f"SSTP remote-access compatibility marker missing: {marker}")

# The operator-facing failure text was shortened in the stable RouterOS
# compatibility rollback. Accept either safe wording so this verifier remains
# idempotent across the hardened and rolled-back generators.
failure_markers = (
    "SSTP client could not be enabled.",
    "SSTP client could not be enabled or verified",
)
if not any(marker in text for marker in failure_markers):
    fail(
        "SSTP remote-access compatibility marker missing: "
        "SSTP client could not be enabled[ or verified]"
    )

for forbidden in (
    'authentication=pap profile="AROFi_Profile" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no`,',
    "sstpAddModern",
    "sstpAddLegacy",
    "connect-to=$sstpTarget port=$sstpPort",
):
    if forbidden in text:
        fail(f"Old version-specific SSTP generator remains: {forbidden}")

print("SSTP remote access generator verified for guarded RouterOS 6/7 syntax.")
