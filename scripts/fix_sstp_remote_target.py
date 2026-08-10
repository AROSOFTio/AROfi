#!/usr/bin/env python3
"""Harden MikroTik onboarding and remote-access installers for RouterOS 6/7.

RouterOS has a small global /tool fetch connection pool. The old dashboard and
API commands performed up to four HTTP(S) fetches, hid every error, and grew
large enough to be unreliable when pasted into older WinBox terminals. Replace
them with one short HTTPS fetch after a cooldown. Fetch and import errors stay
visible in the terminal, so an operator sees the real cause immediately.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
MIKROTIK_SPEC = ROOT / "apps/api/src/modules/routers/mikrotik.service.spec.ts"
ROUTERS = ROOT / "apps/api/src/modules/routers/routers.service.ts"
ADMIN_COMMANDS = ROOT / "apps/admin-web/src/lib/mikrotik-commands.ts"


def replace_regex_once(path: Path, pattern: str, replacement: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if replacement in text:
        return
    updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(
            f"{label}: expected exactly one source block in {path.relative_to(ROOT)}, found {count}"
        )
    path.write_text(updated, encoding="utf-8")


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{label}: expected exactly one marker in {path.relative_to(ROOT)}, found {count}"
        )
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


api_method = r'''  // Keep this command deliberately short. RouterOS 6 WinBox terminals and the
  // global /tool fetch pool are both unreliable with the old multi-retry command.
  // One synchronous HTTPS fetch means there is never more than one installer
  // connection, and leaving it unwrapped preserves the real RouterOS error.
  // 60-second cooldown gives RouterOS 6.49 enough time to fully release TLS
  // session slots from any prior fetch attempt before the new one starts.
  buildOneRunCommand(registrationKey: string, wanInterface?: string | null) {
    const httpsUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    const requestedWanInterface = this.normalizeWanInterface(wanInterface)
    const wanBootstrap = this.buildSelectedWanBootstrap(requestedWanInterface)
    const fileName = 'arofi-setup.rsc'
    const dnsBootstrap =
      ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; '

    return (
      wanBootstrap +
      dnsBootstrap +
      `:do { /file remove [find name="${fileName}"] } on-error={}; ` +
      `:put "AROFi: waiting 60 seconds for router fetch pool to clear..."; ` +
      `:delay 60s; ` +
      `:put "AROFi: downloading setup..."; ` +
      `/tool fetch url="${httpsUrl}" check-certificate=no dst-path="${fileName}"; ` +
      `:local arofiFile [/file find name="${fileName}"]; ` +
      `:if ([:len $arofiFile] = 0) do={ :error "AROFi: setup file was not created." }; ` +
      `:if ([/file get $arofiFile size] = 0) do={ /file remove $arofiFile; :error "AROFi: setup file is empty." }; ` +
      `:put "AROFi: setup downloaded. Installing..."; ` +
      `/import file-name="arofi-setup.rsc"; ` +
      `:delay 1s; ` +
      `/file remove $arofiFile; ` +
      `:put "AROFi setup installed."`
    )
  }

  // VPS-side tunnel gateway addresses'''

replace_regex_once(
    MIKROTIK,
    r"  (?:\/\/ Single command.*?\n)?  buildOneRunCommand\(registrationKey: string, wanInterface\?: string \| null\) \{.*?\n  \}\n\n  // VPS-side tunnel gateway addresses",
    api_method,
    "short API onboarding command",
)

admin_fetch_helper = r'''function fetchImportCommand(options: {
  httpsUrl: string
  httpUrl?: string
  fileName: string
  downloadedMessage: string
  emptyMessage: string
  missingMessage: string
  installedBlock: string
}) {
  // Exactly one synchronous fetch. Do not wrap it in on-error: RouterOS must
  // print the real DNS/TLS/HTTP/connection error instead of a generic message.
  return (
    `:do { /file remove [find name="${options.fileName}"] } on-error={}; ` +
    ':put "AROFi: waiting 20 seconds for old download connections to close..."; ' +
    ':delay 20s; ' +
    `:put "AROFi: downloading ${options.fileName}..."; ` +
    `/tool fetch url="${options.httpsUrl}" check-certificate=no dst-path="${options.fileName}"; ` +
    `:local arofiFile [/file find name="${options.fileName}"]; ` +
    `:if ([:len $arofiFile] = 0) do={ :error "${options.missingMessage}" }; ` +
    `:if ([/file get $arofiFile size] = 0) do={ /file remove $arofiFile; :error "${options.emptyMessage}" }; ` +
    `:put "${options.downloadedMessage}"; ` +
    `/import file-name="${options.fileName}"; ` +
    ':delay 1s; ' +
    '/file remove $arofiFile; ' +
    options.installedBlock
  )
}

export function absoluteApiOrigin'''

replace_regex_once(
    ADMIN_COMMANDS,
    r"function fetchImportCommand\(options: \{.*?\n\}\n\nexport function absoluteApiOrigin",
    admin_fetch_helper,
    "short dashboard installer helper",
)

one_run_test = r'''  it('buildOneRunCommand: uses one delayed HTTPS fetch and preserves RouterOS errors', () => {
    const service = new MikrotikService(
      new ConfigService({
        API_PUBLIC_HOST: 'arofi.net',
        MIKROTIK_CALLBACK_HTTP_URL: 'http://95.111.234.34',
      }),
    )

    const cmd = service.buildOneRunCommand('test-reg-key')

    expect(cmd).toContain('/ip dns set servers=8.8.8.8,1.1.1.1')
    expect(cmd).toContain(':delay 20s')
    expect(cmd).toContain('https://arofi.net/api/mikrotik/script/test-reg-key')
    expect(cmd).toContain('check-certificate=no')
    expect(cmd).toContain('/import file-name="arofi-setup.rsc"')
    expect(cmd.match(/\/tool fetch/g)).toHaveLength(1)
    expect(cmd).not.toContain('http://95.111.234.34')
    expect(cmd).not.toContain(':while')
    expect(cmd).not.toContain('Retrying after router fetch cleanup')
  })'''

replace_regex_once(
    MIKROTIK_SPEC,
    r"  it\('buildOneRunCommand:.*?\n  \}\)\n(?=\}\)\s*$)",
    one_run_test + "\n",
    "single-fetch onboarding unit test",
)

# The dashboard checks these globals after importing vpn.rsc. Ensure the
# generated remote script sets them truthfully rather than leaving "not-run".
replace_once(
    ROUTERS,
    """      `# Generated dynamically for ${this.sanitizeRouterOsComment(router.name)}`,
      `:local sstpOk 0`,
""",
    """      `# Generated dynamically for ${this.sanitizeRouterOsComment(router.name)}`,
      `:global arofiRemoteAccessStatus "failed"`,
      `:global arofiRemoteAccessMessage "SSTP client could not be enabled."`,
      `:local sstpOk 0`,
""",
    "remote-access status initialization",
)
replace_once(
    ROUTERS,
    '      `:if ($sstpOk = 0) do={ :put "ERROR: SSTP client could not be enabled."; :put "If this is RouterOS 7 device-mode, run this then press RESET within 5 minutes:"; :put "/system device-mode update mode=enterprise"; :put "After reboot, re-run the remote access install command." }`,\n',
    '      `:if ($sstpOk = 0) do={ :global arofiRemoteAccessStatus "failed"; :global arofiRemoteAccessMessage "SSTP client could not be enabled."; :put "ERROR: SSTP client could not be enabled."; :put "If this is RouterOS 7 device-mode, run this then press RESET within 5 minutes:"; :put "/system device-mode update mode=enterprise"; :put "After reboot, re-run the remote access install command." }`,\n',
    "remote-access failure status",
)
replace_once(
    ROUTERS,
    '      `:if ($sstpOk = 1) do={ :log info "AROFi Remote Access configured."; :put "AROFi Remote Access configured." }`,\n',
    '      `:if ($sstpOk = 1) do={ :global arofiRemoteAccessStatus "ok"; :global arofiRemoteAccessMessage ""; :log info "AROFi Remote Access configured."; :put "AROFi Remote Access configured." }`,\n',
    "remote-access success status",
)

# Final guards: both paste commands must contain only one fetch and no retry
# loops, while the remote script must report a truthful final status.
mikrotik_text = MIKROTIK.read_text(encoding="utf-8")
method_match = re.search(
    r"  buildOneRunCommand\(registrationKey: string, wanInterface\?: string \| null\) \{(.*?)\n  \}\n\n  // VPS-side tunnel gateway addresses",
    mikrotik_text,
    flags=re.S,
)
if not method_match:
    raise RuntimeError("Short API onboarding method is missing after patching.")
method = method_match.group(1)
if method.count('/tool fetch') != 1:
    raise RuntimeError(f"API onboarding command must contain one fetch, found {method.count('/tool fetch')}.")
for forbidden in (':while', 'Retrying after router fetch cleanup', 'on-error={} ` +'):
    if forbidden in method:
        raise RuntimeError(f"API onboarding retry/fetch suppression remains: {forbidden}")

admin_text = ADMIN_COMMANDS.read_text(encoding="utf-8")
helper_match = re.search(
    r"function fetchImportCommand\(options: \{(.*?)\n\}\n\nexport function absoluteApiOrigin",
    admin_text,
    flags=re.S,
)
if not helper_match:
    raise RuntimeError("Short dashboard installer helper is missing after patching.")
helper = helper_match.group(1)
if helper.count('/tool fetch') != 1:
    raise RuntimeError(f"Dashboard installer helper must contain one fetch, found {helper.count('/tool fetch')}.")
for forbidden in (':while', 'Retrying after router fetch cleanup'):
    if forbidden in helper:
        raise RuntimeError(f"Dashboard installer retry loop remains: {forbidden}")

spec_text = MIKROTIK_SPEC.read_text(encoding="utf-8")
for marker in (
    "uses one delayed HTTPS fetch",
    r"expect(cmd.match(/\/tool fetch/g)).toHaveLength(1)",
    "expect(cmd).not.toContain(':while')",
):
    if marker not in spec_text:
        raise RuntimeError(f"Single-fetch unit-test marker missing: {marker}")

router_text = ROUTERS.read_text(encoding="utf-8")
for marker in (
    ':global arofiRemoteAccessStatus "failed"',
    ':global arofiRemoteAccessStatus "ok"',
    ':global arofiRemoteAccessMessage ""',
):
    if marker not in router_text:
        raise RuntimeError(f"Remote-access result marker missing: {marker}")

# Preserve the existing RouterOS 6/7 SSTP compatibility verification.
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
    if marker not in router_text:
        raise RuntimeError(f"SSTP remote-access compatibility marker missing: {marker}")

failure_markers = (
    "SSTP client could not be enabled.",
    "SSTP client could not be enabled or verified",
)
if not any(marker in router_text for marker in failure_markers):
    raise RuntimeError(
        "SSTP remote-access compatibility marker missing: "
        "SSTP client could not be enabled[ or verified]"
    )

for forbidden in (
    'authentication=pap profile="AROFi_Profile" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no`,',
    "sstpAddModern",
    "sstpAddLegacy",
    "connect-to=$sstpTarget port=$sstpPort",
):
    if forbidden in router_text:
        raise RuntimeError(f"Old version-specific SSTP generator remains: {forbidden}")

print("Short single-fetch MikroTik installers and SSTP result reporting verified.")
