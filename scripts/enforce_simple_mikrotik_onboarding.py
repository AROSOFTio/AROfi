#!/usr/bin/env python3
"""Enforce the production MikroTik onboarding command contract.

The final operator-facing command must stay compatible with RouterOS 6 and 7,
use one HTTPS download, import in the foreground, preserve selected-WAN setup,
and never reintroduce retry loops or artificial 20-second cooldowns.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"


def main() -> None:
    if not MIKROTIK.exists():
        raise RuntimeError("MikroTik service source is missing")

    text = MIKROTIK.read_text(encoding="utf-8")

    pattern = re.compile(
        r"  buildOneRunCommand\(registrationKey: string, wanInterface\?: string \| null\) \{.*?\n"
        r"  \}\n\n  // VPS-side tunnel gateway addresses",
        flags=re.S,
    )

    replacement = r'''  buildOneRunCommand(registrationKey: string, wanInterface?: string | null) {
    const resolvedBase = this.resolveApiBaseUrl()
    const httpsBase = resolvedBase.startsWith('http://')
      ? 'https://' + resolvedBase.slice(7)
      : resolvedBase
    const url = `${httpsBase}/api/mikrotik/script/${this.escape(registrationKey)}`
    const requestedWanInterface = this.normalizeWanInterface(wanInterface)
    const wanBootstrap = this.buildSelectedWanBootstrap(requestedWanInterface)
    const bootstrap =
      ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; ' +
      ':do { :local n [:parse "/system ntp client set enabled=yes servers=pool.ntp.org"]; $n } ' +
      'on-error={ :do { :local n [:parse "/system ntp client set enabled=yes primary-ntp=162.159.200.1"]; $n } on-error={} }; ' +
      ':delay 2s; '

    return (
      wanBootstrap +
      bootstrap +
      ':do { /file remove [find name="arofi-setup.rsc"] } on-error={}; ' +
      `/tool fetch url="${url}" check-certificate=no dst-path="arofi-setup.rsc"; ` +
      ':local arofiFile [/file find name="arofi-setup.rsc"]; ' +
      ':if ([:len $arofiFile] = 0) do={ :error "AROFi: setup file was not created." }; ' +
      ':if ([/file get $arofiFile size] = 0) do={ /file remove $arofiFile; :error "AROFi: setup file is empty." }; ' +
      ':put "AROFi setup downloaded. Installing..."; ' +
      '/import file-name="arofi-setup.rsc"; ' +
      ':delay 1s; ' +
      '/file remove $arofiFile; ' +
      ':put "AROFi setup installed."'
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
        r"  buildOneRunCommand\(registrationKey: string, wanInterface\?: string \| null\) \{(.*?)\n"
        r"  \}\n\n  // VPS-side tunnel gateway addresses",
        updated,
        flags=re.S,
    )
    if not method_match:
        raise RuntimeError("Single-fetch onboarding method is missing after normalization")

    method = method_match.group(1)
    if method.count('/tool fetch') != 1:
        raise RuntimeError(
            f"Onboarding command must contain exactly one /tool fetch, found {method.count('/tool fetch')}."
        )

    forbidden = (
        ':while',
        'Retrying...',
        'waiting 20 seconds',
        ':delay 20s',
        'fallbackUrl',
        'arofiOk',
        'attempts',
        'http://arofi.net',
    )
    for marker in forbidden:
        if marker in method:
            raise RuntimeError(f"Forbidden onboarding retry/cooldown/insecure marker remains: {marker}")

    required = (
        'wanBootstrap +',
        "resolvedBase.startsWith('http://')",
        "'https://' + resolvedBase.slice(7)",
        '/ip dns set servers=8.8.8.8,1.1.1.1',
        '[:parse "/system ntp client set enabled=yes servers=pool.ntp.org"]',
        '[:parse "/system ntp client set enabled=yes primary-ntp=162.159.200.1"]',
        '/tool fetch url=',
        'check-certificate=no',
        '/import file-name="arofi-setup.rsc"',
        '/file remove $arofiFile',
    )
    for marker in required:
        if marker not in method:
            raise RuntimeError(f"Single-fetch RouterOS 6/7 onboarding marker missing: {marker}")

    MIKROTIK.write_text(updated, encoding="utf-8")
    print(
        "MikroTik onboarding verified: RouterOS 6/7 bootstrap, one HTTPS fetch, "
        "foreground import, no retry loop and no 20-second cooldown."
    )


if __name__ == "__main__":
    main()
