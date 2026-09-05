from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_required(path: Path, old: str, new: str, count: int = -1) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected pattern not found in {path}: {old[:120]!r}")
    updated = text.replace(old, new, count)
    path.write_text(updated, encoding="utf-8")


def append_once(path: Path, marker: str, block: str) -> None:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    path.write_text(text.rstrip() + "\n\n" + block.strip() + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Vendor dashboard KPI stats: restore the green trend/stat line shown in the
# approved design, while keeping all values grounded in existing live data.
# ---------------------------------------------------------------------------
vendor = ROOT / "apps/admin-web/src/components/VendorBusinessDashboard.tsx"
replace_required(
    vendor,
    """              note={dateRange}\n              icon={<Banknote size={17} />}\n              footLeft={['Today', formatCurrency(billing?.summary.todayGrossSalesUgx ?? 0)]}""",
    """              note={`${recentTransactions.length} recent transactions`}\n              icon={<Banknote size={17} />}\n              trend={`${formatCurrency(billing?.summary.todayGrossSalesUgx ?? 0)} today`}\n              footLeft={['Today', formatCurrency(billing?.summary.todayGrossSalesUgx ?? 0)]}""",
)
replace_required(
    vendor,
    """              note={dateRange}\n              icon={<Wallet size={17} />}\n              iconTone=\"green\"\n              footLeft={['Today', formatCurrency(billing?.summary.todayNetEarningsUgx ?? 0)]}""",
    """              note={`Available balance ${formatCurrency(availableUgx)}`}\n              icon={<Wallet size={17} />}\n              iconTone=\"green\"\n              trend={`${formatCurrency(billing?.summary.todayNetEarningsUgx ?? 0)} today`}\n              footLeft={['Today', formatCurrency(billing?.summary.todayNetEarningsUgx ?? 0)]}""",
)
replace_required(
    vendor,
    """              note=\"Customers online now\"\n              icon={<Users size={17} />}\n              iconTone=\"purple\"\n              footLeft={['Sessions today', `${sessions?.summary.totalSessionsToday ?? 0}`]}""",
    """              note=\"Customers online now\"\n              icon={<Users size={17} />}\n              iconTone=\"purple\"\n              trend={`${sessions?.summary.totalSessionsToday ?? 0} sessions today`}\n              footLeft={['Sessions today', `${sessions?.summary.totalSessionsToday ?? 0}`]}""",
)
replace_required(
    vendor,
    """              note={routerHealthLabel}\n              icon={<Router size={17} />}\n              footLeft={['Total routers', `${totalRouters}`]}""",
    """              note={`${onlineRouters} online, ${Math.max(totalRouters - onlineRouters, 0)} offline`}\n              icon={<Router size={17} />}\n              trend={totalRouters > 0 ? `${Math.round((onlineRouters / totalRouters) * 100)}% available` : 'Waiting for routers'}\n              footLeft={['Total routers', `${totalRouters}`]}""",
)
replace_required(
    vendor,
    """  note,\n  icon,\n  iconTone,""",
    """  note,\n  icon,\n  iconTone,\n  trend,""",
)
replace_required(
    vendor,
    """  icon: React.ReactNode\n  iconTone?: 'green' | 'purple'\n  footLeft: [string, string]""",
    """  icon: React.ReactNode\n  iconTone?: 'green' | 'purple'\n  trend: string\n  footLeft: [string, string]""",
)
replace_required(
    vendor,
    """      <strong className={styles.kpiValue}>{value}</strong>\n      <div className={styles.kpiNote}>{note}</div>""",
    """      <strong className={styles.kpiValue}>{value}</strong>\n      <div className={styles.kpiTrend}><ArrowUpRight size={13} /> <span>{trend}</span></div>\n      <div className={styles.kpiNote}>{note}</div>""",
)

vendor_css = ROOT / "apps/admin-web/src/components/VendorBusinessDashboard.module.css"
append_once(
    vendor_css,
    "/* AROFI_BRAND_POLISH_KPI */",
    r"""
/* AROFI_BRAND_POLISH_KPI */
.kpiTrend {
  margin-top: 7px;
  display: flex;
  align-items: center;
  gap: 4px;
  color: #22A53A;
  font-size: 12px;
  line-height: 1.2;
  font-weight: 800;
}
.kpiTrend svg { flex: 0 0 auto; stroke-width: 2.6; }
.kpiNote {
  margin-top: 4px;
  min-height: 16px;
  color: var(--text-3);
  font-size: 10.5px;
  line-height: 1.35;
}
@media (max-width: 620px) {
  .kpiTrend { display: flex; font-size: 10.5px; }
  .kpiNote { display: block; font-size: 9.5px; }
}
""",
)

# ---------------------------------------------------------------------------
# Sidebar: use the supplied square app icon and slightly larger navigation.
# ---------------------------------------------------------------------------
sidebar = ROOT / "apps/admin-web/src/components/Sidebar.tsx"
replace_required(sidebar, 'src="/logo.svg" alt="AROFi"', 'src="/brand/arofi-square-icon.png" alt="AroFi"')
replace_required(sidebar, '<h1>ARO<span>Fi</span></h1>', '<h1>Aro<span>Fi</span></h1>')

tokens = ROOT / "apps/admin-web/src/styles/aapanel-tokens.css"
replace_required(tokens, "--aa-sidebar-font-size: 13.5px;", "--aa-sidebar-font-size: 14.5px;")
replace_required(tokens, "font-size: 13px;\n  font-weight: 500;\n  line-height: 1.15;", "font-size: 14.5px;\n  font-weight: 500;\n  line-height: 1.15;", 1)

# ---------------------------------------------------------------------------
# Use the exact supplied brand files.  The binary assets are committed at
# apps/admin-web/public/brand/* by the release branch.
# ---------------------------------------------------------------------------
home = ROOT / "apps/admin-web/src/app/page.tsx"
replace_required(home, '<img src="/logo.png" alt="AROFi" />', '<img src="/brand/arofi-main-logo.png" alt="AroFi" />')

footer = ROOT / "apps/admin-web/src/components/SiteFooter.tsx"
replace_required(footer, '<img src="/logo.png" alt="AROFi" />', '<img src="/brand/arofi-main-logo.png" alt="AroFi" />')
replace_required(footer, '<span>AROFi</span>', '<span>AroFi</span>')

layout = ROOT / "apps/admin-web/src/app/layout.tsx"
replace_required(layout, "const FAVICON = '/brand/arofi-favicon-v2.svg'", "const FAVICON = '/brand/arofi-square-icon.png'")
replace_required(layout, "const BRAND_MARK = '/brand/arofi-mark-blue.svg'", "const BRAND_MARK = '/brand/arofi-square-icon.png'")
replace_required(layout, "const BRAND_LOGO = '/brand/arofi-logo-blue.svg'", "const BRAND_LOGO = '/brand/arofi-main-logo.png'")
replace_required(layout, "icon: [{ url: FAVICON, type: 'image/svg+xml' }]", "icon: [{ url: FAVICON, type: 'image/png', sizes: '1254x1254' }]")
replace_required(layout, '<link rel="icon" href={FAVICON} type="image/svg+xml" />', '<link rel="icon" href={FAVICON} type="image/png" />')
replace_required(layout, '<link rel="shortcut icon" href={FAVICON} type="image/svg+xml" />', '<link rel="shortcut icon" href={FAVICON} type="image/png" />')
replace_required(layout, "'msapplication-TileColor': '#2563EB'", "'msapplication-TileColor': '#22A53A'")
replace_required(layout, "themeColor: '#ffffff'", "themeColor: '#22A53A'")

manifest = ROOT / "apps/admin-web/public/manifest.webmanifest"
manifest.write_text(
    """{\n  \"name\": \"AroFi Admin\",\n  \"short_name\": \"AroFi\",\n  \"description\": \"Hotspot billing, vouchers, routers, and tenant operations.\",\n  \"start_url\": \"/dashboard\",\n  \"scope\": \"/\",\n  \"display\": \"standalone\",\n  \"background_color\": \"#ffffff\",\n  \"theme_color\": \"#22A53A\",\n  \"orientation\": \"any\",\n  \"icons\": [\n    {\n      \"src\": \"/brand/arofi-square-icon.png\",\n      \"sizes\": \"1254x1254\",\n      \"type\": \"image/png\",\n      \"purpose\": \"any maskable\"\n    }\n  ]\n}\n""",
    encoding="utf-8",
)

# ---------------------------------------------------------------------------
# Public website: make the redesign visible on the real class names used by
# page.tsx/PremiumHero instead of only legacy aliases.
# ---------------------------------------------------------------------------
public_css = ROOT / "apps/admin-web/src/styles/public-responsive-overrides.css"
append_once(
    public_css,
    "/* AROFI_PUBLIC_REDESIGN_V2 */",
    r"""
/* AROFI_PUBLIC_REDESIGN_V2 */
.home-shell {
  --public-green: #22A53A;
  --public-green-dark: #197C2C;
  --public-ink: #122033;
  --public-muted: #667382;
  background:
    radial-gradient(circle at 12% 4%, rgba(34,165,58,.09), transparent 30rem),
    linear-gradient(180deg, #f8faf9 0%, #f4f7f5 100%);
}
.home-nav {
  position: sticky;
  top: 10px;
  z-index: 70;
  width: min(calc(100% - 28px), 1180px);
  min-height: 68px;
  margin: 10px auto 0;
  padding: 8px 12px 8px 16px;
  border: 1px solid #e1e7e3;
  border-radius: 14px;
  background: rgba(255,255,255,.94);
  box-shadow: 0 8px 30px rgba(18,32,51,.07);
  backdrop-filter: blur(14px);
}
.home-brand { min-width: 190px; display: flex; align-items: center; }
.home-brand img {
  width: 182px;
  height: 48px;
  object-fit: contain;
  object-position: left center;
  border-radius: 7px;
}
.home-brand-text { display: none; }
.home-nav-links a { font-size: 13.5px; font-weight: 650; color: #41505f; }
.home-nav-links a:hover { color: var(--public-green); }
.home-actions .btn-primary,
.home-actions button[data-primary="true"] { background: var(--public-green); }

.ph-hero {
  width: min(calc(100% - 28px), 1180px) !important;
  margin: 26px auto 0 !important;
  padding: clamp(44px, 6vw, 74px) clamp(22px, 4vw, 52px) !important;
  border: 1px solid #dfe8e1;
  border-radius: 20px;
  overflow: hidden;
  background:
    radial-gradient(circle at 84% 18%, rgba(34,165,58,.18), transparent 28rem),
    linear-gradient(135deg, #ffffff 0%, #f2fbf4 55%, #e8f7ec 100%) !important;
  box-shadow: 0 12px 42px rgba(18,32,51,.075);
}
.ph-eyebrow { color: var(--public-green-dark) !important; background: #eaf7ed !important; border-color: #cae9d0 !important; }
.ph-copy h1 { color: var(--public-ink) !important; letter-spacing: -.045em; }
.ph-copy h1 span { color: var(--public-green) !important; }
.ph-lead { color: var(--public-muted) !important; }
.ph-btn-primary { background: var(--public-green) !important; border-color: var(--public-green) !important; box-shadow: none !important; }
.ph-btn-primary:hover { background: var(--public-green-dark) !important; }
.ph-btn-secondary { background: #fff !important; border-color: #dce4df !important; color: #273747 !important; box-shadow: none !important; }
.ph-status-live { color: var(--public-green-dark) !important; }
.ph-dash-sidebar .active,
.ph-phone-nav .active { color: #fff !important; background: var(--public-green) !important; }
.ph-line-chart,
.ph-phone-chart-card svg { color: var(--public-green) !important; }

.home-why {
  margin-top: 18px;
  gap: 12px;
}
.home-why-card,
.home-feature,
.home-preview-grid > *,
.home-blog-card,
.home-faq-item,
.home-pricing-card {
  border: 1px solid #e1e7e3 !important;
  border-radius: 14px !important;
  background: #fff !important;
  box-shadow: 0 2px 10px rgba(18,32,51,.035) !important;
}
.home-why-card { padding: 20px !important; }
.home-why-card strong { color: var(--public-green) !important; font-size: 22px !important; }
.home-section,
.home-pricing {
  margin-top: clamp(54px, 7vw, 86px) !important;
}
.home-section-head,
.home-pricing-head { max-width: 720px; }
.home-section-head h2,
.home-pricing-head h2 { color: var(--public-ink); letter-spacing: -.035em; }
.home-section-head p,
.home-pricing-head p { color: var(--public-muted); }
.home-kicker {
  width: fit-content;
  padding: 5px 9px;
  border-radius: 999px;
  background: #eaf7ed;
  color: var(--public-green-dark) !important;
  font-weight: 800;
}
.home-feature-grid { gap: 12px !important; }
.home-feature {
  padding: 21px !important;
  transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
}
.home-feature:hover {
  transform: translateY(-2px);
  border-color: #b7ddbf !important;
  box-shadow: 0 8px 24px rgba(18,32,51,.07) !important;
}
.home-feature > svg { color: var(--public-green) !important; }
.home-feature h3 { color: var(--public-ink); }
.home-feature p { color: var(--public-muted); }
.home-pricing-card.featured { border: 1.5px solid var(--public-green) !important; transform: translateY(-5px); }
.home-pricing-badge { background: var(--public-green) !important; }
.home-pricing-card .btn-primary { background: var(--public-green) !important; border-color: var(--public-green) !important; }
.home-contact-card {
  border: 1px solid #cfe7d4 !important;
  background: linear-gradient(135deg, #eef9f1 0%, #fff 70%) !important;
}
.home-contact-item { border-color: #dce7de !important; background: rgba(255,255,255,.88) !important; }
.home-contact-item svg { color: var(--public-green) !important; }
.site-footer {
  margin-top: 80px;
  border-top: 0 !important;
  background: #111916 !important;
  color: #d7dfda !important;
}
.site-footer-inner { padding-top: 48px !important; }
.site-footer-brand img {
  width: 190px !important;
  height: 58px !important;
  object-fit: contain;
  object-position: left center;
  padding: 4px;
  border-radius: 9px;
  background: #fff;
}
.site-footer-brand > span { display: none; }
.site-footer h4 { color: #fff !important; }
.site-footer a { color: #b9c7bf !important; }
.site-footer a:hover { color: #55c66a !important; }
.site-footer-bottom { border-top-color: rgba(255,255,255,.1) !important; color: #89968f !important; }

[data-theme="dark"] .home-shell {
  background:
    radial-gradient(circle at 12% 4%, rgba(34,165,58,.10), transparent 30rem),
    #0b0805;
}
[data-theme="dark"] .home-nav {
  background: rgba(23,23,23,.95);
  border-color: #303030;
  box-shadow: 0 10px 36px rgba(0,0,0,.25);
}
[data-theme="dark"] .home-brand img {
  content: url('/brand/arofi-icon-only-dark.png');
  width: 42px;
  height: 42px;
  border-radius: 9px;
}
[data-theme="dark"] .home-brand-text {
  display: inline-block;
  margin-left: 9px;
  color: #e6e6e6;
  font-size: 19px;
  font-weight: 800;
}
[data-theme="dark"] .home-nav-links a { color: #c1c8c3; }
[data-theme="dark"] .ph-hero {
  border-color: #303630;
  background:
    radial-gradient(circle at 82% 15%, rgba(34,165,58,.15), transparent 27rem),
    linear-gradient(135deg, #171717 0%, #111713 100%) !important;
  box-shadow: none;
}
[data-theme="dark"] .ph-copy h1,
[data-theme="dark"] .home-section-head h2,
[data-theme="dark"] .home-pricing-head h2 { color: #ededed !important; }
[data-theme="dark"] .ph-lead,
[data-theme="dark"] .home-section-head p,
[data-theme="dark"] .home-pricing-head p { color: #9da7a1 !important; }
[data-theme="dark"] .ph-btn-secondary { background: #202020 !important; border-color: #353535 !important; color: #e2e2e2 !important; }
[data-theme="dark"] .home-why-card,
[data-theme="dark"] .home-feature,
[data-theme="dark"] .home-preview-grid > *,
[data-theme="dark"] .home-blog-card,
[data-theme="dark"] .home-faq-item,
[data-theme="dark"] .home-pricing-card {
  border-color: #303030 !important;
  background: #202020 !important;
  box-shadow: none !important;
}
[data-theme="dark"] .home-feature h3 { color: #e6e6e6; }
[data-theme="dark"] .home-feature p { color: #9a9a9a; }
[data-theme="dark"] .home-contact-card { border-color: #304134 !important; background: linear-gradient(135deg, #18231a 0%, #202020 72%) !important; }
[data-theme="dark"] .home-contact-item { border-color: #353535 !important; background: #1b1b1b !important; }

@media (max-width: 760px) {
  .home-nav { top: 6px; width: calc(100% - 16px); margin-top: 6px; padding-inline: 10px; }
  .home-brand { min-width: 0; }
  .home-brand img { width: 138px; height: 42px; }
  .ph-hero { width: calc(100% - 16px) !important; margin-top: 14px !important; padding: 34px 18px 30px !important; border-radius: 16px; }
  .home-why,
  .home-section,
  .home-pricing { padding-inline: 14px !important; }
  .home-pricing-card.featured { transform: none; }
}
""",
)

# ---------------------------------------------------------------------------
# Product name casing: visible/SEO/PWA text must read “AroFi” everywhere.
# Do not touch internal AROFI_* environment variables because this replacement
# is case-sensitive and only targets the former mixed-case product spelling.
# ---------------------------------------------------------------------------
text_exts = {".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json", ".webmanifest", ".txt", ".md", ".xml"}
target_roots = [
    ROOT / "apps/admin-web/src",
    ROOT / "apps/portal-web/src",
    ROOT / "apps/portal-web/public",
]
for target_root in target_roots:
    if not target_root.exists():
        continue
    for path in target_root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in text_exts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if "AROFi" in text:
            path.write_text(text.replace("AROFi", "AroFi"), encoding="utf-8")

for path in [
    ROOT / "apps/admin-web/public/manifest.webmanifest",
    ROOT / "apps/admin-web/public/llms.txt",
    ROOT / "apps/admin-web/public/sw.js",
    ROOT / "apps/api/src/modules/routers/login-template.html",
]:
    if path.exists():
        text = path.read_text(encoding="utf-8")
        if "AROFi" in text:
            path.write_text(text.replace("AROFi", "AroFi"), encoding="utf-8")

print("AroFi brand polish applied: KPI stats, sidebar readability, public redesign, brand casing/assets.")
