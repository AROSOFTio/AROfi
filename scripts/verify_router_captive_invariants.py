#!/usr/bin/env python3
"""Enforce the production MikroTik captive-portal contract.

This is the final build gate after every source patch. It restores and validates:
- ordinary phones never perform blocking RADIUS ``login-by=mac`` authentication;
- successful devices receive a trusted ``mac-cookie`` for automatic return;
- business.wifi resolves locally and quickly through 10.55.0.1;
- arofi.net remains reachable before authentication so packages load;
- voucher/payment/reconnect credentials POST directly to RouterOS;
- active bundles survive idle phones, screen lock and temporary accounting gaps.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
CAPTIVE_FLOW = ROOT / "apps/api/src/modules/routers/router-captive-flow.initializer.ts"

FINAL_LOGIN_BY = "login-by=cookie,mac-cookie,http-pap"
FINAL_PERSISTENCE = (
    "shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d "
    "idle-timeout=none keepalive-timeout=none session-timeout=0s"
)


def main() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")

    # Remove blocking automatic RADIUS MAC authentication. mac-cookie is safe:
    # RouterOS creates it only after a successful explicit login and uses it to
    # restore that same device while its package remains valid.
    text = re.sub(
        r"login-by=[^\s`\"]+(?:\s+mac-auth-mode=mac-as-username-and-password)?",
        FINAL_LOGIN_BY,
        text,
    )
    text = text.replace(" mac-auth-mode=mac-as-username-and-password", "")
    text = text.replace(
        f"{FINAL_LOGIN_BY} split-user-domain=",
        f"{FINAL_LOGIN_BY} http-cookie-lifetime=30d split-user-domain=",
    )

    # Customers must use the MikroTik DNS proxy so tenant.wifi is answered
    # locally and captive detection does not bypass the gateway.
    text = re.sub(
        r"dns-server=\$\{gatewayIp\}(?:,1\.1\.1\.1,8\.8\.8\.8|,8\.8\.8\.8,1\.1\.1\.1)",
        "dns-server=${gatewayIp}",
        text,
    )

    # Remove every local inactivity/reachability logout timer. RADIUS expiry,
    # quota exhaustion and explicit revocation remain authoritative.
    persistence_pattern = re.compile(
        r"shared-users=1\s+add-mac-cookie=yes\s+mac-cookie-timeout=[^\s`,]+"
        r"(?:\s+idle-timeout=[^\s`,]+)?"
        r"(?:\s+keepalive-timeout=[^\s`,]+)?"
        r"(?:\s+session-timeout=[^\s`,]+)?"
        r"(?=[^`\r\n]*`)"
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
    if "AROFi core portal" not in text:
        marker = "      ...this.buildWalledGarden(input.portalHosts ?? []),\n"
        if marker not in text:
            raise RuntimeError("MikroTik build rejected: walled-garden insertion point is missing.")
        text = text.replace(
            marker,
            marker
            + '      `/ip hotspot walled-garden remove [find comment="AROFi core portal"]`,\n'
            + '      `/ip hotspot walled-garden add dst-host="arofi.net" action=allow comment="AROFi core portal"`,\n',
            1,
        )

    MIKROTIK.write_text(text, encoding="utf-8")

    final = MIKROTIK.read_text(encoding="utf-8")
    flow = CAPTIVE_FLOW.read_text(encoding="utf-8")

    required_mikrotik = {
        "trusted returning-device login modes": FINAL_LOGIN_BY,
        "trusted cookie lifetime": "http-cookie-lifetime=30d",
        "gateway-only customer DNS": "dns-server=${gatewayIp}",
        "short local tenant DNS TTL": "address=${gatewayIp} ttl=1m comment=\"AROFi hotspot DNS gateway\"",
        "DNS cache flush": "/ip dns cache flush",
        "pre-auth package API host": "AROFi core portal",
        "pre-auth package API domain": 'dst-host="arofi.net"',
        "permanent paid-session persistence": FINAL_PERSISTENCE,
        "RADIUS authentication": "use-radius=yes radius-accounting=yes",
        "bypass removal": "/ip hotspot ip-binding remove [find type=bypassed]",
    }
    required_flow = {
        "permanent session policy marker": "permanent active-bundle and returning-device policy",
        "self-healing session policy": "arofi-session-policy",
        "trusted mac-cookie mode": "login-by=cookie,mac-cookie,http-pap",
        "returning activation auto reconnect": "var autoReady=d.returningDevice&&d.returningDevice.existingActiveAccess&&d.returningDevice.reconnect;",
        "short redirect loop guard": "(Date.now()-_lastAuto)<2500",
        "direct RouterOS POST": "f.method='post';f.action=target;f.style.display='none'",
        "native login destination": "rc.loginUrl||lo||'http://10.55.0.1/login'",
        "no idle/keepalive logout": "idle-timeout=none keepalive-timeout=none session-timeout=0s",
    }

    missing = [
        *[label for label, marker in required_mikrotik.items() if marker not in final],
        *[label for label, marker in required_flow.items() if marker not in flow],
    ]

    # The stable 713e3f7 flow intentionally hides the document synchronously
    # between appending the native form and submitting it. That is still an
    # immediate top-level POST: there is no timer, iframe, promise or redirect
    # between appendChild() and submit(). The old literal check required those
    # calls to be adjacent and falsely rejected the exact stable router source.
    immediate_submit = re.search(
        r"document\.body\.appendChild\(f\);\s*"
        r"(?:document\.documentElement\.style\.visibility\s*=\s*['\"]hidden['\"];\s*)?"
        r"f\.submit\(\);\s*}",
        flow,
    )
    if not immediate_submit:
        missing.append("immediate form submission")

    login_values = re.findall(r"login-by=([^\s`\"']+)", final)
    blocking_mac_values = [
        value
        for value in login_values
        if "mac" in {part.strip().lower() for part in value.split(",")}
    ]

    present_forbidden: list[str] = []
    if blocking_mac_values:
        present_forbidden.append(
            "blocking automatic RADIUS MAC login: " + ", ".join(blocking_mac_values)
        )
    if re.search(r"mac-auth-mode\s*=", final, flags=re.IGNORECASE):
        present_forbidden.append("MAC auth mode")

    forbidden_markers = {
        "public DNS advertised directly to clients": "dns-server=${gatewayIp},1.1.1.1,8.8.8.8",
        "finite idle logout": "idle-timeout=31d",
        "finite keepalive logout": "keepalive-timeout=30d",
        "unstable 365-day cookie": "mac-cookie-timeout=365d",
    }
    forbidden_flow = {
        "delayed login timer": "window.setTimeout",
        "hidden-frame login delay": "arofiLoginFrame",
        "status-page override": "patchStatusHtml",
    }
    present_forbidden.extend(
        label for label, marker in forbidden_markers.items() if marker in final
    )
    present_forbidden.extend(
        label for label, marker in forbidden_flow.items() if marker in flow
    )

    if missing or present_forbidden:
        details = []
        if missing:
            details.append("missing: " + ", ".join(missing))
        if present_forbidden:
            details.append("forbidden: " + ", ".join(present_forbidden))
        raise RuntimeError("MikroTik captive build rejected (" + "; ".join(details) + ")")

    print(
        "Captive flow verified: no blocking MAC auth, trusted mac-cookie return, "
        "instant direct POST, fast local DNS, and no local active-bundle logout timers."
    )


if __name__ == "__main__":
    main()
