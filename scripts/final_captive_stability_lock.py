#!/usr/bin/env python3
"""Final, idempotent stability lock for the proven MikroTik bootstrap + captive UI.

This script is intentionally executed only after the normal RouterOS build
patches have produced the final generated source. It has two responsibilities:

1. NEVER change the now-proven RouterOS installer/bootstrap. It only verifies
   the exact safety contract and fails the build if another patch changes it.
2. Remove the risky runtime DOM/JavaScript surgery from the compact captive UI
   wrapper and enforce the original base portal controls directly: Smart-TV MAC
   entry, Already Bought recovery, resilient package loading, and seamless
   RouterOS login. Visual compacting remains CSS-only.

The router bootstrap is treated as immutable here. Portal repair is deliberately
separate from installer logic so a future UI change cannot break RouterOS 6/7
onboarding again.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
UI = ROOT / "apps/api/src/modules/routers/router-captive-ui-v3.initializer.ts"


def fail(message: str) -> None:
    raise RuntimeError(f"FINAL CAPTIVE STABILITY LOCK REJECTED: {message}")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one target, found {count}")
    return text.replace(old, new, 1)


def lock_compact_wrapper() -> None:
    """Replace the V3 wrapper with CSS/text-only decoration.

    The original regression came from this wrapper rebuilding the Smart-TV /
    recovery DOM and rewriting large JavaScript functions with regexes. The base
    login HTML already has working controls, so the final wrapper is now forbidden
    from touching portal behavior.
    """

    text = UI.read_text(encoding="utf-8")
    marker = "  private applyCompactPortal(input: string) {"
    start = text.find(marker)
    class_close = text.rfind("\n}")
    if start < 0 or class_close <= start:
        fail("RouterCaptiveUiV3Initializer.applyCompactPortal() could not be isolated")

    safe_method = r'''  private applyCompactPortal(input: string) {
    let html = input
    if (!html || html.includes(UI_MARKER)) return html

    // Decoration only. Do not rebuild DOM nodes and do not rewrite captive JS.
    html = html.replace(
      '<div id="loading" class="spin-wrap"><div class="spinner"></div><p>Loading packages...</p></div>',
      '<div id="loading" class="spin-wrap"><div class="wifi-loader" aria-hidden="true"><i></i><i></i><i></i><b></b></div><p>Loading packages...</p></div>',
    )
    html = html.replace('id="content" style="display:none"', 'id="content" style="display:block"')
    html = html.replace('Connect voucher to a Smart TV', 'Smart TV')
    html = html.replace('Already bought? Find My Voucher', 'Already bought?')

    const css = `
<style id="arofi-captive-v3">
*{box-sizing:border-box}
body{background:#f6f8fb!important;color:#111827!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif!important;padding:10px 10px 22px!important}
.card{max-width:430px!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:16px!important;padding:14px!important;box-shadow:0 3px 14px rgba(15,23,42,.06)!important}
.hdr{min-height:68px!important;justify-content:center!important}.wifi-icon{width:42px!important;height:42px!important;margin:0 0 2px!important;color:#10b981!important}.wifi-icon svg{width:42px!important;height:42px!important}.title{font-size:14px!important;font-weight:800!important;letter-spacing:.045em!important;opacity:1!important;color:#2563eb!important;margin-top:0!important}
.spin-wrap{padding:7px 0 5px!important}.spinner{display:none!important}.wifi-loader{position:relative;width:34px;height:27px;margin:0 auto;color:#2563eb}.wifi-loader i{position:absolute;left:50%;bottom:5px;transform:translateX(-50%);border:2.5px solid transparent;border-top-color:currentColor;border-radius:50%;animation:arofiArc 1.05s ease-in-out infinite}.wifi-loader i:nth-child(1){width:31px;height:31px}.wifi-loader i:nth-child(2){width:22px;height:22px;animation-delay:.12s}.wifi-loader i:nth-child(3){width:13px;height:13px;animation-delay:.24s}.wifi-loader b{position:absolute;left:50%;bottom:2px;width:5px;height:5px;border-radius:50%;background:currentColor;transform:translateX(-50%)}@keyframes arofiArc{0%,100%{opacity:.18;transform:translateX(-50%) translateY(2px) scale(.94)}45%{opacity:1;transform:translateX(-50%) scale(1)}}.spin-wrap p{margin-top:7px!important;font-size:12px!important;color:#64748b!important}
#content{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:7px;align-items:start}
#content>.quick-row,#content>.find-panel,#content>.section-label,#content>.section-sub,#content>.pkgs,#content>.tv-section,#content>#multiSection,#content>.accept,#content>.support,#content>.tech,#content>#trialSection{grid-column:1/-1}
.quick-row{gap:7px!important;margin-top:10px!important}.quick-row input{background:#fff!important;border-color:#dbe1e8!important;border-radius:10px!important;padding:11px 12px!important;font-size:13px!important}.connect-btn{border-radius:10px!important;padding:11px 16px!important;font-size:13px!important;box-shadow:none!important}
#tvVoucherBox{grid-column:1;margin:7px 0 0!important;padding:8px!important;min-width:0!important;background:#fff!important;border:1px solid #e2e8f0!important;border-radius:10px!important}
#tvVoucherBox>label{min-height:22px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;color:#1d4ed8!important;font-size:11px!important;font-weight:800!important;line-height:1.1!important;text-align:center!important}
#tvVoucherBox input[type=checkbox]{width:14px!important;height:14px!important}#tvVoucherBox .tv-mac-wrap{display:none!important;margin-top:7px!important}#tvVoucherBox.on .tv-mac-wrap{display:block!important}#tvVoucherBox .tv-mac-wrap input{width:100%!important}
.find-wrap{grid-column:2;margin:7px 0 0!important;min-width:0!important;align-self:start!important}.find-link{width:100%!important;min-height:40px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;margin:0!important;padding:8px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important;color:#1d4ed8!important;font-size:11px!important;font-weight:800!important;line-height:1.1!important;text-align:center!important;box-shadow:none!important}.find-panel{grid-column:1/-1!important;margin-top:7px!important;border-color:#e5e7eb!important;border-radius:10px!important;padding:9px!important;box-shadow:none!important}.find-panel.on{display:block!important}
.section-label{font-size:12px!important;font-weight:700!important;color:#475569!important;margin-top:14px!important}.section-sub{font-size:10px!important;margin-top:3px!important}.pkgs{gap:7px!important;margin-top:9px!important}.pkg{gap:8px!important;padding:9px 10px!important;border-color:#e5e7eb!important;border-radius:10px!important;box-shadow:none!important}.pkg .pk-name{font-size:13px!important;color:#111827!important}.pkg .pk-dur{font-size:10.5px!important}.pkg .pk-price{font-size:12px!important}.pkg .pk-buy{border-radius:9px!important;padding:7px 12px!important;font-size:12px!important;box-shadow:none!important}
.accept{margin-top:11px!important;padding:10px!important;border-color:#e5e7eb!important;border-radius:10px!important}.support{margin-top:12px!important;padding-top:11px!important}.tech{margin-top:12px!important;font-size:9.5px!important}
.modal-overlay{background:rgba(15,23,42,.28)!important;backdrop-filter:none!important}.pay-box{max-width:390px!important;border-radius:14px!important;padding:16px!important;box-shadow:0 16px 40px rgba(15,23,42,.18)!important}.btn{padding:12px!important;border-radius:10px!important;font-size:13px!important}
@media(max-width:360px){body{padding:7px 7px 16px!important}.card{padding:11px!important}#content{column-gap:5px}.find-link,#tvVoucherBox>label{font-size:10px!important}.pkg{gap:5px!important}.pkg .pk-buy{padding:7px 9px!important}}
@media(prefers-reduced-motion:reduce){.wifi-loader i{animation:none!important}}
</style>`

    html = html.replace('</head>', `${css}</head>`)
    return html
  }'''

    text = text[:start] + safe_method + text[class_close:]

    forbidden = (
        "utility-row",
        "function poll(id,tok)",
        "function setPayState(",
        "html = html.replace(\n      /    function poll",
        "resumeBox",
        "loggedout=1",
        "buildSessionStatusHtml",
    )
    for token in forbidden:
        if token in text:
            fail(f"compact wrapper still contains behavior-changing captive surgery: {token}")

    required = (
        "Decoration only. Do not rebuild DOM nodes and do not rewrite captive JS.",
        '#tvVoucherBox.on .tv-mac-wrap{display:block!important}',
        '.find-panel.on{display:block!important}',
        'id="arofi-captive-v3"',
    )
    for token in required:
        if token not in text:
            fail(f"safe compact wrapper missing marker: {token}")

    UI.write_text(text, encoding="utf-8")


def lock_base_portal_controls() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")

    # Already Bought must explicitly control display; do not rely on one CSS
    # class surviving every compact/theme layer.
    simple_find = """    function toggleFind(){
      document.getElementById('findPanel').classList.toggle('on');
    }
"""
    stable_find = """    function toggleFind(){
      var p=document.getElementById('findPanel');
      if(!p)return;
      var opening=!p.classList.contains('on');
      p.classList.toggle('on',opening);
      p.style.setProperty('display',opening?'block':'none','important');
      if(opening)setTimeout(function(){var i=document.getElementById('rtxn');if(i)i.focus();},50);
    }
"""
    if stable_find not in text:
        if simple_find not in text:
            fail("Already Bought toggle function is missing or has an unknown shape")
        text = replace_once(text, simple_find, stable_find, "Already Bought explicit toggle")

    # Smart-TV must also explicitly reveal the original MAC input. This keeps the
    # original DOM and original target MAC behavior while making the dropdown
    # independent of compact CSS.
    simple_tv = """    function toggleVoucherTv(){
      var on=document.getElementById('vTvMode').checked;
      document.getElementById('tvVoucherBox').classList.toggle('on',on);
      if(on)setTimeout(function(){document.getElementById('vTvMac').focus();},50);
    }
"""
    stable_tv = """    function toggleVoucherTv(){
      var mode=document.getElementById('vTvMode');
      var box=document.getElementById('tvVoucherBox');
      var input=document.getElementById('vTvMac');
      if(!mode||!box||!input)return;
      var on=!!mode.checked;
      box.classList.toggle('on',on);
      var wrap=input.parentNode;
      if(wrap&&wrap.style)wrap.style.setProperty('display',on?'block':'none','important');
      if(on)setTimeout(function(){input.focus();},50);
    }
"""
    if stable_tv not in text:
        if simple_tv not in text:
            fail("Smart-TV toggle function is missing or has an unknown shape")
        text = replace_once(text, simple_tv, stable_tv, "Smart-TV explicit MAC toggle")

    # Package context must never fail once and leave an empty package list.
    if "function load(attempt){" not in text:
        text = replace_once(
            text,
            "    function load(){\n",
            "    function load(attempt){\n      attempt=attempt||0;\n",
            "resilient package loader signature",
        )

    old_error = """        if(err){
          document.getElementById('tname').textContent='AROFi Hotspot';
          document.getElementById('loading').style.display='none';
          document.getElementById('content').style.display='block';
          return;
        }
"""
    stable_error = """        if(err){
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
    if stable_error not in text:
        if old_error not in text:
            fail("portal context error block is missing or has an unknown shape")
        text = replace_once(text, old_error, stable_error, "package context retry")

    # Network and 5xx failures may use the raw-IP fallback. Validation/auth 4xx
    # responses remain authoritative and are not hidden by fallback retries.
    old_api = "if(e.network){ajax(m,APIFB+p,d,function(fe,fr){if(!fe){cb(null,fr);return;}cb(fe||e);});return;}cb(e);"
    stable_api = "if(e.network||(e.status&&e.status>=500)){ajax(m,APIFB+p,d,function(fe,fr){if(!fe){cb(null,fr);return;}cb(fe||e);});return;}cb(e);"
    if stable_api not in text:
        if old_api not in text:
            fail("captive apiCall fallback has an unknown shape")
        text = text.replace(old_api, stable_api, 1)

    required = (
        'id="vTvMode" onchange="toggleVoucherTv()"',
        'id="vTvMac"',
        "wrap.style.setProperty('display',on?'block':'none','important');",
        'onclick="toggleFind()"',
        'id="rtxn" placeholder="Phone number or Transaction ID"',
        "p.style.setProperty('display',opening?'block':'none','important');",
        "function load(attempt){",
        "Packages did not load. Tap to retry.",
        "if(e.network||(e.status&&e.status>=500))",
        "AROFi active API",
        "AROFi portal ip",
    )
    for token in required:
        if token not in text:
            fail(f"final base captive portal missing marker: {token}")

    MIKROTIK.write_text(text, encoding="utf-8")


def verify_proven_router_installer() -> None:
    """Verify only; NEVER patch the working installer."""

    text = MIKROTIK.read_text(encoding="utf-8")
    start = text.find("  buildOneRunCommand(registrationKey: string")
    end = text.find("  // VPS-side tunnel gateway", start)
    if start < 0 or end <= start:
        fail("final buildOneRunCommand() could not be isolated")
    block = text[start:end]

    required = (
        "const requestedWanInterface = this.normalizeWanInterface(wanInterface)",
        "const selectedWanBootstrap = this.buildSelectedWanBootstrap(requestedWanInterface)",
        "const routerOs6AutoWanBootstrap =",
        ':if ($arofiRosMajor = "6") do={',
        '[/ip route find dst-address="0.0.0.0/0" active=yes]',
        '[/interface find where name="ether1"]',
        '[/ip address find where interface="ether1"]',
        '[/interface bridge port find where interface="ether1"]',
        '[/interface pppoe-client find where interface="ether1"]',
        '/ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes disabled=no comment="AROFi RouterOS6 reset WAN"',
        "const wanBootstrap = requestedWanInterface ? selectedWanBootstrap : routerOs6AutoWanBootstrap",
        "http://95.111.234.34/api/mikrotik/script/",
        'url="${fallbackUrl}" dst-path="arofi-setup.rsc" mode=http',
        'url="${url}" check-certificate=no dst-path="arofi-setup.rsc" mode=https',
        ':while ($attempts < 3)',
        ':if ($sz > 0) do={ :set arofiOk 1 }',
        '/import file-name="arofi-setup.rsc"',
        '/file remove "arofi-setup.rsc"',
    )
    for token in required:
        if token not in block:
            fail(f"proven RouterOS installer changed; missing: {token}")

    v6_gate = block.find(':if ($arofiRosMajor = "6") do={')
    v6_dhcp = block.find('/ip dhcp-client add interface=ether1')
    http_fetch = block.find('url="${fallbackUrl}" dst-path="arofi-setup.rsc" mode=http')
    https_fetch = block.find('url="${url}" check-certificate=no dst-path="arofi-setup.rsc" mode=https')
    if v6_gate < 0 or v6_dhcp < 0 or v6_gate >= v6_dhcp:
        fail("RouterOS 6 reset-WAN DHCP is no longer protected by the RouterOS 6 gate")
    if http_fetch < 0 or https_fetch < 0 or http_fetch >= https_fetch:
        fail("working raw-IP HTTP first / HTTPS fallback order changed")

    for token in (":delay 20s", "login-by=mac,cookie", "mac-auth-mode="):
        if token in block:
            fail(f"forbidden installer regression returned: {token}")

    # RouterOS 7 must never enter the automatic reset-WAN compatibility branch.
    if ':if ($arofiRosMajor = "7") do={' in block:
        fail("RouterOS 7 was incorrectly added to the RouterOS 6 reset-WAN compatibility branch")


def verify_no_customer_post_auth_page() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")
    forbidden = (
        ">Connected<",
        ">Disconnect<",
        "loggedout=1",
        "resumeBox",
        "$(link-logout)",
    )
    for token in forbidden:
        if token in text:
            fail(f"customer-facing post-auth control returned: {token}")

    required = (
        "login-by=cookie,mac-cookie,http-pap",
        "idle-timeout=none keepalive-timeout=none session-timeout=0s",
    )
    for token in required:
        if token not in text:
            fail(f"active-bundle/session policy missing: {token}")


def main() -> None:
    if not MIKROTIK.exists() or not UI.exists():
        fail("required captive source files are missing")

    # This lock is intended for the final transformed build. A raw checkout used
    # by lightweight CI does not yet contain the RouterOS6 finalizer markers and
    # must remain read-only; the Docker build runs this again after normalization.
    current = MIKROTIK.read_text(encoding="utf-8")
    if "const routerOs6AutoWanBootstrap =" not in current:
        print("FINAL_CAPTIVE_STABILITY_LOCK deferred: raw source has not reached final RouterOS normalization yet.")
        return

    lock_compact_wrapper()
    lock_base_portal_controls()
    verify_proven_router_installer()
    verify_no_customer_post_auth_page()

    print(
        "FINAL_CAPTIVE_STABILITY_LOCK verified: proven RouterOS6 installer is immutable, "
        "RouterOS7 remains outside the v6 recovery branch, Smart-TV MAC + Already Bought "
        "controls are direct, package loading retries, and the compact wrapper is CSS-only."
    )


if __name__ == "__main__":
    main()
