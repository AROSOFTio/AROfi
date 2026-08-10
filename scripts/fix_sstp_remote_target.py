#!/usr/bin/env python3
"""Generate SSTP remote access that works across RouterOS 6 and 7.

RouterOS SSTP syntax differs across deployed MikroTik versions. Newer versions
accept separate ``connect-to`` and ``port`` properties, while older RB9xx
RouterOS builds stop parsing as soon as they encounter the ``port`` property and
require ``connect-to=IP:PORT`` instead. The generated script now tries the modern
form first and falls back to the legacy form at runtime, so an unsupported
property never aborts the imported vpn.rsc file.

The public hostname has also proved unreliable on some deployed routers, while
the production IPv4 address connects successfully. Prefer VPN_SERVER_IP and use
the known production IPv4 fallback.
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
    '      `:local sstpPort "${sstpPort}"`,\n',
    "SSTP target declaration",
)

text = replace_once(
    text,
    '      `/interface sstp-client add name="${remoteClientName}" connect-to=$sstpTarget user="router-${router.id}" password="${token}" authentication=pap profile="AROFi_Profile" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no`,\n',
    '      `:local sstpAddModern ("/interface sstp-client add name=\\"${remoteClientName}\\" connect-to=\\"" . $sstpTarget . "\\" port=" . $sstpPort . " user=\\"router-${router.id}\\" password=\\"${token}\\" authentication=pap profile=\\"AROFi_Profile\\" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no")`,\n'
    '      `:local sstpAddLegacy ("/interface sstp-client add name=\\"${remoteClientName}\\" connect-to=\\"" . $sstpTarget . ":" . $sstpPort . "\\" user=\\"router-${router.id}\\" password=\\"${token}\\" authentication=pap profile=\\"AROFi_Profile\\" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no")`,\n'
    '      `:do { :local sstpAddFunction [:parse $sstpAddModern]; $sstpAddFunction } on-error={ :do { :local sstpAddFunction [:parse $sstpAddLegacy]; $sstpAddFunction } on-error={} }`,\n',
    "version-compatible SSTP client command",
)

text = replace_once(
    text,
    '      `:do { /interface sstp-client enable [find name="${remoteClientName}"]; :set sstpOk 1 } on-error={}`,\n',
    '      `:if ([:len [/interface sstp-client find name="${remoteClientName}"]] > 0) do={`,\n'
    '      `  :do { /interface sstp-client enable [find name="${remoteClientName}"]; :set sstpOk 1 } on-error={}`,\n'
    '      `}`,\n',
    "SSTP enable verification",
)

required = (
    "process.env.VPN_SERVER_IP",
    "'95.111.234.34'",
    '`:local sstpTarget "${domain}"`',
    '`:local sstpPort "${sstpPort}"`',
    "sstpAddModern",
    "sstpAddLegacy",
    "[:parse $sstpAddModern]",
    "[:parse $sstpAddLegacy]",
    '[:len [/interface sstp-client find name="${remoteClientName}"]] > 0',
)
for marker in required:
    if marker not in text:
        raise RuntimeError(f"SSTP remote-access fix missing marker: {marker}")

if 'connect-to=$sstpTarget port=$sstpPort' in text:
    raise RuntimeError("Direct version-specific SSTP command remains in generated source")

TARGET.write_text(text, encoding="utf-8")
print("SSTP remote access now supports both legacy and modern RouterOS syntax.")
