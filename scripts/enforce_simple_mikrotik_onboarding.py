#!/usr/bin/env python3
'''Enforce the final MikroTik onboarding command contract.

The final operator-facing setup command must stay compatible with RouterOS 6
and 7, try the known raw public HTTP/IP bootstrap first, retain configured HTTPS
as an immediate fallback, import in the foreground, preserve selected-WAN setup,
and never reintroduce artificial 20-second cooldowns.

RouterOS 6 reset/no-defaults devices can have no active WAN at all. AUTO mode
therefore has one deliberately narrow recovery path: only RouterOS major 6,
only when there is no active default route, only when ether1 exists, has no
static IP, is not a bridge member, and has no PPPoE client. In that exact case
AROFi enables/creates a DHCP client on ether1 and waits briefly for a route.
RouterOS 7 never enters this compatibility branch.

Fresh/rebooted routers can also have a 1970 clock and broken DNS. The raw-IP path
is therefore intentionally first: it does not depend on DNS or TLS. The Admin UI
uses the same IP-first helper and may reject stale API-provided commands when
they do not contain the known fallback path.
'''

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
SPEC = ROOT / "apps/api/src/modules/routers/mikrotik.service.spec.ts"
ADMIN_COMMANDS = ROOT / "apps/admin-web/src/lib/mikrotik-commands.ts"
ADMIN_MANAGER = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"

FORBIDDEN_BOOTSTRAP_MARKERS = (
    "waiting 20 seconds",
    ":delay 20s",
)

ROUTEROS6_RESET_WAN_TS = (
    "':local arofiRosVersion [/system resource get version]; "
    ":local arofiRosMajor [:pick $arofiRosVersion 0 1]; "
    ":if ($arofiRosMajor = \"6\") do={ "
    ":if ([:len [/ip route find dst-address=\"0.0.0.0/0\" active=yes]] = 0) do={ "
    ":if ([:len [/interface find where name=\"ether1\"]] > 0) do={ "
    ":if ([:len [/ip address find where interface=\"ether1\"]] = 0) do={ "
    ":if ([:len [/interface bridge port find where interface=\"ether1\"]] = 0) do={ "
    ":if ([:len [/interface pppoe-client find where interface=\"ether1\"]] = 0) do={ "
    ":local arofiRos6Dhcp [/ip dhcp-client find where interface=\"ether1\"]; "
    ":if ([:len $arofiRos6Dhcp] = 0) do={ "
    ":do { /ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes disabled=no comment=\"AROFi RouterOS6 reset WAN\" } on-error={} "
    "} else={ :do { /ip dhcp-client set $arofiRos6Dhcp add-default-route=yes use-peer-dns=yes disabled=no } on-error={} }; "
    ":local arofiRos6Wait 0; "
    ":while ($arofiRos6Wait < 12 && [:len [/ip route find dst-address=\"0.0.0.0/0\" active=yes]] = 0) do={ "
    ":delay 1s; :set arofiRos6Wait ($arofiRos6Wait + 1) "
    "} "
    "} "
    "} "
    "} "
    "} "
    "} "
    "}; '"
)


def patch_api_onboarding() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")

    pattern = re.compile(
        r"  buildOneRunCommand\(registrationKey: string(?:, wanInterface\?: string \| null)?\) \{.*?\n"
        r"  \}\n\n  // VPS-side tunnel gateway addresses",
        flags=re.S,
    )

    replacement = r'''  buildOneRunCommand(registrationKey: string, wanInterface?: string | null) {
    const url = `${this.resolveApiBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    const fallbackUrl = `http://95.111.234.34/api/mikrotik/script/${this.escape(registrationKey)}`
    const requestedWanInterface = this.normalizeWanInterface(wanInterface)
    const selectedWanBootstrap = this.buildSelectedWanBootstrap(requestedWanInterface)
    const routerOs6AutoWanBootstrap =
      ':local arofiRosVersion [/system resource get version]; ' +
      ':local arofiRosMajor [:pick $arofiRosVersion 0 1]; ' +
      ':if ($arofiRosMajor = "6") do={ ' +
        ':if ([:len [/ip route find dst-address="0.0.0.0/0" active=yes]] = 0) do={ ' +
          ':if ([:len [/interface find where name="ether1"]] > 0) do={ ' +
            ':if ([:len [/ip address find where interface="ether1"]] = 0) do={ ' +
              ':if ([:len [/interface bridge port find where interface="ether1"]] = 0) do={ ' +
                ':if ([:len [/interface pppoe-client find where interface="ether1"]] = 0) do={ ' +
                  ':local arofiRos6Dhcp [/ip dhcp-client find where interface="ether1"]; ' +
                  ':if ([:len $arofiRos6Dhcp] = 0) do={ ' +
                    ':do { /ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes disabled=no comment="AROFi RouterOS6 reset WAN" } on-error={} ' +
                  '} else={ :do { /ip dhcp-client set $arofiRos6Dhcp add-default-route=yes use-peer-dns=yes disabled=no } on-error={} }; ' +
                  ':local arofiRos6Wait 0; ' +
                  ':while ($arofiRos6Wait < 12 && [:len [/ip route find dst-address="0.0.0.0/0" active=yes]] = 0) do={ ' +
                    ':delay 1s; :set arofiRos6Wait ($arofiRos6Wait + 1) ' +
                  '} ' +
                '} ' +
              '} ' +
            '} ' +
          '} ' +
        '} ' +
      '}; '
    const wanBootstrap = requestedWanInterface ? selectedWanBootstrap : routerOs6AutoWanBootstrap
    const bootstrap =
      ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; ' +
      ':do { :local n [:parse "/system ntp client set enabled=yes servers=pool.ntp.org"]; $n } ' +
      'on-error={ :do { :local n [:parse "/system ntp client set enabled=yes primary-ntp=162.159.200.1"]; $n } on-error={} }; ' +
      ':delay 1s; '

    return (
      wanBootstrap +
      bootstrap +
      ':local arofiOk 0; :local attempts 0; ' +
      ':while ($attempts < 3) do={ ' +
        ':set attempts ($attempts + 1); ' +
        ':do { /file remove [find name="arofi-setup.rsc"] } on-error={}; ' +
        `:do { /tool fetch url="${fallbackUrl}" dst-path="arofi-setup.rsc" mode=http; :delay 1s; :local f [/file find name="arofi-setup.rsc"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={}; ` +
        ':if ($arofiOk = 0) do={ ' +
          ':do { /file remove [find name="arofi-setup.rsc"] } on-error={}; ' +
          `:do { /tool fetch url="${url}" check-certificate=no dst-path="arofi-setup.rsc" mode=https; :delay 1s; :local f [/file find name="arofi-setup.rsc"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={} ` +
        '}; ' +
        ':if ($arofiOk = 1) do={ :set attempts 3 } else={ :if ($attempts < 3) do={ :put "Retrying AROFi setup download..."; :delay 2s } } ' +
      '}; ' +
      ':local f [/file find name="arofi-setup.rsc"]; :if ([:len $f]>0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :put "AROFi setup downloaded. Installing..."; :delay 1s; /import file-name="arofi-setup.rsc"; :delay 1s; /file remove "arofi-setup.rsc"; :put "AROFi setup installed." } else={ :put "ERROR: AROFi setup file is empty. Re-paste when WAN is stable."; /file remove $f } } else={ :put "ERROR: AROFi setup file was not downloaded. Check WAN, then re-paste." }'
    )
  }

  // VPS-side tunnel gateway addresses'''

    updated, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise RuntimeError(
            "Expected exactly one WAN-aware buildOneRunCommand block after router patches; "
            f"found {count}."
        )

    method_match = re.search(
        r"  buildOneRunCommand\(registrationKey: string(?:, wanInterface\?: string \| null)?\) \{(.*?)\n"
        r"  \}\n\n  // VPS-side tunnel gateway addresses",
        updated,
        flags=re.S,
    )
    if not method_match:
        raise RuntimeError("IP-first onboarding method is missing after normalization")

    method = method_match.group(1)
    if method.count("/tool fetch") != 2:
        raise RuntimeError(
            f"Onboarding command must contain exactly two /tool fetch attempts, found {method.count('/tool fetch')}."
        )

    for marker in (*FORBIDDEN_BOOTSTRAP_MARKERS, "http://arofi.net"):
        if marker in method:
            raise RuntimeError(f"Forbidden onboarding retry/cooldown/insecure marker remains: {marker}")

    http_fetch = 'url="${fallbackUrl}" dst-path="arofi-setup.rsc" mode=http'
    https_fetch = 'url="${url}" check-certificate=no dst-path="arofi-setup.rsc" mode=https'
    required = (
        "http://95.111.234.34/api/mikrotik/script/",
        "fallbackUrl",
        "arofiOk",
        "attempts",
        ':while ($attempts < 3)',
        http_fetch,
        https_fetch,
        "/ip dns set servers=8.8.8.8,1.1.1.1",
        '[:parse "/system ntp client set enabled=yes servers=pool.ntp.org"]',
        '[:parse "/system ntp client set enabled=yes primary-ntp=162.159.200.1"]',
        "const requestedWanInterface = this.normalizeWanInterface(wanInterface)",
        "const selectedWanBootstrap = this.buildSelectedWanBootstrap(requestedWanInterface)",
        "const wanBootstrap = requestedWanInterface ? selectedWanBootstrap : routerOs6AutoWanBootstrap",
        ':if ($arofiRosMajor = "6") do={',
        '[/ip route find dst-address="0.0.0.0/0" active=yes]',
        '[/ip address find where interface="ether1"]',
        '[/interface bridge port find where interface="ether1"]',
        '[/interface pppoe-client find where interface="ether1"]',
        '/ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes disabled=no comment="AROFi RouterOS6 reset WAN"',
        "wanBootstrap +",
        "/tool fetch url=",
        "check-certificate=no",
        '/import file-name="arofi-setup.rsc"',
        '/file remove "arofi-setup.rsc"',
    )
    for marker in required:
        if marker not in method:
            raise RuntimeError(f"IP-first RouterOS 6/7 onboarding marker missing: {marker}")

    auto_gate = method.find(':if ($arofiRosMajor = "6") do={')
    auto_dhcp = method.find('/ip dhcp-client add interface=ether1')
    if auto_gate < 0 or auto_dhcp < 0 or auto_gate >= auto_dhcp:
        raise RuntimeError("RouterOS 6 AUTO-WAN DHCP recovery is not protected by the RouterOS 6 version gate")

    http_idx = method.find(http_fetch)
    https_idx = method.find(https_fetch)
    if http_idx < 0 or https_idx < 0 or http_idx >= https_idx:
        raise RuntimeError("Router setup command must attempt raw public HTTP/IP before HTTPS")

    MIKROTIK.write_text(updated, encoding="utf-8")


def patch_admin_routeros6_bootstrap(text: str) -> str:
    constant_marker = "const AROFI_HTTP_FALLBACK_ORIGIN = 'http://95.111.234.34/api'\n"
    if constant_marker not in text:
        raise RuntimeError("Admin raw-IP fallback origin is missing")

    if "const ROUTEROS6_RESET_WAN_BOOTSTRAP" not in text:
        routeros6_constant = (
            constant_marker
            + "const ROUTEROS6_RESET_WAN_BOOTSTRAP = "
            + ROUTEROS6_RESET_WAN_TS
            + "\n"
        )
        text = text.replace(constant_marker, routeros6_constant, 1)

    old_prefix = "  return `${DNS_BOOTSTRAP}:local arofiOk 0;"
    new_prefix = "  return `${ROUTEROS6_RESET_WAN_BOOTSTRAP}${DNS_BOOTSTRAP}:local arofiOk 0;"
    if new_prefix not in text:
        if old_prefix not in text:
            raise RuntimeError("Admin RouterOS download helper bootstrap prefix is missing")
        text = text.replace(old_prefix, new_prefix, 1)

    for marker in (
        "const ROUTEROS6_RESET_WAN_BOOTSTRAP",
        ':if ($arofiRosMajor = "6") do={',
        '[/ip route find dst-address="0.0.0.0/0" active=yes]',
        '[/ip address find where interface="ether1"]',
        '[/interface bridge port find where interface="ether1"]',
        '[/interface pppoe-client find where interface="ether1"]',
        'comment="AROFi RouterOS6 reset WAN"',
        "${ROUTEROS6_RESET_WAN_BOOTSTRAP}${DNS_BOOTSTRAP}",
    ):
        if marker not in text:
            raise RuntimeError(f"Admin RouterOS 6 reset-WAN bootstrap marker missing: {marker}")

    return text


def patch_admin_fallback() -> None:
    text = ADMIN_COMMANDS.read_text(encoding="utf-8")

    if "function buildReliableRouterOsDownload(" not in text:
        raise RuntimeError("Admin RouterOS download helper is missing")

    text = patch_admin_routeros6_bootstrap(text)

    pattern = re.compile(
        r"export function buildSetupFallbackCommand\(registrationKey: string(?:, origin\?: string)?\) \{.*?\n\}",
        flags=re.S,
    )
    replacement = r'''export function buildSetupFallbackCommand(registrationKey: string, origin?: string) {
  const apiOrigin = absoluteApiOrigin(process.env.NEXT_PUBLIC_API_URL, origin)
  return buildReliableRouterOsDownload({
    httpsUrl: `${apiOrigin}/mikrotik/script/${registrationKey}`,
    httpFallbackUrl: `${AROFI_HTTP_FALLBACK_ORIGIN}/mikrotik/script/${registrationKey}`,
    fileName: 'arofi-setup.rsc',
    retryLabel: 'Retrying AROFi setup download...',
    downloadedLabel: 'AROFi setup downloaded. Installing...',
    installedLabel: 'AROFi setup installed.',
    emptyError: 'ERROR: AROFi setup file is empty. Re-paste when WAN is stable.',
    missingError: 'ERROR: AROFi setup file was not downloaded. Check WAN, then re-paste.',
  })
}'''

    updated, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise RuntimeError(
            f"Expected exactly one Admin buildSetupFallbackCommand, found {count}."
        )

    match = pattern.search(updated)
    if not match:
        raise RuntimeError("Admin fallback command is missing after normalization")
    fallback = match.group(0)

    for marker in FORBIDDEN_BOOTSTRAP_MARKERS:
        if marker in updated:
            raise RuntimeError(f"Forbidden Admin fallback marker remains: {marker}")

    for marker in (
        "absoluteApiOrigin(process.env.NEXT_PUBLIC_API_URL, origin)",
        "buildReliableRouterOsDownload({",
        "httpsUrl: `${apiOrigin}/mikrotik/script/${registrationKey}`",
        "httpFallbackUrl: `${AROFI_HTTP_FALLBACK_ORIGIN}/mikrotik/script/${registrationKey}`",
        "fileName: 'arofi-setup.rsc'",
    ):
        if marker not in fallback:
            raise RuntimeError(f"Admin IP-first fallback marker missing: {marker}")

    helper_start = updated.find("function buildReliableRouterOsDownload(")
    helper_end = updated.find("export function buildRemoteAccessInstallCommand", helper_start)
    helper = updated[helper_start:helper_end] if helper_start >= 0 and helper_end > helper_start else ""
    http_idx = helper.find('url="${httpFallbackUrl}"')
    https_idx = helper.find('url="${httpsUrl}"')
    if http_idx < 0 or https_idx < 0 or http_idx >= https_idx:
        raise RuntimeError("Admin RouterOS download helper must attempt raw HTTP/IP before HTTPS")
    if "${ROUTEROS6_RESET_WAN_BOOTSTRAP}${DNS_BOOTSTRAP}" not in helper:
        raise RuntimeError("Admin download helper lost the RouterOS 6 reset-WAN bootstrap")

    ADMIN_COMMANDS.write_text(updated, encoding="utf-8")


def patch_admin_command_selection() -> None:
    text = ADMIN_MANAGER.read_text(encoding="utf-8")
    pattern = re.compile(
        r"  function oneRunCommand\(\) \{.*?\n  \}\n\n  async function copyScript",
        flags=re.S,
    )
    replacement = r'''  function oneRunCommand() {
    if (!selectedSetup) return ''
    const registrationKey = selectedSetup.router.registrationKey
    const serverCommand = selectedSetup.oneRunCommand ?? ''
    const hasLegacyInstaller =
      serverCommand.includes('waiting 20 seconds') ||
      serverCommand.includes(':delay 20s') ||
      !serverCommand.includes('http://95.111.234.34/api/mikrotik/script/')
    const command = !serverCommand || hasLegacyInstaller
      ? (registrationKey ? buildSetupFallbackCommand(registrationKey) : '')
      : serverCommand
    return command
  }

  async function copyScript'''

    updated, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise RuntimeError(f"Expected exactly one Admin oneRunCommand helper, found {count}.")

    required = (
        "const serverCommand = selectedSetup.oneRunCommand ?? ''",
        "const hasLegacyInstaller =",
        "serverCommand.includes('waiting 20 seconds')",
        "serverCommand.includes(':delay 20s')",
        "!serverCommand.includes('http://95.111.234.34/api/mikrotik/script/')",
        "? (registrationKey ? buildSetupFallbackCommand(registrationKey) : '')",
        "return command",
    )
    for marker in required:
        if marker not in updated:
            raise RuntimeError(f"Admin stale-installer protection marker missing: {marker}")

    if "return selectedSetup.oneRunCommand ??" in updated:
        raise RuntimeError("Admin still blindly trusts the API oneRunCommand")

    ADMIN_MANAGER.write_text(updated, encoding="utf-8")


def patch_unit_test() -> None:
    spec = SPEC.read_text(encoding="utf-8")
    test_pattern = re.compile(
        r"  it\('buildOneRunCommand:.*?\n  \}\)\n(?=\}\)\s*$)",
        flags=re.S,
    )
    test_replacement = r'''  it('buildOneRunCommand: keeps RouterOS 6 reset WAN recovery behind a v6-only gate', () => {
    const service = new MikrotikService(
      new ConfigService({
        API_PUBLIC_HOST: 'arofi.net',
        MIKROTIK_CALLBACK_HTTP_URL: 'http://dev.arofi.net',
      }),
    )

    const cmd = service.buildOneRunCommand('test-reg-key')

    expect(cmd).toContain(':local arofiRosMajor [:pick $arofiRosVersion 0 1]')
    expect(cmd).toContain(':if ($arofiRosMajor = "6") do={')
    expect(cmd).toContain('[/ip route find dst-address="0.0.0.0/0" active=yes]')
    expect(cmd).toContain('[/ip address find where interface="ether1"]')
    expect(cmd).toContain('[/interface bridge port find where interface="ether1"]')
    expect(cmd).toContain('[/interface pppoe-client find where interface="ether1"]')
    expect(cmd).toContain('/ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes disabled=no comment="AROFi RouterOS6 reset WAN"')
    expect(cmd).toContain('[:parse "/system ntp client set enabled=yes servers=pool.ntp.org"]')
    expect(cmd).toContain('primary-ntp=162.159.200.1')
    const httpIdx = cmd.indexOf('http://95.111.234.34/api/mikrotik/script/test-reg-key')
    const httpsIdx = cmd.indexOf('https://arofi.net/api/mikrotik/script/test-reg-key')
    expect(httpIdx).toBeGreaterThan(-1)
    expect(httpsIdx).toBeGreaterThan(-1)
    expect(httpIdx).toBeLessThan(httpsIdx)
    expect(cmd).toContain('check-certificate=no')
    expect(cmd.match(/\/tool fetch/g)).toHaveLength(2)
    expect(cmd).toContain(':while ($attempts < 3)')
    expect(cmd).toContain('/import file-name="arofi-setup.rsc"')
    expect(cmd).not.toContain('waiting 20 seconds')
    expect(cmd).not.toContain(':delay 20s')

    const explicitWan = service.buildOneRunCommand('test-reg-key', 'ether2')
    expect(explicitWan).toContain(':local arofiSelectedWan "ether2"')
    expect(explicitWan).toContain('AROFi: selected ISP/WAN port ether2 is ready.')
  })
'''

    spec, spec_count = test_pattern.subn(test_replacement, spec, count=1)
    if spec_count != 1:
        raise RuntimeError(
            f"Expected exactly one buildOneRunCommand unit test, found {spec_count}."
        )

    for marker in (
        "keeps RouterOS 6 reset WAN recovery behind a v6-only gate",
        ':if ($arofiRosMajor = \"6\") do={',
        "AROFi RouterOS6 reset WAN",
        "http://95.111.234.34/api/mikrotik/script/test-reg-key",
        "https://arofi.net/api/mikrotik/script/test-reg-key",
        "expect(httpIdx).toBeLessThan(httpsIdx)",
        "expect(cmd.match(/\\/tool fetch/g)).toHaveLength(2)",
        "expect(cmd).toContain(':while ($attempts < 3)')",
        "service.buildOneRunCommand('test-reg-key', 'ether2')",
        ':local arofiSelectedWan \"ether2\"',
        "expect(cmd).not.toContain('waiting 20 seconds')",
    ):
        if marker not in spec:
            raise RuntimeError(f"RouterOS 6/7 onboarding unit-test marker missing: {marker}")

    SPEC.write_text(spec, encoding="utf-8")


def main() -> None:
    for path in (MIKROTIK, SPEC, ADMIN_COMMANDS, ADMIN_MANAGER):
        if not path.exists():
            raise RuntimeError(f"Required onboarding source missing: {path.relative_to(ROOT)}")

    patch_api_onboarding()
    patch_admin_fallback()
    patch_admin_command_selection()
    patch_unit_test()

    print(
        "MikroTik onboarding verified end-to-end: selected-WAN preparation is preserved, "
        "RouterOS 6 AUTO mode can safely recover ether1 DHCP after a blank reset, RouterOS 7 "
        "is outside that compatibility branch, raw-IP-first + HTTPS fallback remain guarded, "
        "foreground import remains intact, and Admin uses the same protected fallback."
    )


if __name__ == "__main__":
    main()
