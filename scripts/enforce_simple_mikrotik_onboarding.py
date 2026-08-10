#!/usr/bin/env python3
"""Restore the production MikroTik onboarding command to one direct fetch.

This script runs late in the Docker source-patch pipeline, after WAN support has
been added. It deliberately changes only ``buildOneRunCommand`` and preserves
the selected-WAN bootstrap. The operator-facing onboarding command must not use
retry loops, HTTP/HTTPS retry rounds, or artificial 20-second cooldowns.
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
    const url = `${this.resolveApiBaseUrl()}/api/mikrotik/script/${this.escape(registrationKey)}`
    const requestedWanInterface = this.normalizeWanInterface(wanInterface)
    const wanBootstrap = this.buildSelectedWanBootstrap(requestedWanInterface)
    const dnsBootstrap =
      ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; '

    return (
      wanBootstrap +
      dnsBootstrap +
      ':do { /file remove [find name="arofi-setup.rsc"] } on-error={}; ' +
      `/tool fetch url="${url}" check-certificate=no dst-path="arofi-setup.rsc"; ` +
      '/import file-name="arofi-setup.rsc"; ' +
      '/file remove "arofi-setup.rsc"'
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
    )
    for marker in forbidden:
        if marker in method:
            raise RuntimeError(f"Forbidden onboarding retry/cooldown marker remains: {marker}")

    required = (
        'wanBootstrap +',
        'dnsBootstrap +',
        '/tool fetch url=',
        '/import file-name="arofi-setup.rsc"',
        '/file remove "arofi-setup.rsc"',
    )
    for marker in required:
        if marker not in method:
            raise RuntimeError(f"Single-fetch onboarding marker missing: {marker}")

    MIKROTIK.write_text(updated, encoding="utf-8")
    print("MikroTik onboarding normalized to one direct fetch with no retry loop or cooldown.")


if __name__ == "__main__":
    main()
