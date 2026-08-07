#!/usr/bin/env python3
"""Keep MikroTik onboarding literal, safe, and router-gateway compatible.

This guarded build patch normalizes the copied one-run command, preserves an
owner management path, avoids built-in firewall row moves, and prevents local
*.wifi names from becoming required DNS dependencies during voucher login.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"
ROUTERS = ROOT / "apps/api/src/modules/routers/routers.service.ts"
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
MIKROTIK_SPEC = ROOT / "apps/api/src/modules/routers/mikrotik.service.spec.ts"
PORTAL = ROOT / "apps/portal-web/src/components/PortalCheckout.tsx"
QR_CONNECT = ROOT / "apps/portal-web/src/components/VoucherQrConnect.tsx"
ROUTER_GATEWAY = "10.55.0.1"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one target, found {count}")
    return text.replace(old, new, 1)


def replace_exact_count(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count == 0 and text.count(new) == expected:
        return text
    if count != expected:
        raise RuntimeError(f"{label}: expected {expected} targets, found {count}")
    return text.replace(old, new)


def patch_admin(text: str) -> str:
    if "function normalizeRouterOsCommand(value: string)" not in text:
        marker = """function parseHosts(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

"""
        helper = marker + r"""function normalizeRouterOsCommand(value: string) {
  return value
    // Rich-text editors sometimes turn a literal URL into [url](url). RouterOS
    // needs only the URL inside the quotes.
    .replace(/\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/gi, '$2')
    // Remove accidental escaping added by chat/rich-text copies, e.g. \:if.
    .replace(/\\:/g, ':')
    // Invisible formatting characters can make an otherwise correct command fail.
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
}

"""
        text = replace_once(text, marker, helper, "RouterOS command normalizer")

    old_function = """  function oneRunCommand() {
    if (!selectedSetup) return ''
    const registrationKey = selectedSetup.router.registrationKey
    return selectedSetup.oneRunCommand ?? (registrationKey ? buildSetupFallbackCommand(registrationKey) : '')
  }
"""
    new_function = """  function oneRunCommand() {
    if (!selectedSetup) return ''
    const registrationKey = selectedSetup.router.registrationKey
    const command = selectedSetup.oneRunCommand
      ?? (registrationKey ? buildSetupFallbackCommand(registrationKey) : '')
    return normalizeRouterOsCommand(command)
  }
"""

    if "return normalizeRouterOsCommand(command)" not in text:
        text = replace_once(text, old_function, new_function, "one-run command normalization")

    for sentinel in [
        "function normalizeRouterOsCommand(value: string)",
        r".replace(/\\:/g, ':')",
        "return normalizeRouterOsCommand(command)",
    ]:
        if sentinel not in text:
            raise RuntimeError(f"MikroTik command sanitizer missing sentinel: {sentinel}")
    return text


def patch_routers_service(text: str) -> str:
    text = replace_exact_count(
        text,
        "        portalBaseUrl: this.buildTenantWifiLoginUrl(router.tenant),",
        f"        portalBaseUrl: 'http://{ROUTER_GATEWAY}/login',",
        2,
        "numeric router portal URL",
    )
    text = replace_exact_count(
        text,
        "        dnsName: this.buildTenantWifiHost(router.tenant),",
        "        dnsName: null,",
        2,
        "disable tenant-local hotspot DNS name",
    )

    if text.count(f"portalBaseUrl: 'http://{ROUTER_GATEWAY}/login'") != 2:
        raise RuntimeError("Router provisioning is not using the numeric gateway login URL twice")
    if text.count("dnsName: null") != 2:
        raise RuntimeError("Router provisioning did not disable both tenant-local DNS names")
    return text


def patch_mikrotik_service(text: str) -> str:
    old_route_selector = (
        '      `:foreach r in=[/ip route find dst-address=0.0.0.0/0 active=yes] do={`,'
    )
    new_route_selector = (
        '      `:foreach r in=[/ip route find dst-address="0.0.0.0/0" active=yes] do={`,'
    )
    if old_route_selector in text:
        text = replace_once(text, old_route_selector, new_route_selector, "quoted default-route selector")

    old_wired_block = """      `# 3d-2. Put wired LAN ports on the captive hotspot bridge too`,
      `# Excludes the detected WAN and ether1 so upstream internet stays intact.`,
      `:foreach e in=[/interface ethernet find] do={`,
      `  :local ethName [/interface ethernet get $e name]`,
      `  :if ($ethName != "" && $ethName != "ether1" && $ethName != $wanIface && $ethName != "${this.escape(remoteClientName)}") do={`,
      `    :if ([:len [/interface bridge port find interface=$ethName]]=0) do={ /interface bridge port add bridge=arofi-hotspot interface=$ethName } else={ /interface bridge port set [find interface=$ethName] bridge=arofi-hotspot }`,
      `  }`,
      `}`,
"""
    new_wired_block = """      `# 3d-2. Preserve owner management while assigning unused wired ports`,
      `# ether2 and every currently running Ethernet link stay on the existing management bridge.`,
      `:foreach e in=[/interface ethernet find] do={`,
      `  :local ethName [/interface ethernet get $e name]`,
      `  :local ethRunning [/interface ethernet get $e running]`,
      `  :if ($ethName != "" && $ethName != "ether1" && $ethName != "ether2" && $ethName != $wanIface && $ethName != "${this.escape(remoteClientName)}" && ($ethRunning = false)) do={`,
      `    :local ethBridgePort [/interface bridge port find interface=$ethName]`,
      `    :if ([:len $ethBridgePort]=0) do={ /interface bridge port add bridge=arofi-hotspot interface=$ethName } else={ /interface bridge port set $ethBridgePort bridge=arofi-hotspot }`,
      `  } else={`,
      `    :if ($ethName != "" && $ethName != "ether1" && $ethName != $wanIface && $ethName != "${this.escape(remoteClientName)}") do={ :put ("AROFi: preserving management/link-active port " . $ethName) }`,
      `  }`,
      `}`,
"""
    if "# 3d-2. Preserve owner management while assigning unused wired ports" not in text:
        text = replace_once(text, old_wired_block, new_wired_block, "safe wired-port assignment")

    firewall_moves = [
        (
            '      `  :foreach r in=[/ip firewall filter find comment="AROFi WAN mgmt block"] do={ /ip firewall filter move $r destination=0 }`,',
            '''      `  :local arofiWanMgmtAnchor [/ip firewall filter find chain=input dynamic=no]`,
      `  :if ([:len $arofiWanMgmtAnchor] > 0) do={ :set arofiWanMgmtAnchor [:pick $arofiWanMgmtAnchor 0]; :foreach r in=[/ip firewall filter find comment="AROFi WAN mgmt block"] do={ :do { /ip firewall filter move $r destination=$arofiWanMgmtAnchor } on-error={} } }`,''',
            "WAN management firewall ordering",
        ),
        (
            '      `:foreach r in=[/ip firewall filter find comment="AROFi hotspot input"] do={ /ip firewall filter move $r destination=0 }`,',
            '''      `:local arofiHotspotInputAnchor [/ip firewall filter find chain=input dynamic=no]`,
      `:if ([:len $arofiHotspotInputAnchor] > 0) do={ :set arofiHotspotInputAnchor [:pick $arofiHotspotInputAnchor 0]; :foreach r in=[/ip firewall filter find comment="AROFi hotspot input"] do={ :do { /ip firewall filter move $r destination=$arofiHotspotInputAnchor } on-error={} } }`,''',
            "hotspot input firewall ordering",
        ),
        (
            '      `:foreach r in=[/ip firewall filter find comment="AROFi hotspot mgmt block"] do={ /ip firewall filter move $r destination=0 }`,',
            '''      `:local arofiHotspotMgmtAnchor [/ip firewall filter find chain=input dynamic=no]`,
      `:if ([:len $arofiHotspotMgmtAnchor] > 0) do={ :set arofiHotspotMgmtAnchor [:pick $arofiHotspotMgmtAnchor 0]; :foreach r in=[/ip firewall filter find comment="AROFi hotspot mgmt block"] do={ :do { /ip firewall filter move $r destination=$arofiHotspotMgmtAnchor } on-error={} } }`,''',
            "hotspot management firewall ordering",
        ),
        (
            '      `:foreach r in=[/ip firewall filter find comment="AROFi hotspot forward"] do={ /ip firewall filter move $r destination=0 }`,',
            '''      `:local arofiHotspotForwardAnchor [/ip firewall filter find chain=forward dynamic=no]`,
      `:if ([:len $arofiHotspotForwardAnchor] > 0) do={ :set arofiHotspotForwardAnchor [:pick $arofiHotspotForwardAnchor 0]; :foreach r in=[/ip firewall filter find comment="AROFi hotspot forward"] do={ :do { /ip firewall filter move $r destination=$arofiHotspotForwardAnchor } on-error={} } }`,''',
            "hotspot forwarding firewall ordering",
        ),
    ]
    for old, new, label in firewall_moves:
        if old in text:
            text = replace_once(text, old, new, label)

    dns_marker = "      // keepalive-timeout=2m (MikroTik's own default) force-disconnected\n"
    dns_guard = f'''      `# Use the numeric hotspot gateway for login/status so Android private DNS cannot break vouchers`,
      `:do {{ /ip hotspot profile set [find name="${{profileName}}"] dns-name="" hotspot-address=${{gatewayIp}} }} on-error={{}}`,
      `:do {{ /ip dns static remove [find comment="AROFi hotspot DNS gateway"] }} on-error={{}}`,
'''
    if "Android private DNS cannot break vouchers" not in text:
        text = replace_once(text, dns_marker, dns_guard + dns_marker, "numeric hotspot gateway profile")

    old_conn_target = "var target=(rc.loginUrl||lo||'http://10.55.0.1/login');"
    new_conn_target = "var target='http://10.55.0.1/login';"
    if old_conn_target in text:
        text = replace_once(text, old_conn_target, new_conn_target, "router-hosted voucher login target")

    required = [
        'dst-address="0.0.0.0/0" active=yes',
        "# 3d-2. Preserve owner management while assigning unused wired ports",
        '$ethName != "ether2"',
        "$ethRunning = false",
        "destination=$arofiWanMgmtAnchor",
        "destination=$arofiHotspotInputAnchor",
        "destination=$arofiHotspotMgmtAnchor",
        "destination=$arofiHotspotForwardAnchor",
        "Android private DNS cannot break vouchers",
        'dns-name="" hotspot-address=${gatewayIp}',
        "var target='http://10.55.0.1/login';",
    ]
    for sentinel in required:
        if sentinel not in text:
            raise RuntimeError(f"MikroTik provisioning safety sentinel missing: {sentinel}")

    forbidden = [
        "dst-address=0.0.0.0/0 active=yes",
        "# 3d-2. Put wired LAN ports on the captive hotspot bridge too",
        "/ip firewall filter move $r destination=0",
        old_conn_target,
    ]
    for unsafe in forbidden:
        if unsafe in text:
            raise RuntimeError(f"Unsafe MikroTik provisioning pattern remains: {unsafe}")
    return text


def patch_portal(text: str) -> str:
    old_target = "      const target = new URL(loginUrl, window.location.href)\n"
    new_target = """      const target = new URL(loginUrl, window.location.href)
      // RouterOS may return a tenant-local *.wifi login URL. Public/private DNS
      // resolvers cannot be trusted to resolve that name, so dedicated AROFi
      // hotspot profiles always submit through their numeric gateway instead.
      if (/\\.wifi$/i.test(target.hostname)) {
        target.protocol = 'http:'
        target.hostname = '10.55.0.1'
        target.port = ''
      }
"""
    if "if (/\\.wifi$/i.test(target.hostname))" not in text:
        text = replace_once(text, old_target, new_target, "hosted portal numeric login fallback")

    for sentinel in [
        "if (/\\.wifi$/i.test(target.hostname))",
        "target.hostname = '10.55.0.1'",
    ]:
        if sentinel not in text:
            raise RuntimeError(f"Portal voucher reconnect safety marker missing: {sentinel}")
    return text


def patch_mikrotik_spec(text: str) -> str:
    old_route_expectation = (
        "    expect(script).toContain(':foreach r in=[/ip route find "
        "dst-address=0.0.0.0/0 active=yes]')\n"
    )
    new_route_expectation = (
        "    expect(script).toContain(':foreach r in=[/ip route find "
        'dst-address="0.0.0.0/0" active=yes]\')\n'
    )
    if old_route_expectation in text:
        text = replace_once(text, old_route_expectation, new_route_expectation, "quoted route selector test")

    old_port_expectation = """    expect(script).toContain('/interface ethernet find')
    expect(script).toContain('$ethName != "ether1"')
"""
    new_port_expectation = """    expect(script).toContain('/interface ethernet find')
    expect(script).toContain('$ethName != "ether1"')
    expect(script).toContain('$ethName != "ether2"')
    expect(script).toContain('$ethRunning = false')
    expect(script).toContain('destination=$arofiWanMgmtAnchor')
    expect(script).toContain('destination=$arofiHotspotInputAnchor')
    expect(script).toContain('destination=$arofiHotspotMgmtAnchor')
    expect(script).toContain('destination=$arofiHotspotForwardAnchor')
    expect(script).not.toContain('/ip firewall filter move $r destination=0')
"""
    if "expect(script).toContain('$ethRunning = false')" not in text:
        text = replace_once(text, old_port_expectation, new_port_expectation, "wired management and firewall safety tests")

    dns_test_marker = "    expect(script).toContain('/ip dns static add name=\"tenantname.wifi\" address=10.55.0.1')\n"
    dns_test_new = dns_test_marker + "    expect(script).toContain('dns-name=\"\" hotspot-address=10.55.0.1')\n"
    if "dns-name=\"\" hotspot-address=10.55.0.1" not in text:
        text = replace_once(text, dns_test_marker, dns_test_new, "numeric hotspot profile test")

    for sentinel in [
        'dst-address="0.0.0.0/0" active=yes',
        "expect(script).toContain('$ethName != \"ether2\"')",
        "expect(script).toContain('$ethRunning = false')",
        "expect(script).not.toContain('/ip firewall filter move $r destination=0')",
        "dns-name=\"\" hotspot-address=10.55.0.1",
    ]:
        if sentinel not in text:
            raise RuntimeError(f"MikroTik service test sentinel missing: {sentinel}")
    return text


def verify_qr_connect(text: str) -> str:
    required = [
        "const ROUTER_GATEWAY = '10.55.0.1'",
        "new URL(`http://${ROUTER_GATEWAY}/login`)",
        "intent://${ROUTER_GATEWAY}/login?voucher=",
    ]
    for sentinel in required:
        if sentinel not in text:
            raise RuntimeError(f"Voucher QR connector missing numeric gateway marker: {sentinel}")
    if "sanitizeHotspotHost" in text:
        raise RuntimeError("Voucher QR connector still accepts a tenant-local DNS hostname")
    return text


def main() -> None:
    files = {
        ADMIN: patch_admin,
        ROUTERS: patch_routers_service,
        MIKROTIK: patch_mikrotik_service,
        PORTAL: patch_portal,
        MIKROTIK_SPEC: patch_mikrotik_spec,
        QR_CONNECT: verify_qr_connect,
    }

    for path, patcher in files.items():
        if not path.exists():
            raise RuntimeError(f"Required source file missing: {path.relative_to(ROOT)}")
        original = path.read_text(encoding="utf-8")
        updated = patcher(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")

    print("MikroTik command, management, and voucher gateway safety fixes applied.")


if __name__ == "__main__":
    main()
