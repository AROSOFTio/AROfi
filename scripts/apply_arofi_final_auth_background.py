from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_required(path: Path, old: str, new: str, count: int = -1) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected pattern not found in {path}: {old[:160]!r}")
    path.write_text(text.replace(old, new, count), encoding="utf-8")


def append_once(path: Path, marker: str, block: str) -> None:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    path.write_text(text.rstrip() + "\n\n" + block.strip() + "\n", encoding="utf-8")


# Login: add a clear way back to the public AroFi site.
login = ROOT / "apps/admin-web/src/app/login/page.tsx"
replace_required(
    login,
    '        <div className="login-card">\n          <div className="login-brand">',
    '        <div className="login-card">\n          <a href="/" className="auth-back-link">← Back to AroFi</a>\n          <div className="login-brand">',
    1,
)

# Forgot/recovery pages: use the supplied AroFi brand and show a clear
# top-level back control in addition to the existing footer links.
for relative_path, back_href, back_label in [
    ("apps/admin-web/src/app/forgot-password/page.tsx", "/login", "← Back to sign in"),
    ("apps/admin-web/src/app/forgot-email/page.tsx", "/login", "← Back to sign in"),
    ("apps/admin-web/src/app/reset-password/page.tsx", "/login", "← Back to sign in"),
]:
    path = ROOT / relative_path
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        '<img src="/logo.png" alt="AroFi Logo" style={{ width: 72, height: \'auto\', margin: \'0 auto 10px\', display: \'block\' }} />',
        '<img src="/brand/arofi-logo-main.svg" alt="AroFi" className="brand-logo login-logo" />',
        1,
    )
    marker = '<div className="login-card">\n'
    if 'className="auth-back-link"' not in text:
        if marker not in text:
            raise SystemExit(f"Expected login-card marker not found in {path}")
        text = text.replace(
            marker,
            marker + f'      <Link href="{back_href}" className="auth-back-link">{back_label}</Link>\n',
            1,
        )
    path.write_text(text, encoding="utf-8")

# The supplied final background is used by every page that shares login-page.
# Force the shell to fill the viewport even where legacy inline maxWidth exists.
css = ROOT / "apps/admin-web/src/app/globals.css"
append_once(
    css,
    "/* AROFI_FINAL_AUTH_BACKGROUND_V4 */",
    r'''
/* AROFI_FINAL_AUTH_BACKGROUND_V4 */
.login-page {
  min-height: 100vh !important;
  width: 100% !important;
  background-image: url('/brand/arofi-login-background.webp') !important;
  background-size: cover !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  background-attachment: fixed !important;
}
.login-shell {
  width: 100% !important;
  max-width: none !important;
  min-height: 100vh !important;
  position: relative;
  justify-content: flex-end !important;
}
.auth-back-link {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin: 0 0 16px;
  color: #197C2C !important;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}
.auth-back-link:hover { color: #125f22 !important; text-decoration: underline; }
@media (max-width: 900px) {
  .login-shell { justify-content: center !important; }
  .login-page { background-position: 30% center !important; }
}
''',
)

# Last visual-only pass: route all visible branding to the exact supplied
# AroFi assets after the preceding patches have finished.
runpy.run_path(str(ROOT / "scripts/apply_arofi_user_asset_override.py"), run_name="__main__")

print("AroFi final auth background, back navigation and supplied assets applied.")
