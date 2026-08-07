#!/usr/bin/env python3
# Keep MikroTik onboarding alive when a MAC-WinBox session is interrupted.
#
# Fresh captive setup intentionally moves LAN/Wi-Fi interfaces onto the AROFi
# hotspot bridge. A MAC-WinBox session using one of those interfaces can drop at
# that exact point. Run the downloaded .rsc import as a RouterOS background job
# so configuration continues after the operator's Layer-2 session ends.

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
ADMIN = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"

SENTINEL = "AROFi installation continues in background"


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
    for path, patcher in ((MIKROTIK, patch_mikrotik), (ADMIN, patch_admin)):
        if not path.exists():
            raise RuntimeError(f"Required source file missing: {path.relative_to(ROOT)}")
        original = path.read_text(encoding="utf-8")
        updated = patcher(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")

    print("MikroTik background installer and MAC-WinBox warning applied.")


if __name__ == "__main__":
    main()
