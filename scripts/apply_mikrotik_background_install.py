#!/usr/bin/env python3
"""Validate MikroTik onboarding and apply the final captive/session policy.

The one-run command imports in the foreground so RouterOS errors remain visible.
Voucher QR codes use the local hotspot login URL. Captive detection and returning
access are deterministic:
- exact automatic RADIUS ``login-by=mac`` is removed;
- trusted post-login ``mac-cookie`` reconnect is enabled;
- clients use the MikroTik gateway as their only DNS server;
- arofi.net is allowed before authentication so packages load;
- idle, keepalive and local session logout timers are disabled.
"""

from pathlib import Path
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
PORTAL_SERVICE = ROOT / "apps/api/src/modules/portal/portal.service.ts"
ADMIN = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"
VOUCHERS_SERVICE = ROOT / "apps/api/src/modules/vouchers/vouchers.service.ts"
VOUCHERS_MANAGER = ROOT / "apps/admin-web/src/components/VouchersManager.tsx"
VOUCHER_QR_ROUTING = ROOT / "apps/api/src/modules/vouchers/voucher-qr-routing.initializer.ts"

BACKGROUND_SENTINEL = "AROFi installation continues in background"
FOREGROUND_IMPORT_MARKERS = (
    r'/import file-name=\"arofi-setup.rsc\"',
    '/import file-name="arofi-setup.rsc"',
)
LOCAL_LOGIN_MARKERS = (
    "loginUrl: loginUrl || process.env.HOTSPOT_LOGIN_URL || 'http://10.55.0.1/login'",
    "const reconnectLoginUrl = requestedLoginUrl",
)
FINAL_LOGIN_BY = "login-by=cookie,mac-cookie,http-pap"
FINAL_PROFILE = (
    "shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d "
    "idle-timeout=none keepalive-timeout=none session-timeout=0s"
)


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{path.relative_to(ROOT)}: expected one {label} match, found {count}."
        )
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def validate_foreground_install() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")
    if BACKGROUND_SENTINEL in text:
        raise RuntimeError(
            "Hidden MikroTik background import is still present; keep the import foreground."
        )
    if not any(marker in text for marker in FOREGROUND_IMPORT_MARKERS):
        raise RuntimeError("MikroTik foreground import command is missing.")


def validate_portal_reconnect() -> None:
    text = PORTAL_SERVICE.read_text(encoding="utf-8")
    if not any(marker in text for marker in LOCAL_LOGIN_MARKERS):
        raise RuntimeError(
            "Portal reconnect payload no longer preserves the router-provided local login URL."
        )


def patch_deterministic_captive_flow() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")

    # Replace every generated HotSpot profile login mode with the exact policy.
    # ``mac-cookie`` is trusted after successful login; the exact ``mac`` token
    # and mac-auth-mode are forbidden because they delay the first portal.
    text, login_count = re.subn(
        r"login-by=[^\s`\"]+(?:\s+mac-auth-mode=mac-as-username-and-password)?",
        FINAL_LOGIN_BY,
        text,
    )
    text = text.replace(" mac-auth-mode=mac-as-username-and-password", "")
    if login_count < 1:
        raise RuntimeError("MikroTik HotSpot login-by command is missing.")
    text = text.replace(
        f"{FINAL_LOGIN_BY} split-user-domain=",
        f"{FINAL_LOGIN_BY} http-cookie-lifetime=30d split-user-domain=",
    )

    # Client DNS must pass through the gateway so business.wifi and captive
    # detection cannot be bypassed by public resolvers advertised through DHCP.
    text = re.sub(
        r"dns-server=\$\{gatewayIp\}(?:,1\.1\.1\.1,8\.8\.8\.8|,8\.8\.8\.8,1\.1\.1\.1)",
        "dns-server=${gatewayIp}",
        text,
    )

    # Core AROFi API must load before authentication.
    if "AROFi core portal" not in text:
        marker = "      ...this.buildWalledGarden(input.portalHosts ?? []),\n"
        if marker not in text:
            raise RuntimeError("Core AROFi walled-garden insertion point is missing.")
        text = text.replace(
            marker,
            marker
            + '      `/ip hotspot walled-garden remove [find comment="AROFi core portal"]`,\n'
            + '      `/ip hotspot walled-garden add dst-host="arofi.net" action=allow comment="AROFi core portal"`,\n',
            1,
        )

    # Canonicalize both default and all-profile commands. Stop before the source
    # template backtick so TypeScript syntax cannot be consumed by the regex.
    profile_pattern = re.compile(
        r"shared-users=1\s+add-mac-cookie=yes\s+mac-cookie-timeout=[^\s`,]+"
        r"(?:\s+idle-timeout=[^\s`,]+)?"
        r"(?:\s+keepalive-timeout=[^\s`,]+)?"
        r"(?:\s+session-timeout=[^\s`,]+)?"
        r"(?=[^`\r\n]*`)"
    )
    text, profile_count = profile_pattern.subn(FINAL_PROFILE, text)
    if profile_count < 2:
        raise RuntimeError(
            "Expected default and all-profile MikroTik persistence commands; "
            f"normalized only {profile_count}."
        )

    MIKROTIK.write_text(text, encoding="utf-8")

    final = MIKROTIK.read_text(encoding="utf-8")
    normalized = final.replace('\\"', '"')
    required = (
        FINAL_LOGIN_BY,
        "http-cookie-lifetime=30d",
        "dns-server=${gatewayIp}`",
        'dst-host="arofi.net" action=allow comment="AROFi core portal"',
        FINAL_PROFILE,
    )
    for marker in required:
        if marker not in normalized:
            raise RuntimeError(f"Deterministic captive-flow marker missing: {marker}")

    login_values = re.findall(r"login-by=([^\s`\"']+)", normalized)
    for value in login_values:
        if "mac" in {part.strip().lower() for part in value.split(",")}:
            raise RuntimeError(
                f"Blocking automatic MAC authentication remains in login-by={value}"
            )
    if re.search(r"mac-auth-mode\s*=", normalized, flags=re.IGNORECASE):
        raise RuntimeError("mac-auth-mode remains in the provisioning generator")
    if "dns-server=${gatewayIp},1.1.1.1,8.8.8.8" in normalized:
        raise RuntimeError("HotSpot DHCP still advertises public DNS directly")
    for forbidden in ("idle-timeout=31d", "keepalive-timeout=30d", "mac-cookie-timeout=365d"):
        if forbidden in normalized:
            raise RuntimeError(f"Obsolete HotSpot timeout remains: {forbidden}")


def patch_voucher_qr_local_login() -> None:
    replace_once(
        VOUCHERS_MANAGER,
        """function getVoucherQrPortalUrl(code: string, dnsName?: string) {
  if (dnsName) {
    return `http://${dnsName}/login?voucher=${encodeURIComponent(code)}`
  }
  // Fallback
  const base =
    process.env.NEXT_PUBLIC_VOUCHER_QR_BASE_URL ||
    'https://arofi.net/portal'
  const normalized = base.replace(/\/$/, '')
  const separator = normalized.includes('?') ? '&' : '?'
  return `${normalized}${separator}voucher=${encodeURIComponent(code)}`
}
""",
        """function getVoucherQrPortalUrl(code: string, dnsName?: string) {
  void dnsName
  const base =
    process.env.NEXT_PUBLIC_VOUCHER_QR_LOCAL_LOGIN_URL ||
    'http://10.55.0.1/login'
  const normalized = base.replace(/\/$/, '')
  const loginBase = normalized.endsWith('/login') ? normalized : `${normalized}/login`
  return `${loginBase}?voucher=${encodeURIComponent(code.trim().toUpperCase())}`
}
""",
        "Admin voucher QR local-login helper",
    )

    replace_once(
        VOUCHERS_SERVICE,
        """  private buildVoucherPortalUrl(voucherCode: string, hotspotDomain?: string) {
    const baseUrl = hotspotDomain
      ? `http://${hotspotDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/login`
      : this.getVoucherQrBaseUrl()
    const separator = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${separator}voucher=${encodeURIComponent(voucherCode)}`
  }
""",
        """  private buildVoucherPortalUrl(voucherCode: string, hotspotDomain?: string) {
    void hotspotDomain
    const configuredBase = (
      process.env.VOUCHER_QR_LOCAL_LOGIN_URL ??
      'http://10.55.0.1/login'
    ).trim()
    const withProtocol = /^https?:\/\//i.test(configuredBase)
      ? configuredBase
      : `http://${configuredBase}`
    const normalized = withProtocol.replace(/\/$/, '')
    const loginBase = normalized.endsWith('/login') ? normalized : `${normalized}/login`
    return `${loginBase}?voucher=${encodeURIComponent(voucherCode.trim().toUpperCase())}`
  }
""",
        "API voucher QR local-login helper",
    )

    routing_text = VOUCHER_QR_ROUTING.read_text(encoding="utf-8")
    manager_text = VOUCHERS_MANAGER.read_text(encoding="utf-8")
    service_text = VOUCHERS_SERVICE.read_text(encoding="utf-8")

    for marker in ("VOUCHER_QR_LOCAL_LOGIN_URL", "http://10.55.0.1/login"):
        if marker not in routing_text or marker not in service_text:
            raise RuntimeError(f"Server voucher QR local-login marker missing: {marker}")

    for marker in ("NEXT_PUBLIC_VOUCHER_QR_LOCAL_LOGIN_URL", "http://10.55.0.1/login"):
        if marker not in manager_text:
            raise RuntimeError(f"Admin voucher QR local-login marker missing: {marker}")

    if "NEXT_PUBLIC_VOUCHER_QR_BASE_URL" in manager_text:
        raise RuntimeError("Admin voucher QR still accepts the obsolete public QR base URL")


def run_required_patch(filename: str) -> None:
    patch = ROOT / "scripts" / filename
    if not patch.exists():
        raise RuntimeError(f"Required MikroTik patch missing: {patch.relative_to(ROOT)}")
    runpy.run_path(str(patch), run_name="__main__")


def main() -> None:
    for path in (MIKROTIK, PORTAL_SERVICE, ADMIN):
        if not path.exists():
            raise RuntimeError(f"Required source file missing: {path.relative_to(ROOT)}")

    validate_foreground_install()
    validate_portal_reconnect()
    run_required_patch("refresh_mikrotik_portal_assets.py")
    run_required_patch("fix_sstp_remote_target.py")
    run_required_patch("fix_router_hardware_detection.py")
    patch_deterministic_captive_flow()
    patch_voucher_qr_local_login()

    print(
        "MikroTik foreground installer, trusted returning-device reconnect, no-idle active-bundle policy, "
        "pre-auth packages, local voucher QR, SSTP target and hardware detection verified."
    )


if __name__ == "__main__":
    main()
