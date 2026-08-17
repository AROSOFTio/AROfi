#!/usr/bin/env python3
"""Final RouterOS 6 captive runtime repair.

This deliberately leaves the proven one-run WAN/bootstrap installer untouched.
It fixes only the files and browser runtime used by the HotSpot portal:

- RouterOS 6 devices with persistent flash serve flash/hotspot, not a RAM-only
  root hotspot directory. Detect that case and install/activate the actual path.
- Never place RouterOS $(...) template expressions inside browser JavaScript.
  The servlet values live in escaped hidden inputs and JS reads/decodes them.
- Keep status/alogin completion invisible and free of RouterOS macros in JS.
- Parse-check the final login JavaScript with Node after every build patch.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
CONTROLLER = ROOT / "apps/api/src/modules/routers/mikrotik.controller.ts"
ALOGIN = ROOT / "apps/api/src/modules/routers/mikrotik-alogin.controller.ts"


def fail(message: str) -> None:
    raise RuntimeError(f"ROUTEROS6 CAPTIVE RUNTIME REJECTED: {message}")


def patch_flash_hotspot_path() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")
    start = text.find("  private buildLoginHtmlInstallScript(")
    end = text.find("  // Moves a Wi-Fi interface", start)
    if start < 0 or end <= start:
        fail("buildLoginHtmlInstallScript() could not be isolated")
    block = text[start:end]

    marker = '      `:local arofiHtmlOk 0`,\n'
    if '`:local arofiPortalDir "hotspot"`' not in block:
        if marker not in block:
            fail("portal installer html-ok marker is missing")
        prelude = '''      `:local arofiPortalDir "hotspot"`,
      `:local arofiPortalRosVersion [/system resource get version]`,
      `:local arofiPortalRosMajor [:pick $arofiPortalRosVersion 0 1]`,
      `:if ($arofiPortalRosMajor = "6" && [:len [/file find name="flash"]] > 0) do={ :set arofiPortalDir "flash/hotspot" }`,
      `:do { :if ([:len [/file find name=$arofiPortalDir]] = 0) do={ /file add name=$arofiPortalDir type=directory } } on-error={}`,
      `:local arofiLoginPath ($arofiPortalDir . "/login.html")`,
      `:local arofiStatusPath ($arofiPortalDir . "/status.html")`,
      `:do { /file remove [find name=$arofiLoginPath] } on-error={}`,
      `:do { /file remove [find name=$arofiStatusPath] } on-error={}`,
      `:if ($arofiPortalRosMajor = "6" && $arofiPortalDir = "flash/hotspot") do={ :do { /file remove [find name="hotspot/login.html"] } on-error={}; :do { /file remove [find name="hotspot/status.html"] } on-error={} }`,
'''
        block = block.replace(marker, prelude + marker, 1)

    block = block.replace('dst-path=\\"hotspot/login.html\\"', 'dst-path=$arofiLoginPath')
    block = block.replace('[/file find name=\\"hotspot/login.html\\"]', '[/file find name=$arofiLoginPath]')
    block = block.replace('dst-path=\\"hotspot/status.html\\"', 'dst-path=$arofiStatusPath')
    block = block.replace('[/file find name=\\"hotspot/status.html\\"]', '[/file find name=$arofiStatusPath]')
    block = block.replace('html-directory=hotspot`', 'html-directory=$arofiPortalDir`')

    required = (
        ':if ($arofiPortalRosMajor = "6" && [:len [/file find name="flash"]] > 0)',
        ':set arofiPortalDir "flash/hotspot"',
        'dst-path=$arofiLoginPath',
        'dst-path=$arofiStatusPath',
        'html-directory=$arofiPortalDir',
    )
    for token in required:
        if token not in block:
            fail(f"flash-aware portal installer missing marker: {token}")

    if ':if ($arofiPortalRosMajor = "7")' in block:
        fail("RouterOS 7 was added to the RouterOS 6 flash-path compatibility branch")

    MIKROTIK.write_text(text[:start] + block + text[end:], encoding="utf-8")


def patch_login_browser_context() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")
    start = text.find("  buildLoginHtml(registrationKey: string")
    end = text.find("  // Post-auth", start)
    if start < 0 or end <= start:
        fail("buildLoginHtml() could not be isolated")
    block = text[start:end]

    old_variants = (
        '''  <script>
    var API="${apiBaseUrl}",APIFB="${fallbackApiBaseUrl}",RKEY="${escapedKey}";
    var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"",orig="$(link-orig)"||"";
''',
        '''  <script>
    var API="${apiBaseUrl}",APIFB="${fallbackApiBaseUrl}",RKEY="${escapedKey}";
    var mac="$(mac)"||"",ip="$(ip)"||"",lo="$(link-login-only)"||"",srv="$(server-name)"||"",orig="$(link-orig)"||"",herr="$(error)"||"";
''',
    )
    new = '''  <input type="hidden" id="arofiRosMac" value="$(mac-esc)">
  <input type="hidden" id="arofiRosIp" value="$(ip-esc)">
  <input type="hidden" id="arofiRosLogin" value="$(link-login-only-esc)">
  <input type="hidden" id="arofiRosServer" value="$(server-name-esc)">
  <input type="hidden" id="arofiRosOrig" value="$(link-orig-esc)">
  <input type="hidden" id="arofiRosError" value="$(error-esc)">
  <script>
    function arofiRosValue(id){var e=document.getElementById(id),v=e?e.value:'';if(!v)return '';try{return decodeURIComponent(String(v).split('+').join('%20'));}catch(_e){return String(v);}}
    var AROFI_ROS_MACRO=String.fromCharCode(36,40);
    var API="${apiBaseUrl}",APIFB="${fallbackApiBaseUrl}",RKEY="${escapedKey}";
    var mac=arofiRosValue('arofiRosMac'),ip=arofiRosValue('arofiRosIp'),lo=arofiRosValue('arofiRosLogin'),srv=arofiRosValue('arofiRosServer'),orig=arofiRosValue('arofiRosOrig'),herr=arofiRosValue('arofiRosError');
'''
    if new not in block:
        for old in old_variants:
            if old in block:
                block = block.replace(old, new, 1)
                break
        else:
            fail("RouterOS values are not in the expected login-script shape")

    # RouterCaptiveFlowInitializer historically used a literal '$(' sentinel.
    # Normalize it here before parse validation; the permanent guard later also
    # rejects any reintroduction.
    block = block.replace("indexOf('$(')", "indexOf(String.fromCharCode(36,40))")
    block = block.replace('indexOf("$(")', 'indexOf(String.fromCharCode(36,40))')

    scripts = re.findall(r"<script(?:\s[^>]*)?>(.*?)</script>", block, flags=re.S | re.I)
    if not scripts:
        fail("login.html has no inline JavaScript to validate")
    for index, script in enumerate(scripts, start=1):
        if "$(" in script:
            fail(f"RouterOS template token remains inside login JavaScript block {index}")
        js = re.sub(r"\$\{[^}]+\}", "AROFI_BUILD_VALUE", script)
        with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as handle:
            handle.write(js)
            path = Path(handle.name)
        try:
            result = subprocess.run(["node", "--check", str(path)], text=True, capture_output=True)
            if result.returncode != 0:
                fail(f"login JavaScript does not parse: {result.stderr.strip()}")
        finally:
            path.unlink(missing_ok=True)

    if 'function load(attempt){' not in block and 'function load(){' not in block:
        fail('functional captive marker missing after JS hardening: package loader')

    for token in (
        'id="vTvMode" onchange="toggleVoucherTv()"',
        'id="vTvMac"',
        'onclick="toggleFind()"',
        'id="rtxn" placeholder="Phone number or Transaction ID"',
        'function login(){',
        'function rec(){',
        'function conn(rc){',
    ):
        if token not in block:
            fail(f"functional captive marker missing after JS hardening: {token}")

    MIKROTIK.write_text(text[:start] + block + text[end:], encoding="utf-8")


def patch_completion_scripts() -> None:
    for path in (CONTROLLER, ALOGIN):
        text = path.read_text(encoding="utf-8")
        text, count = re.subn(
            r"\s*var target='\$\(link-redirect\)';\n\s*if\(!target\|\|target\.indexOf\([^\n]+\)target=finishTarget\(\);",
            "\n  var AROFI_ROS_MACRO=String.fromCharCode(36,40);\n  var target=finishTarget();",
            text,
            count=1,
        )
        if count == 0 and "var target=finishTarget();" not in text:
            fail(f"completion redirect block could not be normalized in {path.relative_to(ROOT)}")
        path.write_text(text, encoding="utf-8")


def verify() -> None:
    mik = MIKROTIK.read_text(encoding="utf-8")
    controller = CONTROLLER.read_text(encoding="utf-8")
    alogin = ALOGIN.read_text(encoding="utf-8")

    login_start = mik.find("  buildLoginHtml(registrationKey: string")
    login_end = mik.find("  // Post-auth", login_start)
    login = mik[login_start:login_end]
    for script in re.findall(r"<script(?:\s[^>]*)?>(.*?)</script>", login, flags=re.S | re.I):
        if "$(" in script:
            fail("final login JavaScript still contains a RouterOS template token")

    if 'Packages did not load. Tap to retry.' not in mik and "apiCall('GET', '/api/portal/context?" not in mik:
        fail('final captive runtime missing marker: package loader')

    for token in (
        'value="$(mac-esc)"',
        'value="$(link-login-only-esc)"',
        'value="$(error-esc)"',
        'arofiRosValue',
        'flash/hotspot',
        'html-directory=$arofiPortalDir',
    ):
        if token not in mik:
            fail(f"final captive runtime missing marker: {token}")

    for label, text in (("status", controller), ("alogin", alogin)):
        script_blocks = re.findall(r"<script(?:\s[^>]*)?>(.*?)</script>", text, flags=re.S | re.I)
        for script in script_blocks:
            if "$(" in script:
                fail(f"{label} completion JavaScript still contains RouterOS template tokens")
        if "var target=finishTarget();" not in text:
            fail(f"{label} completion page is not pinned to the OS connectivity target")

    print(
        "ROUTEROS6_CAPTIVE_RUNTIME verified: v6 flash/hotspot is selected when present, "
        "RouterOS7 path behavior is unchanged, login JavaScript is template-safe and parseable, "
        "and package/TV/recovery/connect handlers remain wired."
    )


def main() -> None:
    for path in (MIKROTIK, CONTROLLER, ALOGIN):
        if not path.exists():
            fail(f"required source missing: {path.relative_to(ROOT)}")
    patch_flash_hotspot_path()
    patch_login_browser_context()
    patch_completion_scripts()
    verify()


if __name__ == "__main__":
    main()
