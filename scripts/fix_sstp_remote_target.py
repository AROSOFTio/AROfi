#!/usr/bin/env python3
"""Fix RouterOS SSTP client generation for non-default server ports and DNS.

RouterOS does not accept ``connect-to=host:port`` when adding an SSTP client.
The host belongs in ``connect-to`` and the TCP port belongs in the separate
``port`` property. Some deployed RouterOS 6 devices also fail to establish the
SSTP session through the public hostname even while normal DNS works, whereas
the production IPv4 address connects immediately. Prefer VPN_SERVER_IP and use
the known production IPv4 fallback so the generated command works first time.
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
    """    const domain = process.env.VPN_SERVER_HOST || process.env.API_PUBLIC_HOST || 'arofi.net'
    const sstpPort = process.env.VPN_SERVER_PORT || '4443'
""",
    """    const configuredVpnHost = (process.env.VPN_SERVER_IP || process.env.VPN_SERVER_HOST || '').trim()
    const domain = /^\\d{1,3}(?:\\.\\d{1,3}){3}$/.test(configuredVpnHost)
      ? configuredVpnHost
      : '95.111.234.34'
    const sstpPort = process.env.VPN_SERVER_PORT || '4443'
""",
    "SSTP production IP selection",
)

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
    "process.env.VPN_SERVER_IP",
    "'95.111.234.34'",
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
print("SSTP remote target now uses the production IP and separate host/port properties.")
