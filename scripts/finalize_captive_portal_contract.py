#!/usr/bin/env python3
"""Finalize AROFi captive portal after all earlier build-time patches.

This final pass is intentionally narrow:
- preserve the original Smart-TV checkbox/MAC field/toggle;
- keep Smart TV and Already Bought side by side without rebuilding their DOM;
- make Already Bought reliably expand the phone/transaction recovery form;
- retry package context instead of leaving a permanently empty package list;
- allow the actual configured API host through the pre-auth walled garden;
- let login.html alone activate the custom portal;
- keep status.html invisible and never show Connected/Disconnect pages.
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

    # Base login.html already owns these elements. Reconstructing them in the
    # runtime wrapper previously broke the Smart-TV MAC field and recovery row.
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

    if "utility-row" in text:
        raise RuntimeError("CAPTIVE FINALIZER: obsolete Smart-TV/recovery DOM reconstruction remains")

    UI.write_text(text, encoding="utf-8")


def patch_mikrotik() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")

    # status.html is a compatibility fallback only; login.html is authoritative.
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

    # The captive page must reach the exact API host that generated it, including
    # dev.arofi.net in DEV.
    old_wg = '      `/ip hotspot walled-garden add dst-host="arofi.net" action=allow comment="AROFi core portal"`,\n'
    new_wg = (
        '      `/ip hotspot walled-garden add dst-host="arofi.net" action=allow comment="AROFi core portal"`,\n'
        '      `:do { /ip hotspot walled-garden remove [find comment="AROFi active API"] } on-error={}`,\n'
        '      `:do { /ip hotspot walled-garden add dst-host="${this.escape(this.normalizeHostForRouterOs(this.resolveApiBaseUrl()))}" action=allow comment="AROFi active API" } on-error={}`,\n'
    )
    if "AROFi active API" not in text:
        if old_wg not in text:
            raise RuntimeError("CAPTIVE FINALIZER: core walled-garden rule not found")
        text = text.replace(old_wg, new_wg, 1)

    # Never leave packages blank forever after a transient first context request.
    if "function load(attempt){" not in text:
        text = text.replace(
            "    function load(){\n",
            "    function load(attempt){\n      attempt=attempt||0;\n",
            1,
        )

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

    # 5xx is transient infrastructure failure, so use raw-IP fallback just like a
    # network error. 4xx stays authoritative.
    text = text.replace(
        "if(e.network){ajax(m,APIFB+p,d,function(fe,fr){if(!fe){cb(null,fr);return;}cb(fe||e);});return;}cb(e);",
        "if(e.network||(e.status&&e.status>=500)){ajax(m,APIFB+p,d,function(fe,fr){if(!fe){cb(null,fr);return;}cb(fe||e);});return;}cb(e);",
        1,
    )

    # Make Already Bought independent of fragile CSS/class-only toggling. This
    # explicitly opens the recovery form and focuses Phone/Transaction ID.
    old_toggle = """    function toggleFind(){
      document.getElementById('findPanel').classList.toggle('on');
    }
"""
    new_toggle = """    function toggleFind(){
      var p=document.getElementById('findPanel');
      if(!p)return;
      var opening=!p.classList.contains('on');
      p.classList.toggle('on',opening);
      p.style.setProperty('display',opening?'block':'none','important');
      if(opening)setTimeout(function(){var i=document.getElementById('rtxn');if(i)i.focus();},50);
    }
"""
    if new_toggle not in text:
        if old_toggle not in text:
            raise RuntimeError("CAPTIVE FINALIZER: Already Bought toggle function not found")
        text = text.replace(old_toggle, new_toggle, 1)

    # status.html must be invisible and immediately return control to the OS.
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

    # The onboarding guard immediately before this pass already normalizes the
    # API command to HTTPS-first. If an older source shape reaches this pass,
    # only swap when HTTP is actually before HTTPS; never flip a correct command.
    sig = re.search(
        r"  buildOneRunCommand\(registrationKey: string(?:, wanInterface\?: string \| null)?\) \{",
        text,
    )
    if sig:
        start = sig.start()
        end = text.find("  // VPS-side tunnel gateway", start)
        if end > start:
            block = text[start:end]
            https_token = 'url="${url}" check-certificate=no dst-path="arofi-setup.rsc" mode=https'
            http_token = 'url="${fallbackUrl}" dst-path="arofi-setup.rsc" mode=http'
            https_idx = block.find(https_token)
            http_idx = block.find(http_token)
            if https_idx >= 0 and http_idx >= 0 and http_idx < https_idx:
                block = block.replace(http_token, "__AROFI_HTTP__", 1)
                block = block.replace(https_token, http_token, 1)
                block = block.replace("__AROFI_HTTP__", https_token, 1)
            block = block.replace(":delay 4s;", ":delay 1s;")
            block = block.replace(":delay 5s }", ":delay 2s }")
            text = text[:start] + block + text[end:]

    require(text, 'id="vTvMode" onchange="toggleVoucherTv()"', "Smart-TV voucher checkbox")
    require(text, 'id="vTvMac"', "Smart-TV voucher MAC input")
    require(text, "function toggleVoucherTv(){", "Smart-TV toggle function")
    require(text, 'onclick="toggleFind()"', "Already Bought action")
    require(text, 'id="findPanel"', "Already Bought recovery panel")
    require(text, 'id="rtxn" placeholder="Phone number or Transaction ID"', "recovery input")
    require(text, "p.style.setProperty('display',opening?'block':'none','important');", "recovery panel explicit toggle")
    require(text, "function rec(){", "voucher recovery request")
    require(text, "AROFi active API", "active API walled-garden rule")
    require(text, "function load(attempt){", "resilient package-context loader")
    require(text, "Packages did not load. Tap to retry.", "customer package retry")
    require(text, '`:if ($arofiHtmlOk = 1) do={`,', "login-only custom portal gate")
    require(text, '<body style="visibility:hidden">', "invisible status fallback")

    if '$arofiHtmlOk = 1 && $arofiStatusOk = 1' in text:
        raise RuntimeError("CAPTIVE FINALIZER: status.html still gates custom portal activation")
    if ">Connected<" in text or ">Disconnect<" in text:
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
        require(ui, marker, "final compact Smart-TV/recovery layout")

    if "utility-row" in ui:
        raise RuntimeError("CAPTIVE FINALIZER: obsolete TV/recovery DOM wrapper returned")

    for marker in (
        'id="vTvMode" onchange="toggleVoucherTv()"',
        'id="vTvMac"',
        'onclick="toggleFind()"',
        'id="rtxn" placeholder="Phone number or Transaction ID"',
        "p.style.setProperty('display',opening?'block':'none','important');",
        "AROFi active API",
        "function load(attempt){",
        "Packages did not load. Tap to retry.",
        '<body style="visibility:hidden">',
        '`:if ($arofiHtmlOk = 1) do={`,',
    ):
        require(mik, marker, "final captive contract")

    print(
        "CAPTIVE_FINAL_CONTRACT verified: Smart-TV MAC preserved, Already Bought expands recovery, "
        "packages retry automatically, active API host is pre-auth reachable, and status UI is invisible."
    )


def main() -> None:
    if not UI.exists() or not MIKROTIK.exists():
        raise RuntimeError("CAPTIVE FINALIZER: required source files are missing")
    patch_ui()
    patch_mikrotik()
    verify()


if __name__ == "__main__":
    main()
