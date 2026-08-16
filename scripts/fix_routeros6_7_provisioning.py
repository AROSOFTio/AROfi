#!/usr/bin/env python3
"""Harden generated MikroTik provisioning for RouterOS 6.x and 7.x.

This build-time patch fixes failures that otherwise leave a router half-installed:
- RouterOS /radius address= accepts only IPv4/IPv6, never a DNS hostname.
- legacy /interface wireless APs can withhold the running flag before first client.
- captive clients must use the MikroTik gateway as DNS.
- the plain-HTTP bootstrap URL must be a clean origin, not an HTTPS callback path.

The generated RouterOS script intentionally uses only scripting primitives available
since RouterOS 6.2 (:resolve, :typeof, :do/on-error) for the shared v6/v7 path.
Version-specific wireless commands remain protected by the existing [:parse] guard.
"""

from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
MIKROTIK_SPEC = ROOT / "apps/api/src/modules/routers/mikrotik.service.spec.ts"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one target, found {count}")
    return text.replace(old, new, 1)


def patch_mikrotik(text: str) -> str:
    old_v6 = """    const v6Inner = (iface: string) =>
      `:if ([:len [/interface wireless find name="${iface}"]]>0) do={/interface wireless set [find name="${iface}"] disabled=no mode=ap-bridge ssid="${escapedSsid}" security-profile=arofi-open; ${bridgePort(iface)}}`
"""
    new_v6 = """    const v6Inner = (iface: string) =>
      `:if ([:len [/interface wireless find name="${iface}"]]>0) do={/interface wireless set [find name="${iface}"] disabled=no mode=ap-bridge disable-running-check=yes ssid="${escapedSsid}" security-profile=arofi-open; ${bridgePort(iface)}}`
"""
    if "disable-running-check=yes" not in text:
        text = replace_once(text, old_v6, new_v6, "RouterOS 6 wireless running-check")

    text = text.replace(
        "dns-server=${gatewayIp},1.1.1.1,8.8.8.8",
        "dns-server=${gatewayIp}",
    )
    text = text.replace(
        "dns-server=${gatewayIp},8.8.8.8,1.1.1.1",
        "dns-server=${gatewayIp}",
    )

    radius_marker = "    const radiusOnly = input.mode === 'SAFE_EXISTING_ROUTER'\n"
    if "const radiusResolutionScript = [" not in text:
        radius_helpers = radius_marker + r"""
    // RouterOS /radius address= accepts IPv4/IPv6 only. A DNS hostname produces:
    // "invalid value for argument address / ip-address / ipv6-address".
    // Prefer an explicit IP resolved by server config; if a hostname remains,
    // resolve it on-router with v6-compatible :resolve before /radius add.
    const normalizeRadiusHost = (value: string) =>
      value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
    const radiusPrimaryHost = normalizeRadiusHost(input.radiusHost)
    const radiusPrimaryIsIp = net.isIP(radiusPrimaryHost) !== 0
    const radiusPrimaryAddress = radiusPrimaryIsIp ? radiusPrimaryHost : '$arofiRadiusAddress'
    const radiusSecondaryHost = input.radiusSecondaryHost
      ? normalizeRadiusHost(input.radiusSecondaryHost)
      : undefined
    const radiusSecondaryIsIp = radiusSecondaryHost ? net.isIP(radiusSecondaryHost) !== 0 : false
    const radiusSecondaryAddress =
      radiusSecondaryHost && !radiusSecondaryIsIp ? '$arofiRadiusSecondaryAddress' : radiusSecondaryHost
    const radiusResolutionScript = [
      ...(radiusPrimaryIsIp
        ? []
        : [
            `:local arofiRadiusAddress`,
            `:do { :set arofiRadiusAddress [:resolve "${this.escape(radiusPrimaryHost)}"] } on-error={}`,
            `:if ([:typeof $arofiRadiusAddress] = "nil") do={ :error "AROFi: RADIUS host ${this.escape(radiusPrimaryHost)} could not be resolved. Check WAN/DNS or set RADIUS_PUBLIC_IP." }`,
          ]),
      ...(radiusSecondaryHost && !radiusSecondaryIsIp
        ? [
            `:local arofiRadiusSecondaryAddress`,
            `:do { :set arofiRadiusSecondaryAddress [:resolve "${this.escape(radiusSecondaryHost)}"] } on-error={}`,
            `:if ([:typeof $arofiRadiusSecondaryAddress] = "nil") do={ :error "AROFi: standby RADIUS host ${this.escape(radiusSecondaryHost)} could not be resolved. Check WAN/DNS or set RADIUS_SECONDARY_HOST to an IP." }`,
          ]
        : []),
    ]
"""
        text = replace_once(
            text,
            radius_marker,
            radius_helpers,
            "RouterOS RADIUS runtime resolution helpers",
        )

    if "...radiusResolutionScript," not in text:
        marker = """      `# 2. AROFi RADIUS server for HotSpot auth + accounting`,
"""
        text = replace_once(
            text,
            marker,
            marker + "      ...radiusResolutionScript,\n",
            "RADIUS resolution insertion",
        )

    primary_old = """      `/radius add service=hotspot address=${input.radiusHost} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=5s comment="AROFi ${this.escape(registrationKey)}"`,
"""
    primary_new = """      `/radius add service=hotspot address=${radiusPrimaryAddress} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=5s comment="AROFi ${this.escape(registrationKey)}"`,
"""
    if primary_old in text:
        text = replace_once(text, primary_old, primary_new, "primary RADIUS IP-safe address")

    secondary_old = """            `/radius add service=hotspot address=${input.radiusSecondaryHost} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=5s comment="AROFi ${this.escape(registrationKey)} standby"`,
"""
    secondary_new = """            `/radius add service=hotspot address=${radiusSecondaryAddress} secret="${this.escape(input.sharedSecret)}" authentication-port=${input.radiusAuthPort} accounting-port=${input.radiusAccountingPort} timeout=5s comment="AROFi ${this.escape(registrationKey)} standby"`,
"""
    if secondary_old in text:
        text = replace_once(text, secondary_old, secondary_new, "secondary RADIUS IP-safe address")

    callback_pattern = re.compile(
        r"  private resolveHttpCallbackBaseUrl\(\) \{.*?\n  \}\n\n  // excludeIface",
        re.S,
    )
    callback_replacement = r"""  private resolveHttpCallbackBaseUrl() {
    const normalizeHost = (value?: string | null) =>
      (value ?? '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/:4012$/, '')
        .replace(/:\d+$/, '')

    // A raw public IP is the most reliable plain-HTTP bootstrap because it does
    // not depend on DNS while the router is still being onboarded.
    const publicIp = [
      this.configService.get<string>('MIKROTIK_CALLBACK_PUBLIC_IP'),
      this.configService.get<string>('VPS_PUBLIC_IP'),
      this.configService.get<string>('SERVER_PUBLIC_IP'),
    ]
      .map((value) => normalizeHost(value))
      .find((value) => value && net.isIP(value))

    if (publicIp) {
      return `http://${publicIp}`
    }

    const configuredHost = normalizeHost(
      this.configService.get<string>('MIKROTIK_CALLBACK_HTTP_URL'),
    )
    if (configuredHost) {
      return `http://${configuredHost}`
    }

    const fallbackHost = normalizeHost(
      this.configService.get<string>('API_PUBLIC_HOST') ||
      this.configService.get<string>('PORTAL_PUBLIC_HOST') ||
      this.configService.get<string>('RADIUS_PUBLIC_HOST'),
    )
    return `http://${fallbackHost || '95.111.234.34'}`
  }

  // excludeIface"""
    match = callback_pattern.search(text)
    if not match:
        raise RuntimeError("HTTP callback normalizer: resolveHttpCallbackBaseUrl() not found")
    existing = match.group(0)
    if "A raw public IP is the most reliable plain-HTTP bootstrap" not in existing:
        text = callback_pattern.sub(lambda _match: callback_replacement, text, count=1)

    required = {
        "legacy AP running state": "disable-running-check=yes",
        "gateway-only DHCP DNS": "dns-server=${gatewayIp}`",
        "RADIUS runtime resolver": "const radiusResolutionScript = [",
        "primary RADIUS resolve": '[:resolve "${this.escape(radiusPrimaryHost)}"]',
        "primary RADIUS variable": "address=${radiusPrimaryAddress}",
        "secondary RADIUS variable": "address=${radiusSecondaryAddress}",
        "clean callback origin": "A raw public IP is the most reliable plain-HTTP bootstrap",
        "HTTP callback scheme": "return `http://${configuredHost}`",
    }
    missing = [label for label, marker in required.items() if marker not in text]
    if missing:
        raise RuntimeError("RouterOS 6/7 hardening missing: " + ", ".join(missing))

    forbidden = {
        "direct hostname in primary RADIUS address": "address=${input.radiusHost}",
        "direct hostname in secondary RADIUS address": "address=${input.radiusSecondaryHost}",
        "public DNS advertised to captive clients": "dns-server=${gatewayIp},1.1.1.1,8.8.8.8",
        "alternate public DNS advertised to captive clients": "dns-server=${gatewayIp},8.8.8.8,1.1.1.1",
    }
    present = [label for label, marker in forbidden.items() if marker in text]
    if present:
        raise RuntimeError("Unsafe RouterOS 6/7 provisioning remains: " + ", ".join(present))

    return text


def patch_spec(text: str) -> str:
    if "runtime-resolves a DNS RADIUS host for RouterOS 6 and 7" not in text:
        marker = "  it('configures dns-name and static DNS entry when dnsName parameter is provided', () => {\n"
        test = r"""  it('runtime-resolves a DNS RADIUS host for RouterOS 6 and 7', () => {
    const service = new MikrotikService(
      new ConfigService({
        RADIUS_PUBLIC_HOST: 'radius-dev.example.net',
        RADIUS_SHARED_SECRET: 'radius-secret',
      }),
    )

    const radius = service.getRadiusServerConfig()
    const script = service.buildProvisioningScript({
      routerName: 'Cross-version Test',
      identity: 'cross-version-test',
      registrationKey: 'cross-version-token',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      radiusHost: radius.host,
      radiusAuthPort: radius.authPort,
      radiusAccountingPort: radius.accountingPort,
      sharedSecret: radius.sharedSecret,
      mode: 'FRESH_FULL_CAPTIVE_WIFI',
    })

    expect(script).toContain(':do { :set arofiRadiusAddress [:resolve "radius-dev.example.net"] } on-error={}')
    expect(script).toContain('/radius add service=hotspot address=$arofiRadiusAddress')
    expect(script).not.toContain('/radius add service=hotspot address=radius-dev.example.net')
    expect(script).toContain('disable-running-check=yes')
    expect(script).toContain('dns-server=10.55.0.1')
    expect(script).not.toContain('dns-server=10.55.0.1,1.1.1.1,8.8.8.8')
  })

  it('normalizes the RouterOS plain-HTTP bootstrap to a clean origin', () => {
    const service = new MikrotikService(
      new ConfigService({
        API_PUBLIC_HOST: 'dev.arofi.net',
        MIKROTIK_CALLBACK_HTTP_URL: 'https://dev.arofi.net/api/routers/callback',
      }),
    )

    const command = service.buildOneRunCommand('cross-version-token')
    expect(command).toContain('url="http://dev.arofi.net/api/mikrotik/script/cross-version-token"')
    expect(command).toContain('mode=http')
    expect(command).not.toContain('/api/routers/callback/api/mikrotik/script/')
    expect(command).not.toContain('url="https://dev.arofi.net/api/mikrotik/script/cross-version-token" dst-path="arofi-setup.rsc" mode=http')
  })

"""
        text = replace_once(
            text,
            marker,
            test + marker,
            "RouterOS 6/7 regression tests",
        )
    return text


def main() -> None:
    if not MIKROTIK.exists() or not MIKROTIK_SPEC.exists():
        raise RuntimeError("RouterOS source/spec files are missing")

    source = MIKROTIK.read_text(encoding="utf-8")
    patched = patch_mikrotik(source)
    if patched != source:
        MIKROTIK.write_text(patched, encoding="utf-8")

    spec = MIKROTIK_SPEC.read_text(encoding="utf-8")
    patched_spec = patch_spec(spec)
    if patched_spec != spec:
        MIKROTIK_SPEC.write_text(patched_spec, encoding="utf-8")

    print(
        "RouterOS 6/7 provisioning hardened: IP-safe RADIUS, clean HTTP bootstrap, "
        "legacy AP running-state, and gateway-only captive DNS."
    )


if __name__ == "__main__":
    main()
