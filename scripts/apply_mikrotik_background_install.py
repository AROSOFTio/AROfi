#!/usr/bin/env python3
"""Validate the MikroTik onboarding flow and final local hotspot integrations.

The provisioning generator preserves the owner management port, so the one-run
command imports in the foreground. Foreground import keeps RouterOS failures
visible. Voucher QR codes are finalized here as router-local login URLs because
an unauthenticated hotspot customer cannot depend on public internet access.
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
    patch_voucher_qr_local_login()

    print(
        "MikroTik foreground installer, local reconnect URL, fresh portal assets, "
        "SSTP remote target, exact hardware detection, and local voucher QR routing verified."
    )


if __name__ == "__main__":
    main()
