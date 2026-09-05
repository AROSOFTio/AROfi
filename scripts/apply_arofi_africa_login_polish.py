from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_required(path: Path, old: str, new: str, count: int = -1) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected pattern not found in {path}: {old[:160]!r}")
    path.write_text(text.replace(old, new, count), encoding="utf-8")


def regex_required(path: Path, pattern: str, replacement: str, *, flags: int = 0) -> None:
    text = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Expected regex pattern not found exactly once in {path}: {pattern[:160]!r}")
    path.write_text(updated, encoding="utf-8")


def append_once(path: Path, marker: str, block: str) -> None:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    path.write_text(text.rstrip() + "\n\n" + block.strip() + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Exact supplied AroFi brand assets.
# The prior polish pass routes branding to generic PNG names; switch those
# references to the user's original embedded-WebP SVG files without redrawing.
# ---------------------------------------------------------------------------
sidebar = ROOT / "apps/admin-web/src/components/Sidebar.tsx"
replace_required(sidebar, '/brand/arofi-square-icon.png', '/brand/arofi-logo-app-icon-light.svg')

home = ROOT / "apps/admin-web/src/app/page.tsx"
replace_required(home, '/brand/arofi-main-logo.png', '/brand/arofi-logo-main.svg')

footer = ROOT / "apps/admin-web/src/components/SiteFooter.tsx"
replace_required(footer, '/brand/arofi-main-logo.png', '/brand/arofi-logo-main.svg')

public_css = ROOT / "apps/admin-web/src/styles/public-responsive-overrides.css"
replace_required(public_css, "content: url('/brand/arofi-icon-only-dark.png');", "content: url('/brand/arofi-logo-mark-dark.svg');")

layout = ROOT / "apps/admin-web/src/app/layout.tsx"
replace_required(layout, "const FAVICON = '/brand/arofi-square-icon.png'", "const FAVICON = '/brand/arofi-logo-app-icon-light.svg'")
replace_required(layout, "const BRAND_MARK = '/brand/arofi-square-icon.png'", "const BRAND_MARK = '/brand/arofi-logo-app-icon-light.svg'")
replace_required(layout, "const BRAND_LOGO = '/brand/arofi-main-logo.png'", "const BRAND_LOGO = '/brand/arofi-logo-main.svg'")
replace_required(layout, "icon: [{ url: FAVICON, type: 'image/png', sizes: '1254x1254' }]", "icon: [{ url: FAVICON, type: 'image/svg+xml', sizes: 'any' }]")
replace_required(layout, '<link rel="icon" href={FAVICON} type="image/png" />', '<link rel="icon" href={FAVICON} type="image/svg+xml" />')
replace_required(layout, '<link rel="shortcut icon" href={FAVICON} type="image/png" />', '<link rel="shortcut icon" href={FAVICON} type="image/svg+xml" />')

manifest = ROOT / "apps/admin-web/public/manifest.webmanifest"
manifest.write_text(
    """{
  \"name\": \"AroFi Admin\",
  \"short_name\": \"AroFi\",
  \"description\": \"WiFi, ISP and network operations from one cloud console.\",
  \"start_url\": \"/dashboard\",
  \"scope\": \"/\",
  \"display\": \"standalone\",
  \"background_color\": \"#ffffff\",
  \"theme_color\": \"#22A53A\",
  \"orientation\": \"any\",
  \"icons\": [
    {
      \"src\": \"/brand/arofi-logo-app-icon-light.svg\",
      \"sizes\": \"any\",
      \"type\": \"image/svg+xml\",
      \"purpose\": \"any maskable\"
    }
  ]
}
""",
    encoding="utf-8",
)


# ---------------------------------------------------------------------------
# Public hero: broader networking positioning for African operators and a
# supplied visual showcase instead of the synthetic laptop/phone illustration.
# ---------------------------------------------------------------------------
hero = ROOT / "apps/admin-web/src/components/PremiumHero.tsx"
replace_required(
    hero,
    """          Built for ISPs &amp; hotspot operators""",
    """          Networking operations for African WiFi &amp; ISP businesses""",
)
replace_required(
    hero,
    """          Run your WiFi network.<br />
          Grow your <span>business.</span>""",
    """          Run your network.<br />
          Grow across <span>Africa.</span>""",
)
replace_required(
    hero,
    """          Hotspot billing for MikroTik and other supported gateways, with MTN MoMo, Airtel Money, vouchers, wallets and live router control.
          Everything you need to launch, manage and scale — in minutes.""",
    """          AroFi brings hotspot billing, RADIUS access, router management, internet packages, vouchers, customers and live sessions into one cloud console for WiFi businesses and ISPs.
          Local payment options can be enabled by market as they become available.""",
)
replace_required(hero, '            Start Free <ArrowRight size={17} />', '            Create Free Account <ArrowRight size={17} />')
replace_required(hero, '<Link href="/docs" className="ph-btn ph-btn-secondary">Docs</Link>', '<a href="#features" className="ph-btn ph-btn-secondary">Explore Platform</a>')
replace_required(hero, '<a href={loginUrl} className="ph-btn ph-btn-secondary">Sign In</a>', '<a href={loginUrl} className="ph-btn ph-btn-secondary">Open Console</a>')
replace_required(hero, '<div><span><Check size={12} /></span><strong>Built for growth</strong><small>Scale without limits</small></div>', '<div><span><Check size={12} /></span><strong>Built for Africa</strong><small>Scale across markets</small></div>')
replace_required(hero, '<span>RADIUS billing</span>', '<span>RADIUS &amp; hotspot</span>')
replace_required(hero, '<span>MTN MoMo &amp; Airtel</span>', '<span>Router management</span>')
replace_required(hero, '<span>Vouchers &amp; wallets</span>', '<span>Vouchers &amp; billing</span>')

# Replace the old Uganda-only marketing proof with honest Africa-wide product
# positioning. Country-specific payment support remains explicitly qualified.
replace_required(
    home,
    "  { stat: '256', label: 'Built for Uganda', text: 'Local mobile money rails, local support, local currency — no workarounds.' },",
    "  { stat: 'Africa', label: 'Built for African networks', text: 'Cloud networking tools for WiFi and ISP operators across African markets; local payment availability varies by country.' },",
)

markets_section = r'''      <section className="home-markets" aria-labelledby="markets-title">
        <div className="home-markets-copy">
          <div className="home-kicker"><Wifi size={15} /> Built for African networks</div>
          <h2 id="markets-title">One cloud platform for WiFi and ISP operations across Africa.</h2>
          <p>
            AroFi is designed for hotspot operators, ISPs and network businesses working across African markets.
            Core network management is cloud-based; payment methods and regulatory requirements vary by country as local support expands.
          </p>
        </div>
        <p className="home-market-list" aria-label="African markets AroFi is designed to serve">
          Uganda · Kenya · Nigeria · Tanzania · Rwanda · Ghana · Zambia · Malawi · Ethiopia · South Africa · Botswana · Namibia · Zimbabwe · Mozambique · Cameroon · Senegal · Côte d’Ivoire · DR Congo · Burundi · Sierra Leone · Liberia · The Gambia · Eswatini · Lesotho · Mauritius · Seychelles · Angola · Benin · Togo · Madagascar
        </p>
      </section>

'''
needle = '      <section className="home-why" aria-label="Why AroFi">'
text = home.read_text(encoding="utf-8")
if markets_section.strip() not in text:
    if needle not in text:
        raise SystemExit("Expected home-why insertion point not found")
    home.write_text(text.replace(needle, markets_section + needle, 1), encoding="utf-8")

append_once(
    public_css,
    "/* AROFI_AFRICA_HERO_V3 */",
    r'''
/* AROFI_AFRICA_HERO_V3 */
.ph-hero {
  grid-template-columns: minmax(0, .94fr) minmax(360px, 1.14fr) !important;
  align-items: center !important;
  gap: clamp(26px, 4vw, 58px) !important;
}
.ph-stage {
  min-height: clamp(390px, 43vw, 590px) !important;
  width: 100% !important;
  border: 1px solid rgba(34,165,58,.2);
  border-radius: 22px;
  overflow: hidden;
  background: #eef7f0 url('/brand/arofi-hero-showcase.webp') center center / cover no-repeat !important;
  box-shadow: 0 24px 60px rgba(16, 45, 25, .14);
  isolation: isolate;
}
.ph-stage > * { display: none !important; }
.home-markets {
  width: min(calc(100% - 28px), 1180px);
  margin: 28px auto 0;
  padding: 26px 28px;
  display: grid;
  grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
  gap: 30px;
  align-items: center;
  border: 1px solid #dce7df;
  border-radius: 16px;
  background: rgba(255,255,255,.92);
  box-shadow: 0 4px 18px rgba(18,32,51,.04);
}
.home-markets h2 {
  margin: 10px 0 8px;
  color: var(--public-ink, #122033);
  font-size: clamp(22px, 2.6vw, 31px);
  line-height: 1.14;
  letter-spacing: -.035em;
}
.home-markets-copy p,
.home-market-list {
  color: var(--public-muted, #667382);
  font-size: 13.5px;
  line-height: 1.7;
}
.home-market-list {
  margin: 0;
  padding: 18px 20px;
  border-radius: 13px;
  background: #f2f8f3;
  border: 1px solid #dfece2;
  color: #3c5543;
  font-weight: 600;
}
[data-theme="dark"] .home-markets {
  border-color: #303630;
  background: #171b18;
  box-shadow: none;
}
[data-theme="dark"] .home-markets h2 { color: #ededed; }
[data-theme="dark"] .home-markets-copy p { color: #9da7a1; }
[data-theme="dark"] .home-market-list {
  border-color: #304134;
  background: #1d261f;
  color: #b9c9bd;
}
@media (max-width: 860px) {
  .ph-hero { grid-template-columns: 1fr !important; }
  .ph-stage { min-height: 330px !important; }
  .home-markets { grid-template-columns: 1fr; gap: 16px; padding: 22px; }
}
@media (max-width: 560px) {
  .ph-stage { min-height: 245px !important; border-radius: 15px; }
  .home-markets { width: calc(100% - 16px); margin-top: 16px; padding: 18px; border-radius: 14px; }
  .home-market-list { padding: 15px; font-size: 12.5px; }
}
''',
)


# ---------------------------------------------------------------------------
# Login: keep the existing password/OTP/trusted-device backend flow untouched;
# only change presentation and add a client-side password visibility control.
# ---------------------------------------------------------------------------
login = ROOT / "apps/admin-web/src/app/login/page.tsx"
replace_required(login, "import { useRouter } from 'next/navigation'", "import { useRouter } from 'next/navigation'\nimport { Eye, EyeOff } from 'lucide-react'")
replace_required(login, "  const [password, setPassword] = useState('')", "  const [password, setPassword] = useState('')\n  const [showPassword, setShowPassword] = useState(false)")
replace_required(login, 'src="/brand/arofi-logo-blue.svg"', 'src="/brand/arofi-logo-main.svg"')
replace_required(login, '<h1>Sign in to AroFi</h1>\n            <p>Manage your WiFi business.</p>', '<h1>Welcome back</h1>\n            <p>Sign in to manage your WiFi business with AroFi.</p>')
replace_required(
    login,
    '''                <input
                  className="form-input"
                  type="password"
                  placeholder="**********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />''',
    '''                <div className="login-password-wrap">
                  <input
                    className="form-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="**********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>''',
)
replace_required(login, '>\n                Continue\n              </button>', '>\n                Continue securely\n              </button>', 1)

app_css = ROOT / "apps/admin-web/src/app/globals.css"
append_once(
    app_css,
    "/* AROFI_LOGIN_VISUAL_V3 */",
    r'''
/* AROFI_LOGIN_VISUAL_V3 */
.login-page {
  min-height: 100vh;
  display: flex;
  background: #f8faf9 url('/brand/arofi-login-background.webp') center center / cover no-repeat fixed !important;
  color: #122033;
}
.login-shell {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: clamp(24px, 5vw, 72px) clamp(24px, 7vw, 112px);
  background: transparent !important;
}
.login-card {
  width: min(100%, 455px) !important;
  margin: 0 !important;
  padding: clamp(28px, 4vw, 42px) !important;
  border: 1px solid rgba(34,165,58,.16) !important;
  border-radius: 20px !important;
  background: rgba(255,255,255,.94) !important;
  box-shadow: 0 26px 70px rgba(12, 39, 21, .13) !important;
  backdrop-filter: blur(16px);
}
.login-brand { margin-bottom: 24px !important; text-align: left !important; }
.login-logo {
  width: min(250px, 74%) !important;
  height: auto !important;
  max-height: 94px !important;
  object-fit: contain !important;
  object-position: left center !important;
  margin: 0 0 18px !important;
}
.login-brand h1 {
  margin: 0 !important;
  color: #122033 !important;
  font-size: clamp(27px, 3vw, 34px) !important;
  line-height: 1.12 !important;
  letter-spacing: -.035em !important;
}
.login-brand p { margin-top: 7px !important; color: #6d7885 !important; font-size: 13.5px !important; }
.login-card .form-label { color: #334155 !important; font-weight: 700 !important; }
.login-card .form-input {
  width: 100% !important;
  min-height: 46px !important;
  border: 1px solid #d9e1dc !important;
  border-radius: 10px !important;
  background: #fff !important;
  color: #122033 !important;
  font-size: 14px !important;
  outline: none !important;
  transition: border-color .15s ease, box-shadow .15s ease !important;
}
.login-card .form-input:focus {
  border-color: #22A53A !important;
  box-shadow: 0 0 0 3px rgba(34,165,58,.11) !important;
}
.login-password-wrap { position: relative; }
.login-password-wrap .form-input { padding-right: 48px !important; }
.login-password-toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  transform: translateY(-50%);
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #74808d;
  cursor: pointer;
}
.login-password-toggle:hover { background: #eef7f0; color: #197C2C; }
.login-card .btn-primary {
  min-height: 46px !important;
  border-color: #22A53A !important;
  background: #22A53A !important;
  color: #fff !important;
  border-radius: 10px !important;
  font-size: 14px !important;
  font-weight: 800 !important;
  box-shadow: none !important;
}
.login-card .btn-primary:hover { background: #1E9134 !important; }
.login-notice { border-color: #cce8d2 !important; background: #eff9f1 !important; color: #286337 !important; }
.login-signup, .login-footer { color: #77838f !important; }
.login-signup a { color: #197C2C !important; font-weight: 800 !important; }
.login-remember-note { display: block; color: #82908a !important; }
[data-theme="dark"] .login-page { color-scheme: light; }
[data-theme="dark"] .login-card { background: rgba(255,255,255,.94) !important; }
[data-theme="dark"] .login-card .form-label,
[data-theme="dark"] .login-brand h1 { color: #122033 !important; }
@media (max-width: 900px) {
  .login-page { background-position: 32% center !important; }
  .login-shell {
    justify-content: center;
    padding: 20px;
    background: linear-gradient(90deg, rgba(3,22,14,.40), rgba(255,255,255,.38)) !important;
  }
}
@media (max-width: 520px) {
  .login-shell { padding: 12px; }
  .login-card { padding: 25px 20px !important; border-radius: 16px !important; }
  .login-logo { width: 215px !important; }
}
''',
)


# ---------------------------------------------------------------------------
# Professional Africa-wide on-page metadata. This describes the product's
# networking scope without claiming country-specific payment support is live.
# ---------------------------------------------------------------------------
layout = ROOT / "apps/admin-web/src/app/layout.tsx"
replace_required(layout, "const TITLE = 'AroFi – #1 WiFi Hotspot Billing & Mobile Money System in Uganda'", "const TITLE = 'AroFi – WiFi, ISP & Network Billing Platform for Africa'")
replace_required(
    layout,
    "const DESCRIPTION =\n  'AroFi is Uganda\\'s best hotspot billing software. Manage MikroTik routers, sell WiFi packages, collect MTN MoMo & Airtel Money payments, issue vouchers, and track sessions — all from one multi-business cloud console. Self-onboarding. No IT needed.'",
    "const DESCRIPTION =\n  'AroFi is a cloud networking operations and billing platform for WiFi hotspot operators, ISPs and internet businesses across Africa. Manage MikroTik and supported gateways, RADIUS access, routers, packages, vouchers, customers, sessions and payment workflows from one console.'",
)

markets_const = """const AFRICAN_MARKETS = [
  'Uganda', 'Kenya', 'Nigeria', 'Tanzania', 'Rwanda', 'Ghana', 'Zambia', 'Malawi',
  'Ethiopia', 'South Africa', 'Botswana', 'Namibia', 'Zimbabwe', 'Mozambique',
  'Cameroon', 'Senegal', \"Côte d'Ivoire\", 'Democratic Republic of the Congo', 'Burundi',
  'Sierra Leone', 'Liberia', 'The Gambia', 'Eswatini', 'Lesotho', 'Mauritius',
  'Seychelles', 'Angola', 'Benin', 'Togo', 'Madagascar',
] as const

"""
needle = "const KEYWORDS = ["
text = layout.read_text(encoding="utf-8")
if "const AFRICAN_MARKETS = [" not in text:
    if needle not in text:
        raise SystemExit("KEYWORDS insertion point missing")
    layout.write_text(text.replace(needle, markets_const + needle, 1), encoding="utf-8")

keyword_block = """const KEYWORDS = [
  'WiFi billing system Africa',
  'ISP billing software Africa',
  'network management platform Africa',
  'hotspot billing software Africa',
  'MikroTik hotspot billing Africa',
  'RADIUS billing system Africa',
  'captive portal billing Africa',
  'WiFi voucher management Africa',
  'router management platform Africa',
  'ISP customer management software',
  'internet package billing software',
  'cloud ISP operations Africa',
  'hotspot management system Africa',
  'WiFi business management Africa',
  'network billing Uganda', 'WiFi billing Uganda', 'ISP software Uganda',
  'network billing Kenya', 'WiFi billing Kenya', 'ISP software Kenya',
  'network billing Nigeria', 'WiFi billing Nigeria', 'ISP software Nigeria',
  'network billing Tanzania', 'WiFi billing Tanzania', 'ISP software Tanzania',
  'network billing Rwanda', 'WiFi billing Rwanda', 'ISP software Rwanda',
  'network billing Ghana', 'WiFi billing Ghana', 'ISP software Ghana',
  'network billing Zambia', 'WiFi billing Zambia', 'ISP software Zambia',
  'network billing Malawi', 'WiFi billing Malawi', 'ISP software Malawi',
  'network billing Ethiopia', 'WiFi billing Ethiopia', 'ISP software Ethiopia',
  'network billing South Africa', 'WiFi billing South Africa', 'ISP software South Africa',
  'network billing Botswana', 'network billing Namibia', 'network billing Zimbabwe',
  'network billing Mozambique', 'network billing Cameroon', 'network billing Senegal',
  \"network billing Côte d'Ivoire\", 'network billing DR Congo', 'network billing Burundi',
  'AroFi', 'AroFi networking', 'AroFi WiFi billing', 'AroFi ISP billing',
].join(', ')"""
regex_required(layout, r"const KEYWORDS = \[.*?\]\.join\(', '\)", keyword_block, flags=re.S)

replace_required(layout, "alt: 'AroFi – WiFi Hotspot Billing System Uganda | MTN MoMo & Airtel Money'", "alt: 'AroFi – WiFi, ISP and network billing platform for Africa'")
replace_required(layout, "'ai-product-category': 'WiFi Hotspot Billing Software'", "'ai-product-category': 'WiFi, ISP and Network Operations Software'")
replace_required(layout, "'ai-geography': 'Uganda, East Africa'", "'ai-geography': AFRICAN_MARKETS.join(', ')")
replace_required(layout, "'ai-primary-use-case': 'MikroTik hotspot billing with MTN MoMo and Airtel Money'", "'ai-primary-use-case': 'WiFi hotspot, ISP, RADIUS, router, voucher and network billing operations across Africa'")
replace_required(
    layout,
    """    operatingSystem: 'Web',
    url: SITE_URL,
    description: DESCRIPTION,""",
    """    operatingSystem: 'Web',
    url: SITE_URL,
    description: DESCRIPTION,
    areaServed: AFRICAN_MARKETS.map((name) => ({ '@type': 'Country', name })),""",
)
replace_required(
    layout,
    """    audience: {
      '@type': 'Audience',
      geographicArea: {
        '@type': 'Country',
        name: 'Uganda',
      },
    },""",
    """    audience: {
      '@type': 'Audience',
      geographicArea: {
        '@type': 'Continent',
        name: 'Africa',
      },
    },""",
)
replace_required(layout, "areaServed: 'UG'", "areaServed: 'Africa'")
replace_required(
    layout,
    "description: 'Uganda\\'s leading WiFi hotspot billing platform with MTN MoMo and Airtel Money integration for MikroTik operators.'",
    "description: 'AroFi is a cloud platform for WiFi hotspot, ISP, router, RADIUS, voucher, customer and network billing operations across African markets.'",
)
replace_required(
    layout,
    """              areaServed: [
                { '@type': 'Country', name: 'Uganda' },
                { '@type': 'AdministrativeArea', name: 'East Africa' },
              ],""",
    """              areaServed: AFRICAN_MARKETS.map((name) => ({ '@type': 'Country', name })),""",
)

# Add practical country phrases to the public LLM discovery file without
# making unsupported availability promises.
llms = ROOT / "apps/admin-web/public/llms.txt"
append_once(
    llms,
    "## Africa market discovery",
    """
## Africa market discovery
AroFi is designed as a cloud WiFi, ISP and network operations platform for African operators. Relevant searches include WiFi billing, hotspot billing, ISP billing, MikroTik hotspot management, RADIUS billing, voucher management and router management in Uganda, Kenya, Nigeria, Tanzania, Rwanda, Ghana, Zambia, Malawi, Ethiopia, South Africa, Botswana, Namibia, Zimbabwe, Mozambique, Cameroon, Senegal, Côte d'Ivoire, DR Congo, Burundi and other African markets. Country-specific payment methods, compliance and commercial availability may vary as support expands.
""",
)

print("AroFi Africa hero, professional SEO, exact SVG branding and login visual polish applied.")
