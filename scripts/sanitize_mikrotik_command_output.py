#!/usr/bin/env python3
"""Keep MikroTik onboarding output literal, safe, and RouterOS-compatible.

The RouterOS command must never contain rich-text Markdown links or escaped
command prefixes. The generated provisioning script must also preserve an owner
management path, quote IP-prefix selectors, avoid deleting RouterOS dynamic DNS
objects, and never use console row number 0 as a firewall move destination
because that row can be a built-in rule.
"""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
MIKROTIK_SPEC = ROOT / "apps/api/src/modules/routers/mikrotik.service.spec.ts"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one target, found {count}")
    return text.replace(old, new, 1)


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

    new_function = """  function oneRunCommand() {
    if (!selectedSetup) return ''
    const registrationKey = selectedSetup.router.registrationKey
    const serverCommand = selectedSetup.oneRunCommand ?? ''
    const hasSafeBootstrap =
      serverCommand.includes('http://95.111.234.34/api/mikrotik/script/') &&
      !serverCommand.includes('waiting 20 seconds') &&
      !serverCommand.includes(':delay 20s')
    const command = hasSafeBootstrap ? serverCommand : (registrationKey ? buildSetupFallbackCommand(registrationKey) : '')
    return normalizeRouterOsCommand(command)
  }
"""

    if "return normalizeRouterOsCommand(command)" not in text:
        pattern = re.compile(r"  function oneRunCommand\(\) \{.*?\n  \}\n\n  async function copyScript", re.S)
        text, count = pattern.subn(new_function + "\n  async function copyScript", text, count=1)
        if count != 1:
            raise RuntimeError(f"one-run command normalization: expected exactly one target, found {count}")

    required = [
        "function normalizeRouterOsCommand(value: string)",
        r".replace(/\\:/g, ':')",
        "http://95.111.234.34/api/mikrotik/script/",
        "return normalizeRouterOsCommand(command)",
    ]
    for sentinel in required:
        if sentinel not in text:
            raise RuntimeError(f"MikroTik command sanitizer missing sentinel: {sentinel}")

    return text


def patch_mikrotik_service(text: str) -> str:
    old_route_selector = (
        '      `:foreach r in=[/ip route find dst-address=0.0.0.0/0 active=yes] do={`,'
    )
    new_route_selector = (
        '      `:foreach r in=[/ip route find dst-address="0.0.0.0/0" active=yes] do={`,'
    )
    if old_route_selector in text:
        text = replace_once(
            text,
            old_route_selector,
            new_route_selector,
            "quoted default-route selector",
        )

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
        text = replace_once(
            text,
            old_wired_block,
            new_wired_block,
            "safe wired-port assignment",
        )

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

    # RouterOS HotSpot can expose dynamic DNS rows. Removing every row that
    # matches dns-name aborts provisioning when the matching row is dynamic.
    # Delete only the static AROFi-owned row (identified by our comment), and
    # make both cleanup and add non-fatal so a RouterOS dynamic row can coexist.
    old_dns_block = """      ...(input.dnsName ? [
        `/ip dns static remove [find name="${this.escape(input.dnsName)}"]`,
        `/ip dns static add name="${this.escape(input.dnsName)}" address=${gatewayIp} comment="AROFi hotspot DNS gateway"`,
      ] : []),
"""
    new_dns_block = """      ...(input.dnsName ? [
        `:do { /ip dns static remove [find comment="AROFi hotspot DNS gateway"] } on-error={}`,
        `:do { /ip dns static add name="${this.escape(input.dnsName)}" address=${gatewayIp} comment="AROFi hotspot DNS gateway" } on-error={}`,
      ] : []),
"""
    if ':do { /ip dns static remove [find comment="AROFi hotspot DNS gateway"] } on-error={}' not in text:
        text = replace_once(
            text,
            old_dns_block,
            new_dns_block,
            "dynamic-safe hotspot DNS cleanup",
        )

    required = [
        'dst-address="0.0.0.0/0" active=yes',
        "# 3d-2. Preserve owner management while assigning unused wired ports",
        '$ethName != "ether2"',
        "$ethRunning = false",
        "destination=$arofiWanMgmtAnchor",
        "destination=$arofiHotspotInputAnchor",
        "destination=$arofiHotspotMgmtAnchor",
        "destination=$arofiHotspotForwardAnchor",
        ':do { /ip dns static remove [find comment="AROFi hotspot DNS gateway"] } on-error={}',
        'comment="AROFi hotspot DNS gateway" } on-error={}',
    ]
    for sentinel in required:
        if sentinel not in text:
            raise RuntimeError(f"MikroTik provisioning safety sentinel missing: {sentinel}")

    # Match executable RouterOS commands, not explanatory TypeScript comments.
    forbidden = [
        "dst-address=0.0.0.0/0 active=yes",
        "# 3d-2. Put wired LAN ports on the captive hotspot bridge too",
        "/ip firewall filter move $r destination=0",
        '/ip dns static remove [find name="${this.escape(input.dnsName)}"]',
    ]
    for unsafe in forbidden:
        if unsafe in text:
            raise RuntimeError(f"Unsafe MikroTik provisioning pattern remains: {unsafe}")

    return text


def patch_mikrotik_spec(text: str) -> str:
    old_route_expectation = (
        "    expect(script).toContain(':foreach r in=[/ip route find "
        "dst-address=0.0.0.0/0 active=yes]')\n"
    )
    new_route_expectation = (
        "    expect(script).toContain(':foreach r in=[/ip route find "
        "dst-address=\"0.0.0.0/0\" active=yes]')\n"
    )
    if old_route_expectation in text:
        text = replace_once(
            text,
            old_route_expectation,
            new_route_expectation,
            "quoted route selector test",
        )

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
    expect(script).not.toContain('destination=0')
"""
    if "expect(script).toContain('$ethRunning = false')" not in text:
        text = replace_once(
            text,
            old_port_expectation,
            new_port_expectation,
            "wired management and firewall safety tests",
        )

    old_dns_expectations = """    expect(script).toContain('/ip dns static remove [find name="tenantname.wifi"]')
    expect(script).toContain('/ip dns static add name="tenantname.wifi" address=10.55.0.1')
"""
    new_dns_expectations = """    // A RouterOS HotSpot may own a dynamic dns-name row; only AROFi's static row is removable.
    expect(script).toContain(':do { /ip dns static remove [find comment="AROFi hotspot DNS gateway"] } on-error={}')
    expect(script).toContain(':do { /ip dns static add name="tenantname.wifi" address=10.55.0.1 comment="AROFi hotspot DNS gateway" } on-error={}')
    expect(script).not.toContain('/ip dns static remove [find name="tenantname.wifi"]')
    // dynamic DNS row must never abort provisioning
"""
    if "dynamic DNS row must never abort provisioning" not in text:
        text = replace_once(
            text,
            old_dns_expectations,
            new_dns_expectations,
            "dynamic-safe hotspot DNS tests",
        )

    required = [
        'dst-address="0.0.0.0/0" active=yes',
        "expect(script).toContain('$ethName != \"ether2\"')",
        "expect(script).toContain('$ethRunning = false')",
        "expect(script).not.toContain('destination=0')",
        "dynamic DNS row must never abort provisioning",
        'find comment="AROFi hotspot DNS gateway"',
        "expect(script).not.toContain('/ip dns static remove [find name=\"tenantname.wifi\"]')",
    ]
    for sentinel in required:
        if sentinel not in text:
            raise RuntimeError(f"MikroTik service test sentinel missing: {sentinel}")

    return text


def main() -> None:
    files = {
        ADMIN: patch_admin,
        MIKROTIK: patch_mikrotik_service,
        MIKROTIK_SPEC: patch_mikrotik_spec,
    }

    for path, patcher in files.items():
        if not path.exists():
            raise RuntimeError(f"Required source file missing: {path.relative_to(ROOT)}")
        original = path.read_text(encoding="utf-8")
        updated = patcher(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")

    print(
        "MikroTik command output, dynamic-safe DNS cleanup, and provisioning "
        "safety fixes applied."
    )


if __name__ == "__main__":
    main()
