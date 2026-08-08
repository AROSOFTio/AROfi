#!/usr/bin/env python3
"""Validate the current MikroTik onboarding flow without brittle source rewrites.

The provisioning generator now preserves the owner management port, so the
one-run command should import in the foreground. Foreground import is
intentional: RouterOS errors remain visible and a failed import retains the
downloaded file for diagnosis. The portal reconnect payload must preserve a
router-provided local ``*.wifi`` login URL and use 10.55.0.1 only as fallback.
"""

from pathlib import Path
import runpy


ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
PORTAL_SERVICE = ROOT / "apps/api/src/modules/portal/portal.service.ts"
ADMIN = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"

BACKGROUND_SENTINEL = "AROFi installation continues in background"
FOREGROUND_IMPORT_MARKERS = (
    r'/import file-name=\"arofi-setup.rsc\"',
    '/import file-name="arofi-setup.rsc"',
)
LOCAL_LOGIN_MARKERS = (
    "loginUrl: loginUrl || process.env.HOTSPOT_LOGIN_URL || 'http://10.55.0.1/login'",
    "const reconnectLoginUrl = requestedLoginUrl",
)


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

    print(
        "MikroTik foreground installer, local reconnect URL, fresh portal assets, "
        "SSTP remote target, and exact hardware detection verified."
    )


if __name__ == "__main__":
    main()
