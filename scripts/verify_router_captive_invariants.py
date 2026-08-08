#!/usr/bin/env python3
"""Enforce the production MikroTik captive-portal contract.

This runs after every other build-time source patch. It is deliberately based on
semantic regular expressions rather than one large exact source block, so a
formatting or comment change cannot silently restore a slow/broken HotSpot.

The build is rejected unless all of these invariants are present:
- ordinary phones never perform blocking RADIUS MAC authentication;
- HotSpot clients receive only the MikroTik gateway as DNS;
- the tenant ``business.wifi`` name resolves locally with a short TTL;
- arofi.net is reachable before authentication so packages can load;
- active sessions are never removed by idle/keepalive timers;
- the HotSpot remains RADIUS-backed and has no bypass binding setup.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"


def replace_required(pattern: str, replacement: str, text: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, flags=re.MULTILINE)
    if count == 0:
        # An already-final source file is valid; only fail when neither the old
        # pattern nor the required replacement exists.
        if replacement not in text:
            raise RuntimeError(f"MikroTik captive invariant not found: {label}")
        return text
    return updated


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")

    # RouterOS MAC authentication makes every ordinary phone wait for a failed
    # RADIUS MAC request before the operating system receives a captive redirect.
    # Smart-TV access still works through the portal's explicit MAC credential.
    text = re.sub(
        r"login-by=[^\s`\"]+(?:\s+mac-auth-mode=mac-as-username-and-password)?",
        "login-by=cookie,http-pap",
        text,
    )
    text = text.replace(" mac-auth-mode=mac-as-username-and-password", "")

    # Do not advertise public resolvers directly to customers. Android/Windows
    # must ask 10.55.0.1 so RouterOS captive interception and business.wifi local
    # DNS behave consistently. The router itself still uses public upstream DNS.
    text = re.sub(
        r"dns-server=\$\{gatewayIp\}(?:,1\.1\.1\.1,8\.8\.8\.8|,8\.8\.8\.8,1\.1\.1\.1)",
        "dns-server=${gatewayIp}",
        text,
    )

    # Package time/expiry and CoA are the only valid session terminators. Screen
    # lock, radio power saving, or an idle phone must never remove a paid session.
    text = re.sub(
        r"add-mac-cookie=yes\s+mac-cookie-timeout=\S+"
        r"(?:\s+idle-timeout=\S+)?\s+keepalive-timeout=\S+",
        "add-mac-cookie=yes mac-cookie-timeout=365d idle-timeout=none keepalive-timeout=none",
        text,
    )

    # Resolve each generated tenant hostname locally and flush any stale cache
    # immediately. A short static TTL keeps business.wifi fast after changes.
    old_dns_add = (
        '`/ip dns static add name="${this.escape(input.dnsName)}" '
        'address=${gatewayIp} comment="AROFi hotspot DNS gateway"`,'
    )
    new_dns_add = (
        '`/ip dns static add name="${this.escape(input.dnsName)}" '
        'address=${gatewayIp} ttl=1m comment="AROFi hotspot DNS gateway"`,\n'
        '        `:do { /ip dns cache flush } on-error={}`,'
    )
    if new_dns_add not in text:
        if old_dns_add not in text:
            raise RuntimeError("Tenant business.wifi static DNS generator is missing")
        text = text.replace(old_dns_add, new_dns_add, 1)

    # The local login page calls the public API before the user is authenticated.
    # Always create this core rule independently from optional saved host lists.
    if 'comment=\\"AROFi core portal\\"' not in text:
        marker = "      ...this.buildWalledGarden(input.portalHosts ?? []),\n"
        if marker not in text:
            raise RuntimeError("HotSpot walled-garden insertion marker is missing")
        core_rules = (
            marker
            + '      `/ip hotspot walled-garden remove [find comment=\\"AROFi core portal\\"]`,\n'
            + '      `/ip hotspot walled-garden add dst-host=\\"arofi.net\\" action=allow comment=\\"AROFi core portal\\"`,\n'
        )
        text = text.replace(marker, core_rules, 1)

    TARGET.write_text(text, encoding="utf-8")

    final = TARGET.read_text(encoding="utf-8")
    required = {
        "fast phone login modes": "login-by=cookie,http-pap",
        "gateway-only customer DNS": "dns-server=${gatewayIp}`",
        "short local tenant DNS TTL": "address=${gatewayIp} ttl=1m comment=\"AROFi hotspot DNS gateway\"",
        "DNS cache flush": "/ip dns cache flush",
        "pre-auth package API": 'dst-host=\\"arofi.net\\" action=allow comment=\\"AROFi core portal\\"',
        "permanent paid session": "mac-cookie-timeout=365d idle-timeout=none keepalive-timeout=none",
        "RADIUS authentication": "use-radius=yes radius-accounting=yes",
        "bypass removal": "/ip hotspot ip-binding remove [find type=bypassed]",
    }
    missing = [label for label, marker in required.items() if marker not in final]
    forbidden = {
        "blocking MAC login": "login-by=mac",
        "MAC auth mode": "mac-auth-mode=mac-as-username-and-password",
        "public DNS advertised to clients": "dns-server=${gatewayIp},1.1.1.1,8.8.8.8",
    }
    present_forbidden = [label for label, marker in forbidden.items() if marker in final]

    if missing or present_forbidden:
        details = []
        if missing:
            details.append("missing: " + ", ".join(missing))
        if present_forbidden:
            details.append("forbidden: " + ", ".join(present_forbidden))
        raise RuntimeError("MikroTik captive portal build rejected (" + "; ".join(details) + ")")

    print(
        "MikroTik captive invariants verified: instant redirect, local business.wifi DNS, "
        "pre-auth packages, and no idle/keepalive logout."
    )


if __name__ == "__main__":
    main()
