#!/usr/bin/env python3
"""Fix RouterOS SSTP client generation for non-default server ports.

RouterOS does not accept ``connect-to=host:port`` when adding an SSTP client.
The host belongs in ``connect-to`` and the TCP port belongs in the separate
``port`` property. The old generator combined VPN_SERVER_HOST and
VPN_SERVER_PORT into one value, causing ``bad address or dns name`` during the
remote-access import.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "apps/api/src/modules/routers/routers.service.ts"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} match, found {count}")
    return text.replace(old, new, 1)


text = TARGET.read_text(encoding="utf-8")

text = replace_once(
    text,
    '      `:local sstpTarget "${domain}:${sstpPort}"`,\n',
    '      `:local sstpTarget "${domain}"`,\n'
    '      `:local sstpPort ${sstpPort}`,\n',
    "SSTP target declaration",
)

text = replace_once(
    text,
    '      `/interface sstp-client add name="${remoteClientName}" connect-to=$sstpTarget user="router-${router.id}" password="${token}" authentication=pap profile="AROFi_Profile" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no`,\n',
    '      `/interface sstp-client add name="${remoteClientName}" connect-to=$sstpTarget port=$sstpPort user="router-${router.id}" password="${token}" authentication=pap profile="AROFi_Profile" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no`,\n',
    "SSTP client command",
)

required = (
    '`:local sstpTarget "${domain}"`',
    '`:local sstpPort ${sstpPort}`',
    'connect-to=$sstpTarget port=$sstpPort',
)
for marker in required:
    if marker not in text:
        raise RuntimeError(f"SSTP remote-access fix missing marker: {marker}")

if 'connect-to=$sstpTarget user=' in text:
    raise RuntimeError("Unsafe SSTP client command without a separate port remains")

TARGET.write_text(text, encoding="utf-8")
print("SSTP remote target now uses separate connect-to host and port properties.")
