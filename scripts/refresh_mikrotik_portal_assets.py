#!/usr/bin/env python3
"""Force every MikroTik onboarding run to install fresh captive-portal files.

The hEX is the HotSpot gateway for external bridge-mode APs. Reusing the same
portal download URL and leaving old router files in place allows RouterOS,
reverse proxies, or captive mini-browsers to keep showing a previous portal.
This patch adds cache-busting download URLs, no-cache response headers, removes
old router portal files before download, and embeds no-cache directives in the
router-hosted login and status pages themselves.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
CONTROLLER = ROOT / "apps/api/src/modules/routers/mikrotik.controller.ts"


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


def replace_expected(
    path: Path,
    old: str,
    new: str,
    label: str,
    expected_total: int,
) -> None:
    """Replace every unpatched occurrence while accepting partially patched files."""
    text = path.read_text(encoding="utf-8")
    old_count = text.count(old)
    new_count = text.count(new)
    if old_count + new_count != expected_total:
        raise RuntimeError(
            f"{path.relative_to(ROOT)}: expected {expected_total} total {label} "
            f"blocks, found old={old_count}, new={new_count}."
        )
    if old_count == 0:
        return
    path.write_text(text.replace(old, new), encoding="utf-8")


def ensure_portal_file_cleanup() -> None:
    """Support both legacy fixed paths and the RouterOS 6/7 dynamic portal path.

    Newer provisioning code chooses ``flash/hotspot`` on RouterOS 6 when flash
    storage is present and therefore removes files through ``$arofiLoginPath``
    and ``$arofiStatusPath``. That is already stronger than the old hard-coded
    cleanup this patch used to inject, so treat it as an already-patched state
    instead of failing the entire Docker build.
    """
    text = MIKROTIK.read_text(encoding="utf-8")
    dynamic_markers = (
        ':local arofiLoginPath ($arofiPortalDir . "/login.html")',
        ':local arofiStatusPath ($arofiPortalDir . "/status.html")',
        ':do { /file remove [find name=$arofiLoginPath] } on-error={}',
        ':do { /file remove [find name=$arofiStatusPath] } on-error={}',
    )
    if all(marker in text for marker in dynamic_markers):
        return

    replace_once(
        MIKROTIK,
        """      `:do { /file add name=\"hotspot\" type=directory } on-error={}`,
      `:local arofiHtmlOk 0`,
""",
        """      `:do { /file add name=\"hotspot\" type=directory } on-error={}`,
      `:do { /file remove [find name=\"hotspot/login.html\"] } on-error={}`,
      `:do { /file remove [find name=\"hotspot/status.html\"] } on-error={}`,
      `:local arofiHtmlOk 0`,
""",
        "old portal-file cleanup block",
    )


# Generate a new URL on every provisioning-script request so no proxy or router
# can reuse yesterday's login/status response.
replace_once(
    MIKROTIK,
    """    const loginHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const fallbackLoginHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}`
    const statusHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/status-html/${this.escape(registrationKey)}`
    const fallbackStatusHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/status-html/${this.escape(registrationKey)}`
""",
    """    const portalAssetVersion = Date.now().toString(36)
    const loginHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}?v=${portalAssetVersion}`
    const fallbackLoginHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/login-html/${this.escape(registrationKey)}?v=${portalAssetVersion}`
    const statusHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/status-html/${this.escape(registrationKey)}?v=${portalAssetVersion}`
    const fallbackStatusHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/status-html/${this.escape(registrationKey)}?v=${portalAssetVersion}`
""",
    "portal asset URL block",
)

# Explicitly replace old files. RouterOS versions differ in how reliably a
# fetch to an existing dst-path overwrites the previous file. RouterOS 6/7
# dynamic portal-path provisioning already performs this cleanup itself.
ensure_portal_file_cleanup()

# Tell RouterOS and captive mini-browsers not to retain either page after it has
# been updated. There are intentionally two page renderers with this prefix:
# login.html and status.html. Older code assumed only one and broke every
# Docker/Coolify build as soon as status.html was added.
replace_expected(
    MIKROTIK,
    """    return `
<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\">
""",
    """    return `
$(if http-header == "Cache-Control")no-store, no-cache, must-revalidate, max-age=0$(endif)
$(if http-header == "Pragma")no-cache$(endif)
$(if http-header == "Expires")0$(endif)
<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\">
  <meta http-equiv=\"Cache-Control\" content=\"no-store, no-cache, must-revalidate, max-age=0\">
  <meta http-equiv=\"Pragma\" content=\"no-cache\">
  <meta http-equiv=\"Expires\" content=\"0\">
""",
    "portal page cache header",
    expected_total=2,
)

NO_CACHE = "  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')\n  @Header('Pragma', 'no-cache')\n  @Header('Expires', '0')\n"

for route, content_type in (
    ("script/:key", "text/plain"),
    ("login-html/:key", "text/html"),
    ("status-html/:key", "text/html"),
):
    old = f"  @Get('{route}')\n  @Header('Content-Type', '{content_type}')\n"
    new = old + NO_CACHE
    replace_once(CONTROLLER, old, new, f"{route} no-cache headers")

mikrotik_text = MIKROTIK.read_text(encoding="utf-8")
controller_text = CONTROLLER.read_text(encoding="utf-8")
required_mikrotik = (
    "const portalAssetVersion = Date.now().toString(36)",
    "hotspot/login.html",
    "hotspot/status.html",
)
for marker in required_mikrotik:
    if marker not in mikrotik_text:
        raise RuntimeError(f"Portal refresh marker missing: {marker}")

cache_header_marker = '$(if http-header == "Cache-Control")no-store, no-cache, must-revalidate, max-age=0$(endif)'
if mikrotik_text.count(cache_header_marker) != 2:
    raise RuntimeError("No-cache directives were not applied to both MikroTik portal pages.")

if controller_text.count("proxy-revalidate, max-age=0") < 3:
    raise RuntimeError("No-cache response headers were not applied to all MikroTik portal endpoints.")

print("MikroTik portal assets now purge old files and bypass router/browser caches.")
