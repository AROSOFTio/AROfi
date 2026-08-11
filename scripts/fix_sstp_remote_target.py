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

target_declaration = (
    '      `:local sstpTarget "${domain}"`,\n'
    '      `:local sstpPort "${sstpPort}"`,\n'
)
if target_declaration not in text:
    legacy_target_declaration = '      `:local sstpTarget "${domain}:${sstpPort}"`,\n'
    direct_host_declaration = (
        '      `:local sstpHost "${domain}"`,\n'
        '      `:local sstpPort "${sstpPort}"`,\n'
    )
    if legacy_target_declaration in text:
        text = text.replace(legacy_target_declaration, target_declaration, 1)
    elif direct_host_declaration in text:
        text = text.replace(direct_host_declaration, target_declaration, 1)
    else:
        raise RuntimeError("Expected one SSTP target declaration match, found 0")

version_compatible_sstp_add = (
    '      `:local sstpAddModern ("/interface sstp-client add name=\\"${remoteClientName}\\" connect-to=\\"" . $sstpTarget . "\\" port=" . $sstpPort . " user=\\"router-${router.id}\\" password=\\"${token}\\" authentication=pap profile=\\"AROFi_Profile\\" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no")`,\n'
    '      `:local sstpAddLegacy ("/interface sstp-client add name=\\"${remoteClientName}\\" connect-to=\\"" . $sstpTarget . ":" . $sstpPort . "\\" user=\\"router-${router.id}\\" password=\\"${token}\\" authentication=pap profile=\\"AROFi_Profile\\" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no")`,\n'
    '      `:do { :local sstpAddFunction [:parse $sstpAddModern]; $sstpAddFunction } on-error={ :do { :local sstpAddFunction [:parse $sstpAddLegacy]; $sstpAddFunction } on-error={} }`,\n'
)
if version_compatible_sstp_add not in text and not (
    "sstpAddModern" in text
    and "sstpAddLegacy" in text
    and "[:parse $sstpAddModern]" in text
    and "[:parse $sstpAddLegacy]" in text
):
    old_direct_add = '      `/interface sstp-client add name="${remoteClientName}" connect-to=$sstpTarget user="router-${router.id}" password="${token}" authentication=pap profile="AROFi_Profile" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no`,\n'
    new_direct_add = '      `:do { /interface sstp-client add name="${remoteClientName}" connect-to=$sstpHost port=$sstpPort user="router-${router.id}" password="${token}" authentication=pap profile="AROFi_Profile" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no } on-error={ :put "ERROR: SSTP client could not be created. Check RouterOS SSTP package/support and WAN." }`,\n'
    if old_direct_add in text:
        text = text.replace(old_direct_add, version_compatible_sstp_add, 1)
    elif new_direct_add in text:
        text = text.replace(new_direct_add, version_compatible_sstp_add, 1)
    else:
        raise RuntimeError("Expected one version-compatible SSTP client command match, found 0")

sstp_enable_verification = (
    '      `:if ([:len [/interface sstp-client find name="${remoteClientName}"]] > 0) do={`,\n'
    '      `  :do { /interface sstp-client enable [find name="${remoteClientName}"]; :set sstpOk 1 } on-error={}`,\n'
    '      `}`,\n'
)
strict_enable = '      `:do { /interface sstp-client enable [find name="${remoteClientName}"]; :delay 2s; :if ([:len [/interface sstp-client find name="${remoteClientName}" disabled=no]] > 0) do={ :set sstpOk 1 } } on-error={ :put "ERROR: SSTP client could not be enabled." }`,\n'
if sstp_enable_verification not in text and strict_enable not in text:
    old_enable = '      `:do { /interface sstp-client enable [find name="${remoteClientName}"]; :set sstpOk 1 } on-error={}`,\n'
    if old_enable in text:
        text = text.replace(old_enable, sstp_enable_verification, 1)
    else:
        raise RuntimeError("Expected one SSTP enable verification match, found 0")

required = (
    "process.env.VPN_SERVER_IP",
    "'95.111.234.34'",
    '`:local sstpTarget "${domain}"`',
    '`:local sstpPort "${sstpPort}"`',
    "sstpAddModern",
    "sstpAddLegacy",
    "[:parse $sstpAddModern]",
    "[:parse $sstpAddLegacy]",
)
for marker in required:
    if marker not in text:
        raise RuntimeError(f"SSTP remote-access fix missing marker: {marker}")

if (
    '[:len [/interface sstp-client find name="${remoteClientName}"]] > 0' not in text
    and '[:len [/interface sstp-client find name="${remoteClientName}" disabled=no]] > 0' not in text
):
    raise RuntimeError("SSTP remote-access fix missing enable verification marker")

if 'connect-to=$sstpTarget port=$sstpPort' in text or 'connect-to=$sstpHost port=$sstpPort' in text:
    raise RuntimeError("Direct version-specific SSTP command remains in generated source")

TARGET.write_text(text, encoding="utf-8")
print("SSTP remote access now supports both legacy and modern RouterOS syntax.")
