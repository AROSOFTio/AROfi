#!/usr/bin/env python3
"""Normalize icon names for the lucide-react version used by admin-web.

lucide-react 0.330.0 exports AlertCircle and Briefcase, while newer examples
may use renamed/newer symbols such as CircleAlert or BriefcaseBusiness.
Build-time source generators can recreate those imports, so this compatibility
pass runs after all generators and before the Next.js build.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOTS = [
    ROOT / "apps" / "admin-web" / "src",
    ROOT / "apps" / "portal-web" / "src",
]

REPLACEMENTS = {
    "CircleAlert": "AlertCircle",
    "BriefcaseBusiness": "Briefcase",
}

changed_files: list[str] = []
for source_root in SOURCE_ROOTS:
    if not source_root.exists():
        continue
    for path in source_root.rglob("*"):
        if path.suffix not in {".ts", ".tsx"} or not path.is_file():
            continue
        original = path.read_text(encoding="utf-8")
        updated = original
        for unsupported, supported in REPLACEMENTS.items():
            updated = updated.replace(unsupported, supported)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed_files.append(str(path.relative_to(ROOT)))

if changed_files:
    print("Normalized lucide icons in:")
    for changed_file in changed_files:
        print(f" - {changed_file}")
else:
    print("No lucide icon compatibility changes were required.")
