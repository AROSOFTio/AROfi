from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Final user-supplied AroFi assets. These are visual/branding overrides only.
# Keep visible UI spelling as AroFi; internal AROFI_* identifiers stay unchanged.
text_exts = {'.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json', '.webmanifest'}
replacements = {
    '/brand/arofi-logo-main.svg': '/brand/arofi-main-logo.webp',
    '/brand/arofi-logo-blue.svg': '/brand/arofi-main-logo.webp',
    '/brand/arofi-logo-app-icon-light.svg': '/brand/arofi-square-icon.webp',
    '/brand/arofi-favicon-v2.svg': '/brand/arofi-square-icon.webp',
    '/brand/arofi-logo-mark-dark.svg': '/brand/arofi-icon-only-dark.webp',
    '/brand/arofi-mark-blue.svg': '/brand/arofi-icon-only-dark.webp',
}

for root in [ROOT / 'apps/admin-web/src', ROOT / 'apps/admin-web/public']:
    if not root.exists():
        continue
    for path in root.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in text_exts:
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        updated = text
        for old, new in replacements.items():
            updated = updated.replace(old, new)
        if updated != text:
            path.write_text(updated, encoding='utf-8')

layout = ROOT / 'apps/admin-web/src/app/layout.tsx'
if layout.exists():
    text = layout.read_text(encoding='utf-8')
    text = text.replace("type: 'image/svg+xml', sizes: 'any'", "type: 'image/webp', sizes: '512x512'")
    text = text.replace('type="image/svg+xml"', 'type="image/webp"')
    layout.write_text(text, encoding='utf-8')

manifest = ROOT / 'apps/admin-web/public/manifest.webmanifest'
if manifest.exists():
    text = manifest.read_text(encoding='utf-8')
    text = text.replace('"src": "/brand/arofi-logo-app-icon-light.svg"', '"src": "/brand/arofi-square-icon.webp"')
    text = text.replace('"sizes": "any"', '"sizes": "512x512"')
    text = text.replace('"type": "image/svg+xml"', '"type": "image/webp"')
    manifest.write_text(text, encoding='utf-8')

# Recovery pages are patched after the Africa pass. Force the final visible logo
# to the exact user-supplied wordmark asset.
for rel in [
    'apps/admin-web/src/app/login/page.tsx',
    'apps/admin-web/src/app/forgot-password/page.tsx',
    'apps/admin-web/src/app/forgot-email/page.tsx',
    'apps/admin-web/src/app/reset-password/page.tsx',
]:
    path = ROOT / rel
    if path.exists():
        text = path.read_text(encoding='utf-8')
        text = text.replace('/brand/arofi-logo-main.svg', '/brand/arofi-main-logo.webp')
        text = text.replace('/brand/arofi-logo-blue.svg', '/brand/arofi-main-logo.webp')
        path.write_text(text, encoding='utf-8')

print('AroFi user-supplied brand assets applied.')
