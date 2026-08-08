#!/usr/bin/env python3
"""Keep paid HotSpot sessions online until their real RADIUS expiry.

This restores the production-proven settings used by yesterday's working flow:
- 31-day idle timeout;
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
    "idle-timeout=31d keepalive-timeout=none session-timeout=0s"
)

text = MIKROTIK.read_text(encoding="utf-8")

# Normalize every generated user-profile settings command, regardless of which
# earlier compatibility patch supplied 1d, 30d, 365d or a finite keepalive.
pattern = re.compile(
    # Values live inside TypeScript template literals. Stop before the next
    # same-line closing backtick so normalization cannot remove delimiters or
    # the closing brace in the all-profile command.
    r"shared-users=1\s+add-mac-cookie=yes\s+mac-cookie-timeout=[^\s`,]+"
    r"(?:\s+idle-timeout=[^\s`,]+)?"
    r"(?:\s+keepalive-timeout=[^\s`,]+)?"
    r"(?:\s+session-timeout=[^\s`,]+)?"
    r"(?=[^`\r\n]*`)"
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

for forbidden in (
    "keepalive-timeout=30d",
    "mac-cookie-timeout=365d",
):
    if forbidden in updated:
        raise RuntimeError(f"Unstable HotSpot timeout setting remains: {forbidden}")

print(
    "Paid-session persistence restored: 31-day idle / keepalive disabled, "
    "session-timeout=0s, 30-day same-device reconnect cookie."
)
