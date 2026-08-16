#!/usr/bin/env python3
"""Harden MikroTik provisioning and returning-device access for RouterOS 6.x and 7.x.

This build-time patch fixes failures that otherwise leave a router half-installed
or make a paid customer lose easy access after Wi-Fi disconnect/logout:
- RouterOS /radius address= accepts only IPv4/IPv6, never a DNS hostname.
- legacy /interface wireless APs can withhold the running flag before first client.
- captive clients must use the MikroTik gateway as DNS.
- the plain-HTTP bootstrap URL must be a clean origin, not an HTTPS callback path.
- the first successful RADIUS accounting signal permanently binds an active
  activation/credential to the observed device MAC and router, even when the
  browser did not provide a MAC during checkout.
- a legitimate same-device logout/reconnect is allowed to auto-login immediately;
  the loop guard only activates after RouterOS actually reports a login error.

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
RADIUS_SIGNAL = ROOT / "apps/api/src/modules/radius/radius-signal-sync.service.ts"
RADIUS_SIGNAL_SPEC = ROOT / "apps/api/src/modules/radius/radius-signal-sync.service.spec.ts"


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

    # A successful same-device logout/reconnect must not be held for an arbitrary
    # 8-second timer. RouterOS already gives us $(error), so only use the loop
    # guard after a real login error. Normal disconnect/reconnect can immediately
    # reuse the API-confirmed active activation.
    old_hotspot_params = '    var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"",orig="$(link-orig)"||"";'
    new_hotspot_params = '    var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"",orig="$(link-orig)"||"",herr="$(error)"||"";'
    if 'herr="$(error)"' not in text and old_hotspot_params in text:
        text = replace_once(text, old_hotspot_params, new_hotspot_params, "HotSpot error-aware reconnect context")

    old_loop_guard = "        var loopGuard=_lastAuto&&(Date.now()-_lastAuto)<8000;"
    new_loop_guard = "        var loopGuard=!!herr&&_lastAuto&&(Date.now()-_lastAuto)<5000;"
    if old_loop_guard in text:
        text = replace_once(text, old_loop_guard, new_loop_guard, "error-aware auto reconnect loop guard")

    required = {
        "legacy AP running state": "disable-running-check=yes",
        "gateway-only DHCP DNS": "dns-server=${gatewayIp}`",
        "RADIUS runtime resolver": "const radiusResolutionScript = [",
        "primary RADIUS resolve": '[:resolve "${this.escape(radiusPrimaryHost)}"]',
        "primary RADIUS variable": "address=${radiusPrimaryAddress}",
        "secondary RADIUS variable": "address=${radiusSecondaryAddress}",
        "clean callback origin": "A raw public IP is the most reliable plain-HTTP bootstrap",
        "HTTP callback scheme": "return `http://${configuredHost}`",
        "HotSpot error macro": 'herr="$(error)"',
        "logout-safe reconnect loop guard": "var loopGuard=!!herr&&_lastAuto&&(Date.now()-_lastAuto)<5000;",
    }
    missing = [label for label, marker in required.items() if marker not in text]
    if missing:
        raise RuntimeError("RouterOS 6/7 hardening missing: " + ", ".join(missing))

    forbidden = {
        "direct hostname in primary RADIUS address": "address=${input.radiusHost}",
        "direct hostname in secondary RADIUS address": "address=${input.radiusSecondaryHost}",
        "public DNS advertised to captive clients": "dns-server=${gatewayIp},1.1.1.1,8.8.8.8",
        "alternate public DNS advertised to captive clients": "dns-server=${gatewayIp},8.8.8.8,1.1.1.1",
        "blind reconnect delay": "var loopGuard=_lastAuto&&(Date.now()-_lastAuto)<8000;",
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

    if 'herr="$(error)"' not in text:
        marker = "    expect(html).toContain('orig=\"$(link-orig)\"')\n"
        replacement = marker + "    expect(html).toContain('herr=\"$(error)\"')\n    expect(html).toContain('var loopGuard=!!herr&&_lastAuto&&(Date.now()-_lastAuto)<5000;')\n"
        text = replace_once(text, marker, replacement, "logout-safe reconnect regression expectations")

    return text


def patch_radius_signal(text: str) -> str:
    call_marker = """    const activationStillActive = Boolean(
      activation?.status === PackageActivationStatus.ACTIVE && activation.endsAt > now,
    )

    const sessionStatus = isStopped
"""
    call_replacement = """    const activationStillActive = Boolean(
      activation?.status === PackageActivationStatus.ACTIVE && activation.endsAt > now,
    )

    // Browser state is not an access-control source of truth. The first real
    // RADIUS accounting row is authoritative proof of which physical device
    // successfully used this activation. Claim an unbound activation exactly
    // once so Mobile Money/voucher customers are remembered even after the
    // captive tab closes, the portal token expires, or they explicitly log out.
    if (activation && activationStillActive && macAddress) {
      await this.rememberObservedDevice({
        activationId: activation.id,
        routerId: router.id,
        macAddress,
        ipAddress,
        observedAt: row.acctstarttime ?? now,
      })
    }

    const sessionStatus = isStopped
"""
    if "await this.rememberObservedDevice({" not in text:
        text = replace_once(text, call_marker, call_replacement, "RADIUS accounting device-memory hook")

    method_marker = "  async processPostAuthRow(row: RadPostAuth) {\n"
    if "private async rememberObservedDevice(" not in text:
        method = r"""  private async rememberObservedDevice(input: {
    activationId: string
    routerId: string
    macAddress: string
    ipAddress?: string | null
    observedAt: Date
  }) {
    const normalizedMac = input.macAddress.trim().toUpperCase().replace(/-/g, ':')
    if (!/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(normalizedMac)) {
      return
    }

    // Atomic first-device claim: two devices cannot overwrite one another.
    // An already-bound activation is accepted only when the observed MAC is
    // the same MAC. This preserves the one-device rule while repairing the
    // old "browser forgot me" behaviour.
    const claim = await this.prisma.packageActivation.updateMany({
      where: {
        id: input.activationId,
        OR: [
          { boundMacAddress: null },
          { boundMacAddress: '' },
          { boundMacAddress: normalizedMac },
        ],
      },
      data: { boundMacAddress: normalizedMac },
    })

    if (claim.count === 0) {
      this.logger.warn(
        `RADIUS device-memory claim refused for activation=${input.activationId}: observed MAC ${normalizedMac} differs from the device already bound to this package.`,
      )
      return
    }

    // Fill identity fields only when they were never captured by the browser.
    // Do not move an already-bound package to another router/IP just because a
    // later accounting sweep reprocessed the same row.
    await this.prisma.packageActivation.updateMany({
      where: { id: input.activationId, routerId: null },
      data: { routerId: input.routerId },
    })
    if (input.ipAddress) {
      await this.prisma.packageActivation.updateMany({
        where: { id: input.activationId, firstSeenIp: null },
        data: { firstSeenIp: input.ipAddress },
      })
    }
    await this.prisma.packageActivation.updateMany({
      where: { id: input.activationId, firstSeenAt: null },
      data: { firstSeenAt: input.observedAt },
    })

    // Portal returning-device lookup reads PackageActivation, while FreeRADIUS
    // authorization reads RadiusCredential. Keep both records aligned. Like
    // the activation claim, never overwrite a credential bound to another MAC.
    await this.prisma.radiusCredential.updateMany({
      where: {
        activationId: input.activationId,
        OR: [
          { boundMacAddress: null },
          { boundMacAddress: '' },
          { boundMacAddress: normalizedMac },
        ],
      },
      data: { boundMacAddress: normalizedMac },
    })
    await this.prisma.radiusCredential.updateMany({
      where: { activationId: input.activationId, routerId: null },
      data: { routerId: input.routerId },
    })
  }

"""
        text = replace_once(text, method_marker, method + method_marker, "persistent returning-device memory helper")

    required = [
        "await this.rememberObservedDevice({",
        "Atomic first-device claim: two devices cannot overwrite one another.",
        "data: { boundMacAddress: normalizedMac }",
        "where: { id: input.activationId, routerId: null }",
        "where: { activationId: input.activationId, routerId: null }",
    ]
    for marker in required:
        if marker not in text:
            raise RuntimeError(f"Returning-device memory marker missing: {marker}")

    return text


def patch_radius_signal_spec(text: str) -> str:
    # Existing mock omitted status/endsAt even though processAcctRow selects both,
    # making the test harness unable to represent a genuinely active activation.
    old_activation_mock = """        if (select?.voucherRedemptionId) {
          return Promise.resolve({ id: 'activation-1', voucherRedemptionId: null })
        }
"""
    new_activation_mock = """        if (select?.voucherRedemptionId) {
          return Promise.resolve({
            id: 'activation-1',
            voucherRedemptionId: null,
            status: 'ACTIVE',
            endsAt: new Date(Date.now() + 60 * 60 * 1000),
          })
        }
"""
    if "endsAt: new Date(Date.now() + 60 * 60 * 1000)" not in text:
        text = replace_once(text, old_activation_mock, new_activation_mock, "active activation accounting mock")

    if "updateMany: jest.fn().mockResolvedValue({ count: 1 })," not in text.split("networkSession:", 1)[0]:
        old_package_update = """      update: jest.fn().mockResolvedValue({}),
    },
    networkSession: {
"""
        new_package_update = """      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    networkSession: {
"""
        text = replace_once(text, old_package_update, new_package_update, "package activation updateMany mock")

    old_credential_tail = """    radiusCredential: {
      findFirst: jest.fn().mockResolvedValue(
        options.credential === undefined
          ? { username: 'arofi-user', tenantId: 'tenant-1', routerId: 'router-1' }
          : options.credential,
      ),
    },
"""
    new_credential_tail = """    radiusCredential: {
      findFirst: jest.fn().mockResolvedValue(
        options.credential === undefined
          ? { username: 'arofi-user', tenantId: 'tenant-1', routerId: 'router-1' }
          : options.credential,
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
"""
    if "radiusCredential" in text and "updateMany: jest.fn().mockResolvedValue({ count: 1 }),\n    },\n  }\n  const realtimeEvents" not in text:
        text = replace_once(text, old_credential_tail, new_credential_tail, "radius credential updateMany mock")

    if "remembers the first successfully authenticated device for future reconnects" not in text:
        marker = "  it('publishes session.stopped when a stop row closes an active session', async () => {\n"
        test = r"""  it('remembers the first successfully authenticated device for future reconnects', async () => {
    const { service, prisma } = buildHarness({ existingSession: null })

    await service.processAcctRow(buildAcctRow() as never)

    expect(prisma.packageActivation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'activation-1',
          OR: expect.arrayContaining([
            { boundMacAddress: null },
            { boundMacAddress: 'AA:BB:CC:DD:EE:FF' },
          ]),
        }),
        data: { boundMacAddress: 'AA:BB:CC:DD:EE:FF' },
      }),
    )
    expect(prisma.radiusCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ activationId: 'activation-1' }),
        data: { boundMacAddress: 'AA:BB:CC:DD:EE:FF' },
      }),
    )
  })

"""
        text = replace_once(text, marker, test + marker, "returning-device memory regression test")

    required = [
        "remembers the first successfully authenticated device for future reconnects",
        "data: { boundMacAddress: 'AA:BB:CC:DD:EE:FF' }",
        "endsAt: new Date(Date.now() + 60 * 60 * 1000)",
    ]
    for marker in required:
        if marker not in text:
            raise RuntimeError(f"Returning-device memory test marker missing: {marker}")

    return text


def main() -> None:
    required_files = (MIKROTIK, MIKROTIK_SPEC, RADIUS_SIGNAL, RADIUS_SIGNAL_SPEC)
    for path in required_files:
        if not path.exists():
            raise RuntimeError(f"Required RouterOS/Radius source file missing: {path.relative_to(ROOT)}")

    source = MIKROTIK.read_text(encoding="utf-8")
    patched = patch_mikrotik(source)
    if patched != source:
        MIKROTIK.write_text(patched, encoding="utf-8")

    spec = MIKROTIK_SPEC.read_text(encoding="utf-8")
    patched_spec = patch_spec(spec)
    if patched_spec != spec:
        MIKROTIK_SPEC.write_text(patched_spec, encoding="utf-8")

    radius_source = RADIUS_SIGNAL.read_text(encoding="utf-8")
    patched_radius = patch_radius_signal(radius_source)
    if patched_radius != radius_source:
        RADIUS_SIGNAL.write_text(patched_radius, encoding="utf-8")

    radius_spec = RADIUS_SIGNAL_SPEC.read_text(encoding="utf-8")
    patched_radius_spec = patch_radius_signal_spec(radius_spec)
    if patched_radius_spec != radius_spec:
        RADIUS_SIGNAL_SPEC.write_text(patched_radius_spec, encoding="utf-8")

    print(
        "RouterOS 6/7 access hardened: IP-safe RADIUS, clean HTTP bootstrap, legacy AP running-state, "
        "gateway-only captive DNS, immediate same-device reconnect, and persistent first-login device memory."
    )


if __name__ == "__main__":
    main()
