#!/usr/bin/env python3
"""Make the generated MikroTik HotSpot actually sit in the client traffic path.

Fresh/additive HotSpot mode is intended to turn the MikroTik into the gateway for
customer Wi-Fi, including external bridge-mode access points. The previous
generator preserved ether2 and every currently-running Ethernet link on the
management bridge. An external AP is, by definition, a running Ethernet link, so
its clients never entered ``arofi-hotspot`` and RouterOS had nothing to captive-
redirect. Phones therefore joined Wi-Fi but saw no AroFi login page.

This patch:
- moves every safe non-WAN Ethernet LAN/AP port onto ``arofi-hotspot`` even when
  the link is already running;
- protects the detected WAN, bound DHCP/PPPoE WAN ports, and members of a WAN
  bridge from being moved;
- publishes ``arofi.login`` as a stable local alias for manual portal testing;
- installs ``alogin.html`` as well as login/status so RouterOS has a real
  post-auth page when a client completes HotSpot authentication.

``login.html`` remains authoritative. A failed optional alogin/status fetch must
never prevent the login portal itself from becoming active; the final captive
normalizer enforces that invariant later in the build.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one target, found {count}")
    return text.replace(old, new, 1)


def patch_customer_ethernet_ports(text: str) -> str:
    old = '''      `# 3d-2. Preserve owner management while assigning unused wired ports`,
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
'''
    new = '''      `# 3d-2. Put customer Ethernet/AP ports behind the HotSpot`,
      `# Fresh HotSpot mode must own the client path. A live external AP cable is a customer port, not a reason to bypass captive login.`,
      `:local arofiCustomerPortCount 0`,
      `:foreach e in=[/interface ethernet find] do={`,
      `  :local ethName [/interface ethernet get $e name]`,
      `  :local arofiKeepAsWan 0`,
      `  :if ($ethName = $wanIface) do={ :set arofiKeepAsWan 1 }`,
      `  :if ([:len [/ip dhcp-client find where interface=$ethName status=bound]] > 0) do={ :set arofiKeepAsWan 1 }`,
      `  :if ([:len [/interface pppoe-client find where interface=$ethName disabled=no]] > 0) do={ :set arofiKeepAsWan 1 }`,
      `  :if ($wanIface != "" && [:len [/interface bridge find where name=$wanIface]] > 0) do={ :if ([:len [/interface bridge port find where bridge=$wanIface interface=$ethName]] > 0) do={ :set arofiKeepAsWan 1 } }`,
      `  :if ($ethName != "" && $ethName != "${this.escape(remoteClientName)}" && $arofiKeepAsWan = 0) do={`,
      `    :local ethBridgePort [/interface bridge port find where interface=$ethName]`,
      `    :if ([:len $ethBridgePort] = 0) do={ /interface bridge port add bridge=arofi-hotspot interface=$ethName } else={ /interface bridge port set $ethBridgePort bridge=arofi-hotspot }`,
      `    :do { /interface ethernet enable [find where name=$ethName] } on-error={}`,
      `    :set arofiCustomerPortCount ($arofiCustomerPortCount + 1)`,
      `    :put ("AROFi: customer HotSpot port active: " . $ethName)`,
      `  } else={`,
      `    :if ($ethName != "" && $arofiKeepAsWan = 1) do={ :put ("AROFi: preserving WAN/uplink port " . $ethName) }`,
      `  }`,
      `}`,
      `:if ($arofiCustomerPortCount = 0) do={ :put "AROFi: no wired customer port assigned; clients must use a Wi-Fi radio already moved to arofi-hotspot." }`,
'''
    return replace_once(text, old, new, "customer Ethernet HotSpot bridge")


def patch_local_login_alias(text: str) -> str:
    old = '''      `/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8`,
'''
    new = '''      `/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8`,
      `:do { /ip dns static remove [find comment="AROFi captive alias"] } on-error={}`,
      `:do { /ip dns static add name="arofi.login" address=${gatewayIp} ttl=1m comment="AROFi captive alias" } on-error={}`,
      `:do { /ip dns cache flush } on-error={}`,
'''
    return replace_once(text, old, new, "stable arofi.login DNS alias")


def patch_alogin_install(text: str) -> str:
    text = replace_once(
        text,
        '''      `:local arofiStatusPath ($arofiPortalDir . "/status.html")`,
      `:do { /file remove [find name=$arofiLoginPath] } on-error={}`,
      `:do { /file remove [find name=$arofiStatusPath] } on-error={}`,
''',
        '''      `:local arofiStatusPath ($arofiPortalDir . "/status.html")`,
      `:local arofiAloginPath ($arofiPortalDir . "/alogin.html")`,
      `:do { /file remove [find name=$arofiLoginPath] } on-error={}`,
      `:do { /file remove [find name=$arofiStatusPath] } on-error={}`,
      `:do { /file remove [find name=$arofiAloginPath] } on-error={}`,
''',
        "alogin portal path",
    )

    text = replace_once(
        text,
        '''      `:local arofiHtmlOk 0`,
      `:local arofiStatusOk 0`,
''',
        '''      `:local arofiHtmlOk 0`,
      `:local arofiStatusOk 0`,
      `:local arofiAloginOk 0`,
''',
        "alogin install state",
    )

    marker = '''      `}`,
      ...profileSet,
'''
    alogin = '''      `}`,
      `:do {`,
      `  /tool fetch url="${statusHtmlUrl}" check-certificate=no mode=https dst-path=$arofiAloginPath`,
      `  :if ([:len [/file find name=$arofiAloginPath]] > 0) do={`,
      `    :put "AROFi HotSpot alogin.html installed."`,
      `    :set arofiAloginOk 1`,
      `  } else={`,
      `    :error "alogin.html not found after fetch"`,
      `  }`,
      `} on-error={`,
      `  :do {`,
      `    /tool fetch url="${fallbackStatusHtmlUrl}" mode=http dst-path=$arofiAloginPath`,
      `    :if ([:len [/file find name=$arofiAloginPath]] > 0) do={`,
      `      :put "AROFi HotSpot alogin.html installed by HTTP fallback."`,
      `      :set arofiAloginOk 1`,
      `    }`,
      `  } on-error={`,
      `    :put "AROFi: optional alogin.html completion page was not installed; login.html remains active."`,
      `  }`,
      `}`,
      ...profileSet,
'''
    if "AROFi HotSpot alogin.html installed." not in text:
        # The last status-fetch close immediately precedes ...profileSet in this method.
        pos = text.find(marker, text.find("private buildLoginHtmlInstallScript"))
        if pos < 0:
            raise RuntimeError("alogin installation insertion point not found")
        text = text[:pos] + alogin + text[pos + len(marker):]

    return text


def verify(text: str) -> None:
    required = (
        "# 3d-2. Put customer Ethernet/AP ports behind the HotSpot",
        "customer HotSpot port active:",
        "preserving WAN/uplink port",
        'name="arofi.login" address=${gatewayIp}',
        ':local arofiAloginPath ($arofiPortalDir . "/alogin.html")',
        "AROFi HotSpot alogin.html installed.",
        ":set arofiAloginOk 1",
    )
    for marker in required:
        if marker not in text:
            raise RuntimeError(f"HotSpot client-path repair missing marker: {marker}")

    forbidden = (
        "ether2 and every currently running Ethernet link stay on the existing management bridge",
        "($ethRunning = false)",
        "preserving management/link-active port",
    )
    for marker in forbidden:
        if marker in text:
            raise RuntimeError(f"HotSpot client-path bypass still present: {marker}")


def main() -> None:
    if not MIKROTIK.exists():
        raise RuntimeError(f"Required source file missing: {MIKROTIK.relative_to(ROOT)}")

    text = MIKROTIK.read_text(encoding="utf-8")
    text = patch_customer_ethernet_ports(text)
    text = patch_local_login_alias(text)
    text = patch_alogin_install(text)
    verify(text)
    MIKROTIK.write_text(text, encoding="utf-8")
    print(
        "HotSpot client path repaired: non-WAN AP/LAN ports are captive, "
        "arofi.login resolves locally, and alogin.html is installed without gating login.html."
    )


if __name__ == "__main__":
    main()
