#!/usr/bin/env python3
# Apply safe selectable WAN-port support to MikroTik onboarding.
# Strict and idempotent: every required source marker must exist.

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"
ROUTERS_SERVICE = ROOT / "apps/api/src/modules/routers/routers.service.ts"
MIKROTIK_SERVICE = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"{label}: target marker not found")
    return text.replace(old, new, 1)


def patch_admin(text: str) -> str:
    if "wanInterface: string" not in text:
        text = replace_once(
            text,
            "  scriptMode: 'SAFE_EXISTING_ROUTER' | 'FRESH_FULL_HOTSPOT' | 'FRESH_FULL_CAPTIVE_WIFI'\n"
            "  tags: string\n",
            "  scriptMode: 'SAFE_EXISTING_ROUTER' | 'FRESH_FULL_HOTSPOT' | 'FRESH_FULL_CAPTIVE_WIFI'\n"
            "  wanInterface: string\n"
            "  wanInterfaceCustom: string\n"
            "  tags: string\n",
            "admin form WAN fields",
        )

    if "wanInterface: 'AUTO'" not in text:
        text = replace_once(
            text,
            "  scriptMode: 'FRESH_FULL_CAPTIVE_WIFI',\n"
            "  tags: '',\n",
            "  scriptMode: 'FRESH_FULL_CAPTIVE_WIFI',\n"
            "  wanInterface: 'AUTO',\n"
            "  wanInterfaceCustom: '',\n"
            "  tags: '',\n",
            "admin WAN defaults",
        )

    if "routerForm.wanInterface === 'CUSTOM'" not in text:
        new_tags = """        tags: [
          ...parseTags(routerForm.tags).filter((tag) => !/^wan:/i.test(tag)),
          `wan:${routerForm.scriptMode === 'SAFE_EXISTING_ROUTER'
            ? 'AUTO'
            : routerForm.wanInterface === 'CUSTOM'
              ? routerForm.wanInterfaceCustom.trim()
              : routerForm.wanInterface}`,
        ],
"""
        text = replace_once(
            text,
            "        tags: parseTags(routerForm.tags),\n",
            new_tags,
            "admin WAN tag payload",
        )

    old_desc = (
        '                desc="Builds an open SSID + captive portal on an isolated bridge. '
        'Never changes your admin login, WAN, or management IP."\n'
    )
    new_desc = (
        '                desc="Builds an open SSID + captive portal on an isolated bridge. '
        'Auto mode leaves the working WAN untouched; an explicitly selected ISP port is configured safely."\n'
    )
    if "Auto mode leaves the working WAN untouched" not in text:
        text = replace_once(text, old_desc, new_desc, "admin setup mode description")

    old_safe_click = (
        "                onClick={() => setFormState((previous) => ({ ...previous, "
        "scriptMode: 'SAFE_EXISTING_ROUTER' }))}\n"
    )
    new_safe_click = (
        "                onClick={() => setFormState((previous) => ({ ...previous, "
        "scriptMode: 'SAFE_EXISTING_ROUTER', wanInterface: 'AUTO', "
        "wanInterfaceCustom: '' }))}\n"
    )
    if "scriptMode: 'SAFE_EXISTING_ROUTER', wanInterface: 'AUTO'" not in text:
        text = replace_once(
            text,
            old_safe_click,
            new_safe_click,
            "admin safe-mode WAN reset",
        )

    if 'label="ISP / WAN port"' not in text:
        advanced_marker = """          <button type="button" className="btn btn-ghost" onClick={() => setShowAdvanced((previous) => !previous)} style={{ marginBottom: 12 }}>
"""
        wan_ui = """          {!isSafeMode && (
            <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface-muted)' }}>
              <div className="form-grid" style={{ marginBottom: formState.wanInterface === 'CUSTOM' ? 10 : 0 }}>
                <SelectField
                  label="ISP / WAN port"
                  value={formState.wanInterface}
                  onChange={(value) => setFormState((previous) => ({
                    ...previous,
                    wanInterface: value,
                    wanInterfaceCustom: value === 'CUSTOM' ? previous.wanInterfaceCustom : '',
                  }))}
                  options={[
                    { value: 'AUTO', label: 'Auto-detect existing internet route (safest)' },
                    { value: 'ether1', label: 'ether1 — ISP cable uses port 1' },
                    { value: 'ether2', label: 'ether2 — ISP cable uses port 2' },
                    { value: 'ether3', label: 'ether3 — ISP cable uses port 3' },
                    { value: 'ether4', label: 'ether4 — ISP cable uses port 4' },
                    { value: 'ether5', label: 'ether5 — ISP cable uses port 5' },
                    { value: 'ether6', label: 'ether6 — ISP cable uses port 6' },
                    { value: 'ether7', label: 'ether7 — ISP cable uses port 7' },
                    { value: 'ether8', label: 'ether8 — ISP cable uses port 8' },
                    { value: 'ether9', label: 'ether9 — ISP cable uses port 9' },
                    { value: 'ether10', label: 'ether10 — ISP cable uses port 10' },
                    { value: 'sfp1', label: 'sfp1' },
                    { value: 'sfp-sfpplus1', label: 'sfp-sfpplus1' },
                    { value: 'CUSTOM', label: 'Other interface name' },
                  ]}
                  required
                />
                {formState.wanInterface === 'CUSTOM' && (
                  <InputField
                    label="Custom WAN interface"
                    value={formState.wanInterfaceCustom}
                    onChange={(value) => setFormState((previous) => ({ ...previous, wanInterfaceCustom: value }))}
                    placeholder="Example: combo1 or sfp2"
                    required
                  />
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                <strong>Auto</strong> keeps the router&apos;s current internet setup unchanged. Selecting a port is for a fresh/reset router receiving DHCP from an ISP router, modem, or Starlink adapter. Plug the ISP cable into that port and use another port or MAC WinBox while running setup. AROFi restores the bridge membership and stops before HotSpot changes when the selected port cannot obtain internet.
              </div>
            </div>
          )}

"""
        text = replace_once(
            text,
            advanced_marker,
            wan_ui + advanced_marker,
            "admin WAN selector UI",
        )

    return text


def patch_routers_service(text: str) -> str:
    if "private extractWanInterface(" not in text:
        helper_marker = "  private getPlatformRadiusSharedSecret() {\n"
        helper = """  private extractWanInterface(tags?: string[] | null) {
    const tagged = tags
      ?.find((tag) => /^wan:/i.test(tag))
      ?.slice(4)
      .trim()

    if (!tagged || tagged.toUpperCase() === 'AUTO') {
      return undefined
    }

    return /^[A-Za-z0-9._:+-]{1,32}$/.test(tagged) ? tagged : undefined
  }

"""
        text = replace_once(
            text,
            helper_marker,
            helper + helper_marker,
            "router service WAN tag helper",
        )

    if "buildOneRunCommand(router.registrationKey, this.extractWanInterface(router.tags))" not in text:
        old = "this.mikrotikService.buildOneRunCommand(router.registrationKey)"
        count = text.count(old)
        if count < 2:
            raise RuntimeError(
                f"router service one-run WAN propagation: expected at least 2 calls, found {count}"
            )
        text = text.replace(
            old,
            "this.mikrotikService.buildOneRunCommand("
            "router.registrationKey, this.extractWanInterface(router.tags))",
        )

    if text.count("wanInterface: this.extractWanInterface(router.tags),") < 2:
        pattern = re.compile(
            r"(?P<indent>^[ \t]+)remoteClientName: router\.remoteClientName,\n",
            re.MULTILINE,
        )
        matches = list(pattern.finditer(text))
        if len(matches) != 2:
            raise RuntimeError(
                "router service provisioning WAN propagation: "
                f"expected 2 remoteClientName markers, found {len(matches)}"
            )

        text = pattern.sub(
            lambda match: (
                f"{match.group('indent')}remoteClientName: router.remoteClientName,\n"
                f"{match.group('indent')}wanInterface: this.extractWanInterface(router.tags),\n"
            ),
            text,
        )

    return text


def patch_mikrotik_service(text: str) -> str:
    if "wanInterface?: string | null" not in text:
        text = replace_once(
            text,
            "  remoteClientName?: string | null\n"
            "}\n",
            "  remoteClientName?: string | null\n"
            "  wanInterface?: string | null\n"
            "}\n",
            "MikroTik WAN input type",
        )

    if "buildOneRunCommand(registrationKey: string, wanInterface?: string | null)" not in text:
        text = replace_once(
            text,
            "  buildOneRunCommand(registrationKey: string) {\n",
            "  buildOneRunCommand(registrationKey: string, wanInterface?: string | null) {\n",
            "MikroTik one-run WAN signature",
        )

    if "const wanBootstrap = this.buildSelectedWanBootstrap" not in text:
        marker = (
            "    const fallbackUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/script/"
            "${this.escape(registrationKey)}`\n"
        )
        insertion = marker + (
            "    const requestedWanInterface = this.normalizeWanInterface(wanInterface)\n"
            "    const wanBootstrap = this.buildSelectedWanBootstrap(requestedWanInterface)\n"
        )
        text = replace_once(
            text,
            marker,
            insertion,
            "MikroTik one-run WAN bootstrap",
        )

    if "wanBootstrap +\n      dnsBootstrap +" not in text:
        text = replace_once(
            text,
            "    return (\n"
            "      dnsBootstrap +\n",
            "    return (\n"
            "      wanBootstrap +\n"
            "      dnsBootstrap +\n",
            "MikroTik one-run bootstrap ordering",
        )

    if "const requestedWanInterface = this.normalizeWanInterface(input.wanInterface)" not in text:
        text = replace_once(
            text,
            "    const remoteClientName = input.remoteClientName || 'AROFI_REMOTE'\n",
            "    const remoteClientName = input.remoteClientName || 'AROFI_REMOTE'\n"
            "    const requestedWanInterface = this.normalizeWanInterface(input.wanInterface)\n",
            "MikroTik provisioning WAN selection",
        )

    if "this.buildSelectedWanScript(requestedWanInterface, radiusOnly)" not in text:
        text = replace_once(
            text,
            "      `:do { /ip service set www disabled=no } on-error={}`,\n"
            "      `# Block direct WAN access to router management; remote access should use the AROFi SSTP tunnel`,\n",
            "      `:do { /ip service set www disabled=no } on-error={}`,\n"
            "      ...this.buildSelectedWanScript(requestedWanInterface, radiusOnly),\n"
            "      `# Block direct WAN access to router management; remote access should use the AROFi SSTP tunnel`,\n",
            "MikroTik selected WAN preparation",
        )

    if "requestedWanInterface ? [`:set wanIface" not in text:
        text = replace_once(
            text,
            "      ...this.buildWanDetectionScript('wanIface', remoteClientName),\n"
            "      `:global arofiWanIface`,\n",
            "      ...this.buildWanDetectionScript('wanIface', remoteClientName),\n"
            "      ...(requestedWanInterface ? [`:set wanIface \"${this.escape(requestedWanInterface)}\"`] : []),\n"
            "      `:global arofiWanIface`,\n",
            "MikroTik selected WAN NAT binding",
        )

    if "private buildSelectedWanPreparation(" not in text:
        method_marker = "  // Brings up an OPEN customer SSID on whatever radios the board has and binds\n"
        methods = r"""  private normalizeWanInterface(value?: string | null) {
    const trimmed = value?.trim()
    if (!trimmed || trimmed.toUpperCase() === 'AUTO') {
      return null
    }
    return /^[A-Za-z0-9._:+-]{1,32}$/.test(trimmed) ? trimmed : null
  }

  private buildSelectedWanBootstrap(wanInterface: string | null) {
    if (!wanInterface) {
      return ''
    }
    return `${this.buildSelectedWanPreparation(wanInterface).join(' ')} `
  }

  private buildSelectedWanScript(wanInterface: string | null, radiusOnly: boolean) {
    if (!wanInterface || radiusOnly) {
      return []
    }

    return [
      ``,
      `# 1b. Prepare the explicitly selected ISP/WAN port before HotSpot changes`,
      ...this.buildSelectedWanPreparation(wanInterface),
    ]
  }

  private buildSelectedWanPreparation(wanInterface: string) {
    const escapedWan = this.escape(wanInterface)
    return [
      `:local arofiSelectedWan "${escapedWan}"`,
      `:local arofiWanBridge ""`,
      `:local arofiWanPortRemoved 0`,
      `:local arofiWanDhcpCreated 0`,
      `:if ([:len [/interface find where name=$arofiSelectedWan]] = 0) do={ :error "AROFi: selected WAN interface ${escapedWan} does not exist." }`,
      `:local arofiBridgePort [/interface bridge port find where interface=$arofiSelectedWan]`,
      `:if ([:len $arofiBridgePort] > 0) do={ :set arofiWanBridge [/interface bridge port get [:pick $arofiBridgePort 0] bridge]; /interface bridge port remove $arofiBridgePort; :set arofiWanPortRemoved 1 }`,
      `:do { /interface enable [find where name=$arofiSelectedWan] } on-error={}`,
      `:local arofiWanDhcp [/ip dhcp-client find where interface=$arofiSelectedWan]`,
      `:if ([:len $arofiWanDhcp] = 0) do={ /ip dhcp-client add interface=$arofiSelectedWan add-default-route=yes use-peer-dns=yes disabled=no comment="AROFi selected WAN"; :set arofiWanDhcpCreated 1 } else={ /ip dhcp-client set $arofiWanDhcp add-default-route=yes use-peer-dns=yes disabled=no }`,
      `:local arofiWanWait 0`,
      `:local arofiWanBound 0`,
      `:while ($arofiWanWait < 20 && $arofiWanBound = 0) do={ :delay 1s; :set arofiWanWait ($arofiWanWait + 1); :local arofiCurrentDhcp [/ip dhcp-client find where interface=$arofiSelectedWan status=bound]; :if ([:len $arofiCurrentDhcp] > 0) do={ :set arofiWanBound 1 } }`,
      `:if ($arofiWanBound = 0) do={ :if ($arofiWanDhcpCreated = 1) do={ /ip dhcp-client remove [find where interface=$arofiSelectedWan comment="AROFi selected WAN"] }; :if ($arofiWanPortRemoved = 1 && $arofiWanBridge != "") do={ /interface bridge port add bridge=$arofiWanBridge interface=$arofiSelectedWan }; :error "AROFi: ${escapedWan} did not receive internet settings from the ISP. Bridge membership was restored and no HotSpot changes were made." }`,
      `:put "AROFi: selected ISP/WAN port ${escapedWan} is ready."`,
    ]
  }

"""
        text = replace_once(
            text,
            method_marker,
            methods + method_marker,
            "MikroTik selected WAN helper methods",
        )

    text = text.replace(
        "    // Shared front matter: enable management access only. We deliberately do NOT\n"
        "    // change the admin username/password and do NOT touch WAN or addresses.\n",
        "    // Shared front matter: preserve credentials and management. AUTO mode does\n"
        "    // not touch WAN; explicit fresh-router mode prepares only the chosen ISP port.\n",
        1,
    )
    text = text.replace(
        "      `# This script never changes your admin login and never reconfigures your`,\n"
        "      `# WAN or management IP. You can keep using WinBox exactly as before.`,\n",
        "      `# This script never changes your admin login or management IP.`,\n"
        "      `# AUTO keeps WAN unchanged; explicit mode prepares only the selected ISP port.`,\n",
        1,
    )

    return text


def main() -> None:
    files = {
        ADMIN: patch_admin,
        ROUTERS_SERVICE: patch_routers_service,
        MIKROTIK_SERVICE: patch_mikrotik_service,
    }

    for path, patcher in files.items():
        if not path.exists():
            raise RuntimeError(f"Required source file missing: {path.relative_to(ROOT)}")
        original = path.read_text(encoding="utf-8")
        updated = patcher(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")

    print("Router WAN port selection and safe DHCP bootstrap applied.")


if __name__ == "__main__":
    main()
