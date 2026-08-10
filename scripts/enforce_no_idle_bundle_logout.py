#!/usr/bin/env python3
"""Keep paid HotSpot sessions online until their real RADIUS expiry.

This restores the production-proven settings used by yesterday's working flow:
- no idle timeout;
- no keepalive timeout;
- no local profile session timeout;
- one device per credential;
- a 30-day MAC cookie only for automatic same-device reconnection.

Package expiry, quota exhaustion, explicit revocation and RADIUS CoA remain the
only authoritative ways to end access.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"

FINAL_PROFILE = (
    "shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d "
    "idle-timeout=none keepalive-timeout=none session-timeout=0s"
)

# RouterOS duration/value tokens live inside TypeScript template literals. Never
# use \S+ here: it also consumes the closing backtick/comma when the setting is
# the last token on a generated command, corrupting the TypeScript source.
ROUTEROS_VALUE = r"[^\s`,}]+"


def assert_profile_command_integrity(source: str) -> None:
    lines = [line for line in source.splitlines() if FINAL_PROFILE in line]
    if len(lines) < 2:
        raise RuntimeError(
            "Expected the default and all-profile MikroTik persistence commands after normalization."
        )

    damaged = [line for line in lines if "`" not in line.split(FINAL_PROFILE, 1)[1]]
    if damaged:
        raise RuntimeError(
            "MikroTik persistence normalization damaged a TypeScript template-literal delimiter."
        )


text = MIKROTIK.read_text(encoding="utf-8")

# Normalize every generated user-profile settings command, regardless of which
# earlier compatibility patch supplied 1d, 30d, 365d or a finite keepalive.
pattern = re.compile(
    rf"shared-users=1\s+add-mac-cookie=yes\s+mac-cookie-timeout={ROUTEROS_VALUE}"
    rf"(?:\s+idle-timeout={ROUTEROS_VALUE})?"
    rf"(?:\s+keepalive-timeout={ROUTEROS_VALUE})?"
    rf"(?:\s+session-timeout={ROUTEROS_VALUE})?"
)
text, count = pattern.subn(FINAL_PROFILE, text)
if count < 2:
    raise RuntimeError(
        "Expected the default and all-profile MikroTik persistence commands; "
        f"normalized only {count}."
    )

MIKROTIK.write_text(text, encoding="utf-8")

updated = MIKROTIK.read_text(encoding="utf-8")
if updated.count(FINAL_PROFILE) < 2:
    raise RuntimeError("Proven HotSpot persistence settings were not applied everywhere.")

assert_profile_command_integrity(updated)

for forbidden in (
    "keepalive-timeout=30d",
    "mac-cookie-timeout=365d",
):
    if forbidden in updated:
        raise RuntimeError(f"Unstable HotSpot timeout setting remains: {forbidden}")

print(
    "Paid-session persistence restored: idle/keepalive disabled, "
    "session-timeout=0s, 30-day same-device reconnect cookie."
)
