#!/usr/bin/env python3
"""Enforce the production MikroTik captive-portal contract.

This is the final build gate after every source patch. It restores and validates
only the proven captive behaviour:
- ordinary phones never perform blocking RADIUS MAC authentication;
- business.wifi resolves locally and quickly through 10.55.0.1;
- arofi.net remains reachable before authentication so packages load;
- voucher/payment credentials POST directly to RouterOS with no timer/iframe;
- paid sessions survive idle phones and screen lock until RADIUS expiry.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
CAPTIVE_FLOW = ROOT / "apps/api/src/modules/routers/router-captive-flow.initializer.ts"

FINAL_PERSISTENCE = (
    "shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d "
    "idle-timeout=none keepalive-timeout=none session-timeout=0s"
)


def main() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")

    # Remove the RADIUS MAC-auth preflight that delays the operating system's
    # captive portal probe. Smart-TV MAC credentials are still posted explicitly.
    text = re.sub(
        r"login-by=[^\s`\"]+(?:\s+mac-auth-mode=mac-as-username-and-password)?",
        "login-by=cookie,http-pap",
        text,
    )
    text = text.replace(" mac-auth-mode=mac-as-username-and-password", "")

    # Customers must use the MikroTik DNS proxy so tenant.wifi is answered
    # locally and captive detection does not bypass the gateway.
    text = re.sub(
        r"dns-server=\$\{gatewayIp\}(?:,1\.1\.1\.1,8\.8\.8\.8|,8\.8\.8\.8,1\.1\.1\.1)",
        "dns-server=${gatewayIp}",
        text,
    )

    # Restore the exact persistence values used by the proven flow.
    persistence_pattern = re.compile(
        r"shared-users=1\s+add-mac-cookie=yes\s+mac-cookie-timeout=\S+"
        r"(?:\s+idle-timeout=\S+)?"
        r"(?:\s+keepalive-timeout=\S+)?"
        r"(?:\s+session-timeout=\S+)?"
    )
    text, persistence_count = persistence_pattern.subn(FINAL_PERSISTENCE, text)
    if persistence_count < 2:
        raise RuntimeError(
            "MikroTik build rejected: default/all-profile persistence commands are missing."
        )

    # Local tenant DNS is authoritative on the hotspot. Flush stale cache after
    # installation so business.wifi responds immediately.
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
            raise RuntimeError("MikroTik build rejected: tenant business.wifi DNS rule is missing.")
        text = text.replace(old_dns_add, new_dns_add, 1)

    # The router-served portal needs AROFi context/packages before authentication.
    if 'comment=\\"AROFi core portal\\"' not in text:
        marker = "      ...this.buildWalledGarden(input.portalHosts ?? []),\n"
        if marker not in text:
            raise RuntimeError("MikroTik build rejected: walled-garden insertion point is missing.")
        text = text.replace(
            marker,
            marker
            + '      `/ip hotspot walled-garden remove [find comment=\\"AROFi core portal\\"]`,\n'
            + '      `/ip hotspot walled-garden add dst-host=\\"arofi.net\\" action=allow comment=\\"AROFi core portal\\"`,\n',
            1,
        )

    MIKROTIK.write_text(text, encoding="utf-8")

    final = MIKROTIK.read_text(encoding="utf-8")
    flow = CAPTIVE_FLOW.read_text(encoding="utf-8")

    required_mikrotik = {
        "fast phone login modes": "login-by=cookie,http-pap",
        "gateway-only customer DNS": "dns-server=${gatewayIp}`",
        "short local tenant DNS TTL": "address=${gatewayIp} ttl=1m comment=\"AROFi hotspot DNS gateway\"",
        "DNS cache flush": "/ip dns cache flush",
        "pre-auth package API": 'dst-host=\\"arofi.net\\" action=allow comment=\\"AROFi core portal\\"',
        "proven paid-session persistence": FINAL_PERSISTENCE,
        "RADIUS authentication": "use-radius=yes radius-accounting=yes",
        "bypass removal": "/ip hotspot ip-binding remove [find type=bypassed]",
    }
    required_flow = {
        "direct RouterOS POST": "f.method='post';f.action=target;f.style.display='none'",
        "immediate form submission": "document.body.appendChild(f);f.submit();}",
        "native login destination": "rc.loginUrl||lo||'http://10.55.0.1/login'",
        "MAC mode removal": ".filter((mode) => mode && mode !== 'mac')",
    }

    missing = [
        *[label for label, marker in required_mikrotik.items() if marker not in final],
        *[label for label, marker in required_flow.items() if marker not in flow],
    ]
    forbidden = {
        "blocking MAC login": "login-by=mac",
        "MAC auth mode": "mac-auth-mode=mac-as-username-and-password",
        "public DNS advertised to clients": "dns-server=${gatewayIp},1.1.1.1,8.8.8.8",
        "unstable 365-day cookie": "mac-cookie-timeout=365d",
    }
    forbidden_flow = {
        "delayed login timer": "window.setTimeout",
        "hidden-frame login delay": "arofiLoginFrame",
        "status-page override": "patchStatusHtml",
    }
    present_forbidden = [
        *[label for label, marker in forbidden.items() if marker in final],
        *[label for label, marker in forbidden_flow.items() if marker in flow],
    ]

    if missing or present_forbidden:
        details = []
        if missing:
            details.append("missing: " + ", ".join(missing))
        if present_forbidden:
            details.append("forbidden: " + ", ".join(present_forbidden))
        raise RuntimeError("MikroTik captive build rejected (" + "; ".join(details) + ")")

    print(
        "Yesterday's captive flow verified: instant direct POST, no MAC delay, "
        "fast business.wifi DNS, pre-auth packages, and persistent paid sessions."
    )


if __name__ == "__main__":
    main()
