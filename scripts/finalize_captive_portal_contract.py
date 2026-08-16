#!/usr/bin/env python3
"""Finalize the captive portal contract after all earlier source patches.

This patch is intentionally narrow and runs only at build time:
- preserves the original Smart-TV voucher checkbox + MAC input DOM and JS;
- lays Smart TV and Already Bought actions side by side with CSS only;
- keeps the Smart-TV MAC input visible below the action row when selected;
- makes custom login.html activation depend on login.html only, never status.html;
- serves status.html from the same invisible alogin endpoint used for seamless
  post-auth completion, so there is no customer-facing Connected page.

The script fails the build if any of these invariants cannot be proven.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "apps/api/src/modules/routers/router-captive-ui-v3.initializer.ts"
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise RuntimeError(f"CAPTIVE FINALIZER: missing {label}: {marker}")


def patch_ui() -> None:
    text = UI.read_text(encoding="utf-8")

    # Never reconstruct/move the TV DOM at runtime. The base login.html already
    # has the correct structure and toggleVoucherTv() behavior. Rebuilding that
    # block caused the TV MAC input regression.
    old_open = '''    html = html.replace(\n      '<div class="tv-voucher" id="tvVoucherBox">',\n      '<div class="utility-row"><div class="tv-voucher" id="tvVoucherBox">',\n    )\n'''
    old_close = '''    html = html.replace(\n      '      </div>\\n      <div class="find-panel" id="findPanel">',\n      '      </div>\\n      </div>\\n      <div class="find-panel" id="findPanel">',\n    )\n'''
    text = text.replace(old_open, "")
    text = text.replace(old_close, "")

    old_css = '.utility-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px;margin-top:7px;align-items:start}.utility-row .tv-voucher,.utility-row .find-wrap{margin:0!important;min-width:0!important}.utility-row .tv-voucher{padding:0!important;border:0!important;background:transparent!important}.utility-row .tv-voucher label,.utility-row .find-link{width:100%!important;min-height:38px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;margin:0!important;padding:8px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important;color:#1d4ed8!important;font-size:11px!important;font-weight:800!important;line-height:1.1!important;text-align:center!important;box-shadow:none!important}.utility-row .tv-voucher input[type=checkbox]{width:14px!important;height:14px!important}.utility-row .tv-voucher.on{grid-column:1/-1!important}.utility-row .tv-voucher.on .tv-mac-wrap{margin-top:7px!important}.find-panel{margin-top:7px!important;border-color:#e5e7eb!important;border-radius:10px!important;padding:9px!important;box-shadow:none!important}'
    new_css = '#content{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:7px;align-items:start}#content>.quick-row,#content>.find-panel,#content>.section-label,#content>.section-sub,#content>.pkgs,#content>.tv-section,#content>#multiSection,#content>.accept,#content>.support,#content>.tech,#content>#trialSection{grid-column:1/-1}.tv-voucher{display:contents!important}.tv-voucher>label{grid-column:1;width:100%!important;min-height:38px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;margin:7px 0 0!important;padding:8px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important;color:#1d4ed8!important;font-size:11px!important;font-weight:800!important;line-height:1.1!important;text-align:center!important;box-shadow:none!important}.tv-voucher input[type=checkbox]{width:14px!important;height:14px!important}.tv-voucher .tv-mac-wrap{grid-column:1/-1;display:none!important;margin:7px 0 0!important}.tv-voucher.on .tv-mac-wrap{display:block!important}.tv-voucher .tv-mac-wrap input{width:100%!important}.find-wrap{grid-column:2;margin:7px 0 0!important;min-width:0!important}.find-link{width:100%!important;min-height:38px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;margin:0!important;padding:8px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important;color:#1d4ed8!important;font-size:11px!important;font-weight:800!important;line-height:1.1!important;text-align:center!important;box-shadow:none!important}.find-panel{grid-column:1/-1;margin-top:7px!important;border-color:#e5e7eb!important;border-radius:10px!important;padding:9px!important;box-shadow:none!important}'

    if old_css in text:
        text = text.replace(old_css, new_css)
    elif new_css not in text:
        raise RuntimeError("CAPTIVE FINALIZER: compact utility CSS marker not found")

    # Mobile CSS from the first compact pass still referenced the removed wrapper.
    text = text.replace(
        '.utility-row{gap:5px}.utility-row .tv-voucher label,.utility-row .find-link{font-size:10px!important;padding:7px 5px!important}',
        '#content{column-gap:5px}.tv-voucher>label,.find-link{font-size:10px!important;padding:7px 5px!important}',
    )

    if 'utility-row' in text:
        raise RuntimeError("CAPTIVE FINALIZER: obsolete utility-row DOM surgery remains")

    UI.write_text(text, encoding="utf-8")


def patch_mikrotik() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")

    # status.html is only an invisible fallback. Fetch the known-good alogin
    # endpoint for both files instead of depending on the separate status route.
    text = text.replace(
        'const statusHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/status-html/${this.escape(registrationKey)}`',
        'const statusHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/alogin-html/${this.escape(registrationKey)}`',
    )
    text = text.replace(
        'const fallbackStatusHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/status-html/${this.escape(registrationKey)}`',
        'const fallbackStatusHtmlUrl = `${this.resolveHttpCallbackBaseUrl()}/api/mikrotik/alogin-html/${this.escape(registrationKey)}`',
    )

    # login.html is the only file that may gate activation of the custom portal.
    # A transient status/aloggoin fetch failure must never revert customers to
    # MikroTik's stock login page.
    text = text.replace(
        '`:if ($arofiHtmlOk = 1 && $arofiStatusOk = 1) do={`,',
        '`:if ($arofiHtmlOk = 1) do={`,',
    )
    text = text.replace(
        '`:put "AROFi: keeping default MikroTik login page (html install incomplete)."`,',
        '`:put "AROFi: keeping default MikroTik login page because login.html install failed."`,',
    )
    text = text.replace(
        '`:put "WARNING: status.html install FAILED - post-login page will need a manual tap."`,',
        '`:put "AROFi: optional invisible status fallback was not installed; alogin.html will handle completion."`,',
    )

    require(text, 'id="vTvMode" onchange="toggleVoucherTv()"', "Smart-TV voucher checkbox")
    require(text, 'id="vTvMac"', "Smart-TV voucher MAC input")
    require(text, "function toggleVoucherTv(){", "Smart-TV toggle function")
    require(text, "document.getElementById('tvVoucherBox').classList.toggle('on',on);", "Smart-TV class toggle")
    require(text, '/api/mikrotik/alogin-html/${this.escape(registrationKey)}', "invisible status/aloggoin endpoint")
    require(text, '`:if ($arofiHtmlOk = 1) do={`,', "login-only custom portal gate")

    if '$arofiHtmlOk = 1 && $arofiStatusOk = 1' in text:
        raise RuntimeError("CAPTIVE FINALIZER: status.html still gates custom portal activation")

    MIKROTIK.write_text(text, encoding="utf-8")


def verify() -> None:
    ui = UI.read_text(encoding="utf-8")
    mik = MIKROTIK.read_text(encoding="utf-8")

    for marker in (
        '.tv-voucher{display:contents!important}',
        '.tv-voucher.on .tv-mac-wrap{display:block!important}',
        '.find-wrap{grid-column:2',
    ):
        require(ui, marker, "final compact TV layout")

    for marker in (
        'id="vTvMode" onchange="toggleVoucherTv()"',
        'id="vTvMac"',
        'function toggleVoucherTv(){',
        'const statusHtmlUrl = `${this.resolveApiBaseUrl()}/api/mikrotik/alogin-html/',
        '`:if ($arofiHtmlOk = 1) do={`,',
    ):
        require(mik, marker, "final captive contract")

    print(
        "CAPTIVE_FINAL_CONTRACT verified: TV MAC flow preserved, Smart TV + recovery are compact, "
        "status.html cannot block login.html, and post-auth completion remains invisible."
    )


def main() -> None:
    if not UI.exists() or not MIKROTIK.exists():
        raise RuntimeError("CAPTIVE FINALIZER: required source files are missing")
    patch_ui()
    patch_mikrotik()
    verify()


if __name__ == "__main__":
    main()
