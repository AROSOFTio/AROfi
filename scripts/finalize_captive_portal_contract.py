#!/usr/bin/env python3
"""Finalize AROFi captive portal after all earlier build-time patches.

This is deliberately idempotent and conservative. It fixes the last-mile
customer experience without depending on a particular intermediate patch shape:
- preserve the original Smart-TV checkbox + MAC field/toggle JS;
- lay Smart TV and Already Bought side by side with CSS only;
- keep package controls visible while context hydrates, but retry context instead
  of giving up permanently after one transient captive-network failure;
- allow the *actual* configured API host (dev.arofi.net in DEV, arofi.net in prod)
  through the MikroTik walled garden before authentication;
- let login.html alone activate the custom portal; status.html is optional;
- make status.html an invisible OS-connectivity completion page, never a visible
  Connected/Disconnect screen;
- prefer HTTPS first in the one-run bootstrap so healthy installs do not waste
  time on an HTTP attempt that is commonly blocked/redirected.

The build fails only when a final customer-facing invariant cannot be proven.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "apps/api/src/modules/routers/router-captive-ui-v3.initializer.ts"
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise RuntimeError(f"CAPTIVE FINALIZER: missing {label}: {marker}")


def patch_ui() -> None:
    text = UI.read_text(encoding="utf-8")

    # The base login HTML already owns the TV checkbox, vTvMac input and
    # toggleVoucherTv(). Never rebuild/move that DOM with string surgery.
    text = text.replace(
        '''    html = html.replace(\n      '<div class="tv-voucher" id="tvVoucherBox">',\n      '<div class="utility-row"><div class="tv-voucher" id="tvVoucherBox">',\n    )\n''',
        "",
    )
    text = text.replace(
        '''    html = html.replace(\n      '      </div>\\n      <div class="find-panel" id="findPanel">',\n      '      </div>\\n      </div>\\n      <div class="find-panel" id="findPanel">',\n    )\n''',
        "",
    )

    old_css = '.utility-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px;margin-top:7px;align-items:start}.utility-row .tv-voucher,.utility-row .find-wrap{margin:0!important;min-width:0!important}.utility-row .tv-voucher{padding:0!important;border:0!important;background:transparent!important}.utility-row .tv-voucher label,.utility-row .find-link{width:100%!important;min-height:38px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;margin:0!important;padding:8px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important;color:#1d4ed8!important;font-size:11px!important;font-weight:800!important;line-height:1.1!important;text-align:center!important;box-shadow:none!important}.utility-row .tv-voucher input[type=checkbox]{width:14px!important;height:14px!important}.utility-row .tv-voucher.on{grid-column:1/-1!important}.utility-row .tv-voucher.on .tv-mac-wrap{margin-top:7px!important}.find-panel{margin-top:7px!important;border-color:#e5e7eb!important;border-radius:10px!important;padding:9px!important;box-shadow:none!important}'
    new_css = '#content{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:7px;align-items:start}#content>.quick-row,#content>.find-panel,#content>.section-label,#content>.section-sub,#content>.pkgs,#content>.tv-section,#content>#multiSection,#content>.accept,#content>.support,#content>.tech,#content>#trialSection{grid-column:1/-1}.tv-voucher{display:contents!important}.tv-voucher>label{grid-column:1;width:100%!important;min-height:38px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;margin:7px 0 0!important;padding:8px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important;color:#1d4ed8!important;font-size:11px!important;font-weight:800!important;line-height:1.1!important;text-align:center!important;box-shadow:none!important}.tv-voucher input[type=checkbox]{width:14px!important;height:14px!important}.tv-voucher .tv-mac-wrap{grid-column:1/-1;display:none!important;margin:7px 0 0!important}.tv-voucher.on .tv-mac-wrap{display:block!important}.tv-voucher .tv-mac-wrap input{width:100%!important}.find-wrap{grid-column:2;margin:7px 0 0!important;min-width:0!important}.find-link{width:100%!important;min-height:38px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;margin:0!important;padding:8px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important;color:#1d4ed8!important;font-size:11px!important;font-weight:800!important;line-height:1.1!important;text-align:center!important;box-shadow:none!important}.find-panel{grid-column:1/-1;margin-top:7px!important;border-color:#e5e7eb!important;border-radius:10px!important;padding:9px!important;box-shadow:none!important}'
    if old_css in text:
        text = text.replace(old_css, new_css)
    elif new_css not in text:
        raise RuntimeError("CAPTIVE FINALIZER: compact Smart-TV/recovery CSS marker not found")

    text = text.replace(
        '.utility-row{gap:5px}.utility-row .tv-voucher label,.utility-row .find-link{font-size:10px!important;padding:7px 5px!important}',
        '#content{column-gap:5px}.tv-voucher>label,.find-link{font-size:10px!important;padding:7px 5px!important}',
    )

    if 'utility-row' in text:
        raise RuntimeError("CAPTIVE FINALIZER: obsolete Smart-TV DOM reconstruction remains")

    UI.write_text(text, encoding="utf-8")


def patch_mikrotik() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")

    # Custom login must not be disabled just because the optional status page
    # had a transient fetch failure. alogin.html handles the normal success path.
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
        '`:put "AROFi: optional invisible status fallback was not installed; alogin.html handles normal completion."`,',
    )

    # Always allow the exact API host used to generate login.html. Hardcoding only
    # arofi.net breaks DEV because the page calls https://dev.arofi.net before auth.
    old_wg = '      `/ip hotspot walled-garden add dst-host="arofi.net" action=allow comment="AROFi core portal"`,\n'
    new_wg = (
        '      `/ip hotspot walled-garden add dst-host="arofi.net" action=allow comment="AROFi core portal"`,\n'
        '      `:do { /ip hotspot walled-garden remove [find comment="AROFi active API"] } on-error={}`,\n'
        '      `:do { /ip hotspot walled-garden add dst-host="${this.escape(this.normalizeHostForRouterOs(this.resolveApiBaseUrl()))}" action=allow comment="AROFi active API" } on-error={}`,\n'
    )
    if 'AROFi active API' not in text:
        if old_wg not in text:
            raise RuntimeError("CAPTIVE FINALIZER: core walled-garden rule not found")
        text = text.replace(old_wg, new_wg, 1)

    # First captive API call can fail while Android/iOS is switching from probe
    # traffic into the captive webview. Never leave a permanently empty package
    # list after that one transient failure: retry quickly, then present a tap-to-
    # retry Wi-Fi loader instead of silently giving up.
    if 'function load(attempt){' not in text:
        text = text.replace('    function load(){\n', '    function load(attempt){\n      attempt=attempt||0;\n', 1)

    old_context_error = """        if(err){
          document.getElementById('tname').textContent='AROFi Hotspot';
          document.getElementById('loading').style.display='none';
          document.getElementById('content').style.display='block';
          return;
        }
"""
    new_context_error = """        if(err){
          document.getElementById('tname').textContent='AROFi Hotspot';
          document.getElementById('content').style.display='block';
          if(attempt<8){
            document.getElementById('loading').style.display='block';
            setTimeout(function(){load(attempt+1);},250+(attempt*150));
            return;
          }
          var loading=document.getElementById('loading');
          loading.style.display='block';
          loading.style.cursor='pointer';
          var lp=loading.querySelector('p');if(lp)lp.textContent='Packages did not load. Tap to retry.';
          loading.onclick=function(){loading.onclick=null;var p=loading.querySelector('p');if(p)p.textContent='Loading packages...';load(0);};
          return;
        }
"""
    if new_context_error not in text:
        if old_context_error not in text:
            raise RuntimeError("CAPTIVE FINALIZER: portal context error block not found")
        text = text.replace(old_context_error, new_context_error, 1)

    # If ingress returns a transient 5xx, try the direct fallback just as we do
    # for network errors. Do not fallback on validation/auth 4xx responses.
    text = text.replace(
        "if(e.network){ajax(m,APIFB+p,d,function(fe,fr){if(!fe){cb(null,fr);return;}cb(fe||e);});return;}cb(e);",
        "if(e.network||(e.status&&e.status>=500)){ajax(m,APIFB+p,d,function(fe,fr){if(!fe){cb(null,fr);return;}cb(fe||e);});return;}cb(e);",
        1,
    )

    # The status file is a compatibility fallback only. It must be invisible and
    # immediately hand control back to the OS connectivity probe; never render a
    # Connected/Disconnect customer page.
    visible_status = '''<body>
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:40px 16px;color:#0f172a">
    <div style="font-size:22px;font-weight:800;margin-bottom:8px">Connected</div>
    <div style="font-size:14px;color:#475569">You can close this page now and return to the WiFi network.</div>
  </div>
</body>'''
    invisible_status = '''<body style="visibility:hidden">
  <script>
    (function(){
      try{window.close();}catch(e){}
      var ua=navigator.userAgent||'';
      var target=/Windows/i.test(ua)?'http://www.msftconnecttest.com/connecttest.txt':(/iPhone|iPad|Macintosh/i.test(ua)?'http://captive.apple.com/hotspot-detect.html':'http://connectivitycheck.gstatic.com/generate_204');
      try{location.replace(target);}catch(e){location.href=target;}
    })();
  </script>
</body>'''
    text = text.replace(visible_status, invisible_status)

    # Healthy routers should try HTTPS first. HTTP remains a last-resort fallback
    # for old/clock-broken environments instead of causing a visible failed fetch
    # before every successful installation.
    start = text.find('  buildOneRunCommand(registrationKey: string) {')
    end = text.find('  // VPS-side tunnel gateway', start)
    if start >= 0 and end > start:
        block = text[start:end]
        https_token = 'url="${url}" check-certificate=no dst-path="arofi-setup.rsc" mode=https'
        http_token = 'url="${fallbackUrl}" dst-path="arofi-setup.rsc" mode=http'
        if https_token in block and http_token in block:
            block = block.replace(http_token, '__AROFI_HTTPS_FIRST__', 1)
            block = block.replace(https_token, http_token, 1)
            block = block.replace('__AROFI_HTTPS_FIRST__', https_token, 1)
            block = block.replace(':delay 4s;', ':delay 1s;')
            block = block.replace(':delay 5s }', ':delay 2s }')
            text = text[:start] + block + text[end:]

    # Final source-level invariants.
    require(text, 'id="vTvMode" onchange="toggleVoucherTv()"', "Smart-TV voucher checkbox")
    require(text, 'id="vTvMac"', "Smart-TV voucher MAC input")
    require(text, "function toggleVoucherTv(){", "Smart-TV toggle function")
    require(text, "document.getElementById('tvVoucherBox').classList.toggle('on',on);", "Smart-TV class toggle")
    require(text, 'AROFi active API', "active API walled-garden rule")
    require(text, 'function load(attempt){', "resilient package-context loader")
    require(text, 'Packages did not load. Tap to retry.', "customer package retry")
    require(text, '`:if ($arofiHtmlOk = 1) do={`,', "login-only custom portal gate")
    require(text, '<body style="visibility:hidden">', "invisible status fallback")

    if '$arofiHtmlOk = 1 && $arofiStatusOk = 1' in text:
        raise RuntimeError("CAPTIVE FINALIZER: status.html still gates custom portal activation")
    if '>Connected<' in text or '>Disconnect<' in text:
        raise RuntimeError("CAPTIVE FINALIZER: customer-facing post-auth status UI remains")

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

    if 'utility-row' in ui:
        raise RuntimeError("CAPTIVE FINALIZER: TV/recovery DOM wrapper returned")

    for marker in (
        'id="vTvMode" onchange="toggleVoucherTv()"',
        'id="vTvMac"',
        'function toggleVoucherTv(){',
        'AROFi active API',
        'function load(attempt){',
        'Packages did not load. Tap to retry.',
        '<body style="visibility:hidden">',
        '`:if ($arofiHtmlOk = 1) do={`,',
    ):
        require(mik, marker, "final captive contract")

    print(
        "CAPTIVE_FINAL_CONTRACT verified: TV MAC preserved, packages retry automatically, "
        "active API host is pre-auth reachable, status UI is invisible, and login.html is authoritative."
    )


def main() -> None:
    if not UI.exists() or not MIKROTIK.exists():
        raise RuntimeError("CAPTIVE FINALIZER: required source files are missing")
    patch_ui()
    patch_mikrotik()
    verify()


if __name__ == "__main__":
    main()
