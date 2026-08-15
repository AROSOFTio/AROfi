#!/usr/bin/env python3
"""Make MikroTik one-run onboarding reset-first without changing provisioning.

This patch intentionally leaves ``buildProvisioningScript`` configuration logic intact.
It changes only the one-run entry flow so the already-generated AroFi setup file is:

1. downloaded and verified while the router still has working connectivity;
2. stored in reboot-persistent storage (``flash/`` when the device exposes it);
3. executed by RouterOS ``run-after-reset`` after a configuration reset/reboot; and
4. removed after successful provisioning so no obsolete onboarding artifact remains.

The reset uses RouterOS factory defaults rather than ``no-defaults=yes``. That clears the
previous user configuration while retaining MikroTik's model-specific bootstrap defaults,
which is the least disruptive hand-off for the existing AroFi RouterOS 6/7 provisioning
logic and its current WAN assumptions.
"""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"

SENTINEL = "AroFi reset-first onboarding"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def reset_first_method() -> str:
    return r'''  // AroFi reset-first onboarding: stage the proven setup file while WAN is
  // still available, reset RouterOS, then let RouterOS execute that exact file.
  // The actual provisioning script is intentionally unchanged.
  buildOneRunCommand(registrationKey: string, wanInterface?: string | null) {
    const url = `${this.resolveApiBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    const fallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    const requestedWanInterface = this.normalizeWanInterface(wanInterface)
    const wanBootstrap = this.buildSelectedWanBootstrap(requestedWanInterface)

    // Keep the existing RouterOS 6/7-safe DNS + NTP bootstrap. [:parse] defers
    // version-specific NTP syntax until runtime so an unsupported parameter on
    // one RouterOS major version cannot kill the whole one-run command.
    const dnsBootstrap =
      ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; ' +
      ':do { :local n [:parse "/system ntp client set enabled=yes servers=pool.ntp.org"]; $n } ' +
      'on-error={ :do { :local n [:parse "/system ntp client set enabled=yes primary-ntp=162.159.200.1"]; $n } on-error={} }; ' +
      ':delay 2s; '

    return (
      wanBootstrap +
      dnsBootstrap +
      // On RouterBOARDs that expose flash/, files outside it are RAM-backed and
      // disappear on reboot. Other devices keep root files, so choose at runtime.
      ':local arofiSetupPath "arofi-setup.rsc"; ' +
      ':if ([:len [/file find name="flash"]] > 0) do={ :set arofiSetupPath "flash/arofi-setup.rsc" }; ' +
      // Permanently remove any stale setup artifact before staging this run.
      ':do { /file remove [find name="arofi-setup.rsc"] } on-error={}; ' +
      ':do { /file remove [find name="flash/arofi-setup.rsc"] } on-error={}; ' +
      ':do { /system script remove [find name="arofi-reset-once"] } on-error={}; ' +
      ':local arofiOk 0; :local attempts 0; ' +
      ':while ($attempts < 3) do={ ' +
        ':set attempts ($attempts + 1); ' +
        ':do { /file remove [find name=$arofiSetupPath] } on-error={}; ' +
        // HTTP remains first so a bad pre-reset clock cannot block staging.
        `:do { /tool fetch url="${fallbackUrl}" dst-path=$arofiSetupPath mode=http; :delay 4s; :local f [/file find name=$arofiSetupPath]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={}; ` +
        ':if ($arofiOk = 0) do={ ' +
          ':do { /file remove [find name=$arofiSetupPath] } on-error={}; ' +
          `:do { /tool fetch url="${url}" check-certificate=no dst-path=$arofiSetupPath mode=https; :delay 4s; :local f [/file find name=$arofiSetupPath]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={} ` +
        '}; ' +
        ':if ($arofiOk = 1) do={ :set attempts 3 } else={ ' +
          ':if ($attempts < 3) do={ :put "Retrying AroFi setup download..."; :delay 5s } ' +
        '} ' +
      '}; ' +
      ':if ($arofiOk = 0) do={ ' +
        ':put "ERROR: AroFi server unreachable after 3 attempts. Router was NOT reset."; ' +
        ':put "Check WAN internet, DNS, HTTP/HTTPS access and system clock, then re-run the command." ' +
      '} else={ ' +
        ':local f [/file find name=$arofiSetupPath]; ' +
        ':if ([:len $f] = 0) do={ :put "ERROR: AroFi setup file disappeared before reset. Router was NOT reset." } else={ ' +
          ':local sz [/file get $f size]; ' +
          ':if ($sz <= 0) do={ :put "ERROR: AroFi setup file is empty. Router was NOT reset."; /file remove $f } else={ ' +
            ':put "AroFi setup verified. Clearing previous RouterOS configuration and rebooting..."; ' +
            // Execute reset from a temporary system script so the terminal never
            // waits for the interactive reset confirmation. The reset itself
            // deletes this temporary script together with the previous config.
            ':if ($arofiSetupPath = "flash/arofi-setup.rsc") do={ ' +
              '/system script add name="arofi-reset-once" source=":delay 2s; /system reset-configuration skip-backup=yes run-after-reset=flash/arofi-setup.rsc"; ' +
            '} else={ ' +
              '/system script add name="arofi-reset-once" source=":delay 2s; /system reset-configuration skip-backup=yes run-after-reset=arofi-setup.rsc"; ' +
            '}; ' +
            '/system script run arofi-reset-once ' +
          '} ' +
        '} ' +
      '}'
    )
  }
'''


def patch(text: str) -> str:
    if SENTINEL in text:
        return text

    # This patch runs after apply_router_wan_port_support.py, so the selected
    # WAN argument and helpers must already exist. Refuse to mutate an unknown
    # source shape instead of silently damaging RouterOS provisioning.
    signature = "  buildOneRunCommand(registrationKey: string, wanInterface?: string | null) {\n"
    if signature not in text:
        raise RuntimeError("MikroTik reset-first patch: WAN-aware one-run method is missing")
    if "wanBootstrap +\n      dnsBootstrap +" not in text:
        raise RuntimeError("MikroTik reset-first patch: WAN bootstrap ordering is missing")
    if '/import file-name=\\"arofi-setup.rsc\\"' not in text and '/import file-name="arofi-setup.rsc"' not in text:
        raise RuntimeError("MikroTik reset-first patch: existing foreground import marker is missing")

    pattern = re.compile(
        r"  buildOneRunCommand\(registrationKey: string, wanInterface\?: string \| null\) \{.*?\n  \}\n(?=\n  // VPS-side tunnel gateway)",
        re.DOTALL,
    )
    text, count = pattern.subn(reset_first_method().rstrip("\n"), text, count=1)
    if count != 1:
        raise RuntimeError(f"MikroTik reset-first patch: expected one method, replaced {count}")

    # run-after-reset executes the same provisioning generator. Give RouterOS a
    # brief post-boot settle period before touching services/interfaces. This is
    # the only addition to the generated configuration sequence itself.
    fresh_start = "    const header = [\n"
    delayed_start = "    const header = [\n      `:delay 10s`,\n"
    if delayed_start not in text:
        text = replace_once(text, fresh_start, delayed_start, "post-reset settle delay")

    # Remove the staged .rsc after successful provisioning. Both paths are
    # attempted because RouterOS storage layout differs by hardware family.
    cleanup = (
        "        `:do { /file remove [find name=\\\"arofi-setup.rsc\\\"] } on-error={}`,\n"
        "        `:do { /file remove [find name=\\\"flash/arofi-setup.rsc\\\"] } on-error={}`,\n"
    )
    radius_success = '        `:put \\"AROFi RADIUS + portal wired to your existing HotSpot.\\"`,\n'
    if radius_success in text and cleanup not in text:
        text = text.replace(radius_success, cleanup + radius_success, 1)

    fresh_success = '      `:put \\"AROFi customer HotSpot is live. Broadcasting SSID: ${this.escape(ssid)}\\"`,\n'
    fresh_cleanup = cleanup.replace("        `", "      `")
    if fresh_success in text and fresh_cleanup not in text:
        text = text.replace(fresh_success, fresh_cleanup + fresh_success, 1)

    # Existing checklist said the WinBox session stays connected, which is no
    # longer true once reset-first onboarding is enabled. Keep operators from
    # interrupting a healthy reboot because the UI text is stale.
    old_check_1 = (
        "      `Make sure ${routerName} already has working internet (WAN) and that you can reach WinBox. "
        "This script does NOT set up your WAN or change your admin login.`,\n"
    )
    new_check_1 = (
        "      `Make sure ${routerName} has working internet and note its factory/default login before starting. "
        "AroFi will clear the previous RouterOS configuration and reboot once before installation.`,\n"
    )
    if old_check_1 in text:
        text = text.replace(old_check_1, new_check_1, 1)

    old_check_2 = (
        "      'Run the one-run command (or import the .rsc) from WinBox Terminal. "
        "Your management session stays connected the whole time.',\n"
    )
    new_check_2 = (
        "      'Run the one-run command from WinBox Terminal. Do not interrupt power: the router will reset, reboot, "
        "then continue AroFi installation automatically from the staged setup file.',\n"
    )
    if old_check_2 in text:
        text = text.replace(old_check_2, new_check_2, 1)

    required = (
        SENTINEL,
        "run-after-reset=flash/arofi-setup.rsc",
        "run-after-reset=arofi-setup.rsc",
        'skip-backup=yes',
        'Router was NOT reset.',
        '`:delay 10s`',
    )
    for marker in required:
        if marker not in text:
            raise RuntimeError(f"MikroTik reset-first validation missing: {marker}")

    # We intentionally do not use no-defaults=yes: model-specific defaults are
    # the compatibility bridge between the reset and the unchanged AroFi logic.
    method_match = re.search(
        r"  // AroFi reset-first onboarding:.*?\n  \}\n(?=\n  // VPS-side tunnel gateway)",
        text,
        re.DOTALL,
    )
    if not method_match or "no-defaults=yes" in method_match.group(0):
        raise RuntimeError("MikroTik reset-first flow must retain model-specific defaults")

    return text


def main() -> None:
    if not MIKROTIK.exists():
        raise RuntimeError(f"Required source file missing: {MIKROTIK.relative_to(ROOT)}")

    original = MIKROTIK.read_text(encoding="utf-8")
    updated = patch(original)
    if updated != original:
        MIKROTIK.write_text(updated, encoding="utf-8")

    print(
        "MikroTik reset-first onboarding applied: stage persistent setup, reset/reboot, "
        "run existing provisioning, then delete staged setup artifacts."
    )


if __name__ == "__main__":
    main()
