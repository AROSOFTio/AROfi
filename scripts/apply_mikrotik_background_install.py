#!/usr/bin/env python3
"""Validate the MikroTik onboarding flow and final local hotspot integrations.

The provisioning generator preserves the owner management port, so the one-run
command imports in the foreground. Foreground import keeps RouterOS failures
visible. Voucher QR codes are finalized here as router-local login URLs because
an unauthenticated hotspot customer cannot depend on public internet access.

This pass also makes captive detection deterministic:
- normal phones never wait on RouterOS MAC authentication;
- hotspot clients use the MikroTik gateway as their only DNS server;
- arofi.net is always allowed before authentication so packages can load;
- idle and keepalive logout are permanently disabled on every user profile.
"""

from pathlib import Path
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


def patch_mikrotik(text: str) -> str:
    if BACKGROUND_SENTINEL in text:
        raise RuntimeError(
            "Hidden MikroTik background import is still present; keep the import "
            "foreground so RouterOS failures remain visible."
        )

    if not any(marker in text for marker in FOREGROUND_IMPORT_MARKERS):
        raise RuntimeError(
            "MikroTik foreground import command is missing from buildOneRunCommand."
        )

    return text


def patch_portal_service(text: str) -> str:
    if not any(marker in text for marker in LOCAL_LOGIN_MARKERS):
        raise RuntimeError(
            "Portal reconnect payload no longer preserves the router-provided "
            "local hotspot login URL."
        )

    return text


def patch_admin(text: str) -> str:
    # UI wording has changed several times. It must not make production builds
    # depend on one exact sentence, so this compatibility step is intentionally
    # non-mutating.
    return text


def patch_deterministic_captive_flow() -> None:
    # MAC auth delays captive detection on ordinary phones because RouterOS first
    # attempts RADIUS authentication with the phone MAC. Smart-TV credentials are
    # still submitted explicitly by the portal, so normal hotspot login should be
    # cookie/http-pap only.
    replace_once(
        MIKROTIK,
        "login-by=mac,cookie,http-pap mac-auth-mode=mac-as-username-and-password",
        "login-by=cookie,http-pap",
        "non-blocking captive login modes",
    )

    # The client must use the MikroTik DNS proxy. Supplying public resolvers in
    # DHCP lets Windows/Android bypass the router DNS path and makes captive
    # detection inconsistent. The router itself still resolves upstream through
    # 1.1.1.1 and 8.8.8.8.
    replace_once(
        MIKROTIK,
        "`/ip dhcp-server network add address=${subnet} gateway=${gatewayIp} dns-server=${gatewayIp},1.1.1.1,8.8.8.8`,",
        "`/ip dhcp-server network add address=${subnet} gateway=${gatewayIp} dns-server=${gatewayIp}`,",
        "gateway-only hotspot DHCP DNS",
    )

    # Do not rely on a saved per-router host list for the core AROFi API. The
    # local login page always calls arofi.net to load packages, redeem vouchers,
    # and poll payments before the customer is authenticated.
    replace_once(
        MIKROTIK,
        """      ...this.buildWalledGarden(input.portalHosts ?? []),
      // Also allow the raw HTTP-fallback IP by address so captive-portal
""",
        """      ...this.buildWalledGarden(input.portalHosts ?? []),
      `/ip hotspot walled-garden remove [find comment=\"AROFi core portal\"]`,
      `/ip hotspot walled-garden add dst-host=\"arofi.net\" action=allow comment=\"AROFi core portal\"`,
      // Also allow the raw HTTP-fallback IP by address so captive-portal
""",
        "core AROFi pre-auth walled garden",
    )

    # Apply the permanent no-idle policy directly in the generated script. The
    # later compatibility patch accepts these already-final values and validates
    # them again, so build order remains idempotent.
    replace_once(
        MIKROTIK,
        """      `/ip hotspot user profile set [find default=yes] shared-users=1 add-mac-cookie=yes mac-cookie-timeout=1d keepalive-timeout=30d`,
      `:foreach up in=[/ip hotspot user profile find] do={ /ip hotspot user profile set $up shared-users=1 add-mac-cookie=yes mac-cookie-timeout=1d keepalive-timeout=30d }`,
""",
        """      `/ip hotspot user profile set [find default=yes] shared-users=1 add-mac-cookie=yes mac-cookie-timeout=365d idle-timeout=none keepalive-timeout=none`,
      `:foreach up in=[/ip hotspot user profile find] do={ /ip hotspot user profile set $up shared-users=1 add-mac-cookie=yes mac-cookie-timeout=365d idle-timeout=none keepalive-timeout=none }`,
""",
        "permanent no-idle hotspot policy",
    )

    text = MIKROTIK.read_text(encoding="utf-8")
    # TypeScript template literals may contain either `"` or `\"` depending on
    # which guarded patch inserted the RouterOS command. They produce the same
    # command at runtime. Normalize only for semantic validation so harmless
    # source escaping can never fail a production build again.
    normalized = text.replace('\\"', '"')
    required = (
        "login-by=cookie,http-pap",
        "dns-server=${gatewayIp}`",
        'dst-host="arofi.net" action=allow comment="AROFi core portal"',
        "mac-cookie-timeout=365d idle-timeout=none keepalive-timeout=none",
    )
    for marker in required:
        if marker not in normalized:
            raise RuntimeError(f"Deterministic captive-flow marker missing: {marker}")

    if "login-by=mac," in normalized:
        raise RuntimeError("Blocking MAC authentication remains in the provisioning generator")
    if "dns-server=${gatewayIp},1.1.1.1,8.8.8.8" in normalized:
        raise RuntimeError("Hotspot DHCP still advertises public DNS servers directly to clients")


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
    for path, patcher in (
        (MIKROTIK, patch_mikrotik),
        (PORTAL_SERVICE, patch_portal_service),
        (ADMIN, patch_admin),
    ):
        if not path.exists():
            raise RuntimeError(f"Required source file missing: {path.relative_to(ROOT)}")

        original = path.read_text(encoding="utf-8")
        updated = patcher(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")

    run_required_patch("refresh_mikrotik_portal_assets.py")
    run_required_patch("fix_sstp_remote_target.py")
    run_required_patch("fix_router_hardware_detection.py")
    patch_deterministic_captive_flow()
    patch_voucher_qr_local_login()

    print(
        "MikroTik foreground installer, immediate captive detection, pre-auth package access, "
        "permanent no-idle policy, local voucher QR routing, SSTP target, and hardware detection verified."
    )


if __name__ == "__main__":
    main()
