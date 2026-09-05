#!/usr/bin/env python3
"""Apply the AroFi visual system to the router-hosted MikroTik captive page.

This intentionally changes only the HTML/CSS inside buildLoginHtml(). The
voucher, payment, returning-device, RouterOS placeholder and login logic are
left untouched. The page remains hotspot/login.html on the MikroTik and is
reached through the business-local http://<tenant>.wifi/login hostname.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
START = "  buildLoginHtml(registrationKey: string, portalBaseUrl?: string | null) {"
END = "  buildStatusHtml() {"
MARKER = "AROFi_MIKROTIK_LOCAL_PORTAL_UI_V1"


def main() -> None:
    text = MIKROTIK.read_text(encoding="utf-8")
    start = text.find(START)
    end = text.find(END, start + len(START))
    if start < 0 or end < 0:
        raise RuntimeError("Could not isolate buildLoginHtml() in mikrotik.service.ts")

    segment = text[start:end]
    if MARKER in segment:
        print("AroFi MikroTik-local captive UI already applied.")
        return

    # Keep the router-local implementation intact; only brand/cosmetic tokens
    # are changed. AroFi's exact supplied horizontal logo is requested from the
    # already-whitelisted arofi.net host. The rest of the page stays fully
    # router-hosted and functional even if the logo request fails.
    segment = segment.replace(
        "// Self-contained white-themed static portal served directly from the router's\n"
        "    // hotspot directory. No redirect — works in Android/iOS captive portal browsers.",
        "// AROFi_MIKROTIK_LOCAL_PORTAL_UI_V1\n"
        "    // Router-hosted captive portal served from hotspot/login.html. No redirect —\n"
        "    // works in Android/iOS captive portal browsers and at http://<tenant>.wifi/login.",
        1,
    )

    replacements = {
        "<title>AROFi Hotspot</title>": "<title>AroFi WiFi</title>",
        "body{background:linear-gradient(180deg,#f0f9ff 0%,#f0fdf4 100%);color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;min-height:100vh;padding:24px 16px 40px}":
            "body{background:#F5F7F9;color:#122033;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;min-height:100vh;padding:24px 16px 40px}",
        ".card{width:100%;max-width:540px;margin:0 auto;background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:20px;box-shadow:0 8px 32px rgba(37,99,235,.10)}":
            ".card{width:100%;max-width:560px;margin:0 auto;background:#fff;border:1px solid #E1E6EA;border-radius:16px;padding:22px;box-shadow:0 8px 28px rgba(18,32,51,.08)}",
        ".title{font-size:14px;font-weight:600;letter-spacing:.08em;color:#2563EB;text-transform:uppercase;opacity:.6;margin-top:2px}":
            ".title{font-size:18px;font-weight:800;letter-spacing:-.01em;color:#122033;text-transform:none;opacity:1;margin-top:4px}",
        "      <h1 id=\"tname\" class=\"title\">AROFi Hotspot</h1>":
            "      <img class=\"brand-logo\" src=\"https://arofi.net/brand-assets/arofi-logo.png\" alt=\"AroFi\" onerror=\"this.style.display='none'\">\n      <h1 id=\"tname\" class=\"title\">AroFi WiFi</h1>",
        "document.getElementById('tname').textContent='AROFi Hotspot';":
            "document.getElementById('tname').textContent='AroFi WiFi';",
        "document.getElementById('tname').textContent=d.tenant?d.tenant.name:'AROFi Hotspot';":
            "document.getElementById('tname').textContent=d.tenant?d.tenant.name:'AroFi WiFi';",
    }
    for old, new in replacements.items():
        if old not in segment:
            raise RuntimeError(f"Expected local portal visual pattern not found: {old[:120]!r}")
        segment = segment.replace(old, new, 1)

    # Normalize the remaining blue accents in this captive-page slice to the
    # approved AroFi green system. No JS endpoints or transaction logic change.
    for old, new in (
        ("#2563EB", "#22A53A"),
        ("#1d4ed8", "#197C2C"),
        ("#1e40af", "#197C2C"),
        ("#bfdbfe", "#CDE8D2"),
        ("#dbeafe", "#CDE8D2"),
        ("#eff6ff", "#EDF8EF"),
        ("rgba(37,99,235,.10)", "rgba(34,165,58,.10)"),
        ("rgba(37,99,235,.12)", "rgba(34,165,58,.12)"),
        ("rgba(29,78,216,.5)", "rgba(34,165,58,.50)"),
    ):
        segment = segment.replace(old, new)

    # Exact supplied logo, loaded through the pre-auth arofi.net walled garden.
    style_marker = "    .tlogo{height:40px;width:auto;margin:0 auto 8px;display:block}\n"
    if style_marker not in segment:
        raise RuntimeError("Local portal logo CSS insertion point not found")
    segment = segment.replace(
        style_marker,
        style_marker + "    .brand-logo{display:block;width:min(210px,70%);height:auto;max-height:72px;object-fit:contain;margin:0 auto 10px}\n",
        1,
    )

    # Follow the device theme without adding any dependency or changing captive
    # behavior. The form remains usable if the captive mini-browser ignores it.
    dark_css = """
    @media(prefers-color-scheme:dark){
      body{background:#0B0805;color:#E6E6E6}
      .card,.pkg,.find-panel,.tv-voucher,.accept,.pay-box{background:#202020;border-color:#343434;color:#E6E6E6;box-shadow:none}
      .title,.pkg .pk-name,.accept-label,.tv-pay-fields label{color:#E6E6E6}
      .idline,.spin-wrap p,.section-label,.section-sub,.pkg .pk-dur,.tv-note,.pay-box .psub,.tech{color:#A6A6A6}
      .quick-row input,input[type=text],input[type=tel]{background:#181818;border-color:#3A3A3A;color:#E6E6E6}
      .find-link,.tv-section{background:#19231B;border-color:#304734;color:#7DDB8E}
      .message-box{background:#202020;color:#E6E6E6}
    }
"""
    if "  </style>" not in segment:
        raise RuntimeError("Local portal </style> marker not found")
    segment = segment.replace("  </style>", dark_css + "  </style>", 1)

    updated = text[:start] + segment + text[end:]
    MIKROTIK.write_text(updated, encoding="utf-8")

    final_segment = updated[start:updated.find(END, start + len(START))]
    required = (
        MARKER,
        "https://arofi.net/brand-assets/arofi-logo.png",
        "<title>AroFi WiFi</title>",
        "#22A53A",
        "@media(prefers-color-scheme:dark)",
        "$(link-login-only)",
    )
    for marker in required:
        if marker not in final_segment:
            raise RuntimeError(f"AroFi local captive UI marker missing after patch: {marker}")

    print("AroFi MikroTik-local captive UI applied; captive/payment/login logic preserved.")


if __name__ == "__main__":
    main()
