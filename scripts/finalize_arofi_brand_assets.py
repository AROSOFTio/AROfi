from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

replacements = {
    "/brand/arofi-main-logo.png": "/brand/arofi-main-logo.webp",
    "/brand/arofi-square-icon.png": "/brand/arofi-square-icon.webp",
    "/brand/arofi-icon-only-dark.png": "/brand/arofi-icon-only-dark.webp",
}

for path in [
    ROOT / "apps/admin-web/src/app/page.tsx",
    ROOT / "apps/admin-web/src/app/layout.tsx",
    ROOT / "apps/admin-web/src/components/Sidebar.tsx",
    ROOT / "apps/admin-web/src/components/SiteFooter.tsx",
    ROOT / "apps/admin-web/src/styles/public-responsive-overrides.css",
    ROOT / "apps/admin-web/public/manifest.webmanifest",
]:
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    for old, new in replacements.items():
        text = text.replace(old, new)
    if path.name == "layout.tsx":
        text = text.replace("type: 'image/png'", "type: 'image/webp'")
        text = text.replace('type="image/png"', 'type="image/webp"')
    if path.name == "manifest.webmanifest":
        text = text.replace('"type": "image/png"', '"type": "image/webp"')
    path.write_text(text, encoding="utf-8")

vendor = ROOT / "apps/admin-web/src/components/VendorBusinessDashboard.tsx"
if vendor.exists():
    text = vendor.read_text(encoding="utf-8")
    text = text.replace("  const routerHealthLabel = totalRouters > 0 ? `${onlineRouters}/${totalRouters} available` : 'No routers yet'\n", "")
    vendor.write_text(text, encoding="utf-8")

print("AroFi supplied WebP brand assets finalized.")
