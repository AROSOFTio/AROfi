#!/usr/bin/env python3
# Keep MikroTik onboarding alive when a MAC-WinBox session is interrupted while
# preserving the tenant-local hotspot login URL returned by the API.

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
PORTAL_SERVICE = ROOT / "apps/api/src/modules/portal/portal.service.ts"
ADMIN = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"

SENTINEL = "AROFi installation continues in background"
RECONNECT_SENTINEL = "const reconnectLoginUrl = requestedLoginUrl"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one target, found {count}")
    return text.replace(old, new, 1)


def patch_mikrotik(text: str) -> str:
    if SENTINEL in text:
        return text

    old = (
        "        ':local f [/file find name=\\\"arofi-setup.rsc\\\"]; :if ([:len $f]>0) do={ "
        ":local sz [/file get $f size]; :if ($sz > 0) do={ :put \\\"AROFi setup downloaded. Installing...\\\"; "
        ":delay 2s; /import file-name=\\\"arofi-setup.rsc\\\"; :delay 1s; /file remove \\\"arofi-setup.rsc\\\"; "
        ":put \\\"AROFi setup installed.\\\" } else={ :put \\\"ERROR: AROFi setup file is empty. "
        "Re-paste when WAN is stable.\\\"; /file remove $f } } else={ :put \\\"ERROR: AROFi setup file was "
        "not downloaded. Re-paste when WAN is stable.\\\" } ' +"
    )

    new = (
        "        ':local f [/file find name=\\\"arofi-setup.rsc\\\"]; :if ([:len $f]>0) do={ "
        ":local sz [/file get $f size]; :if ($sz > 0) do={ ' +\n"
        "          ':put \\\"AROFi setup downloaded. Starting background installation...\\\"; ' +\n"
        "          ':local arofiInstall [:parse \\\":execute { :delay 3s; :do { /import "
        "file-name=arofi-setup.rsc } on-error={ :log error AROFi_setup_import_failed }; :delay 2s; "
        ":do { /file remove arofi-setup.rsc } on-error={}; :log info AROFi_setup_installed }\\\"]; ' +\n"
        "          ':do { $arofiInstall; :put \\\"AROFi installation continues in background. MAC WinBox may "
        "disconnect while bridge ports change.\\\"; :put \\\"Do not paste the command again. Wait 30 seconds, "
        "reconnect, then check the router in AROFi.\\\" } on-error={ :put \\\"Background execution unavailable; "
        "installing in this session...\\\"; /import file-name=\\\"arofi-setup.rsc\\\"; :delay 1s; /file remove "
        "\\\"arofi-setup.rsc\\\"; :put \\\"AROFi setup installed.\\\" } ' +\n"
        "        '} else={ :put \\\"ERROR: AROFi setup file is empty. Re-paste when WAN is stable.\\\"; "
        "/file remove $f } } else={ :put \\\"ERROR: AROFi setup file was not downloaded. Re-paste when WAN is "
        "stable.\\\" } ' +"
    )

    updated = replace_once(text, old, new, "MikroTik background import")
    if SENTINEL not in updated:
        raise RuntimeError("MikroTik background import sentinel missing after patch")
    return updated


def patch_portal_service(text: str) -> str:
    if RECONNECT_SENTINEL in text:
        return text

    old = """    return {
      loginUrl: loginUrl || process.env.HOTSPOT_LOGIN_URL || 'http://10.55.0.1/login',
      username,
      password,
      method: 'mikrotik-hotspot-post',
    }
"""
    new = """    const requestedLoginUrl =
      loginUrl || process.env.HOTSPOT_LOGIN_URL || 'http://10.55.0.1/login'
    const reconnectLoginUrl = requestedLoginUrl

    return {
      loginUrl: reconnectLoginUrl,
      username,
      password,
      method: 'mikrotik-hotspot-post',
    }
"""
    updated = replace_once(text, old, new, "local DNS voucher reconnect URL")
    if RECONNECT_SENTINEL not in updated or "loginUrl: reconnectLoginUrl" not in updated:
        raise RuntimeError("Portal reconnect payload did not preserve its hotspot login URL")
    return updated


def patch_admin(text: str) -> str:
    old = (
        "Plug the ISP cable into that port and use another port or MAC WinBox while running setup. "
        "AROFi restores the bridge membership and stops before HotSpot changes when the selected "
        "port cannot obtain internet."
    )
    new = (
        "Plug the ISP cable into that port and use IP WinBox or WebFig from another port when possible. "
        "A MAC WinBox session can disconnect when bridge membership changes, but AROFi continues the "
        "installation in the background. AROFi restores the bridge membership and stops before HotSpot "
        "changes when the selected port cannot obtain internet."
    )
    if new in text:
        return text
    return replace_once(text, old, new, "MikroTik onboarding warning")


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

    print("MikroTik background installer and local hotspot reconnect URL applied.")


if __name__ == "__main__":
    main()
