#!/usr/bin/env python3
"""Ensure active HotSpot bundles are never ended by inactivity.

Only the RADIUS Session-Timeout tied to the package expiry should end a paid
session automatically. MikroTik idle/keepalive timers are disabled. A long MAC
cookie is retained only to let the same device reconnect automatically after it
walks out of range or temporarily disables Wi-Fi; package expiry still removes
the cookie through Session-Timeout/Disconnect-Request.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"

OLD_DEFAULT = (
    '`/ip hotspot user profile set [find default=yes] shared-users=1 '
    'add-mac-cookie=yes mac-cookie-timeout=1d keepalive-timeout=30d`'
)
NEW_DEFAULT = (
    '`/ip hotspot user profile set [find default=yes] shared-users=1 '
    'add-mac-cookie=yes mac-cookie-timeout=365d idle-timeout=none '
    'keepalive-timeout=none`'
)
OLD_ALL = (
    '`:foreach up in=[/ip hotspot user profile find] do={ /ip hotspot user profile '
    'set $up shared-users=1 add-mac-cookie=yes mac-cookie-timeout=1d '
    'keepalive-timeout=30d }`'
)
NEW_ALL = (
    '`:foreach up in=[/ip hotspot user profile find] do={ /ip hotspot user profile '
    'set $up shared-users=1 add-mac-cookie=yes mac-cookie-timeout=365d '
    'idle-timeout=none keepalive-timeout=none }`'
)

text = MIKROTIK.read_text(encoding="utf-8")

for old, new, label in (
    (OLD_DEFAULT, NEW_DEFAULT, "default HotSpot user profile"),
    (OLD_ALL, NEW_ALL, "all HotSpot user profiles"),
):
    if new in text:
        continue
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{MIKROTIK.relative_to(ROOT)}: expected one {label} marker, found {count}."
        )
    text = text.replace(old, new, 1)

MIKROTIK.write_text(text, encoding="utf-8")

updated = MIKROTIK.read_text(encoding="utf-8")
required = (
    "mac-cookie-timeout=365d idle-timeout=none keepalive-timeout=none",
    "mac-cookie-timeout=365d idle-timeout=none keepalive-timeout=none }",
)
for marker in required:
    if marker not in updated:
        raise RuntimeError(f"No-idle-logout protection missing: {marker}")

print(
    "Active bundle protection verified: idle-timeout=none, "
    "keepalive-timeout=none, automatic same-device reconnect retained."
)
