#!/usr/bin/env python3
"""Keep MikroTik one-run commands literal and clipboard-safe.

The RouterOS command must never contain rich-text Markdown links or escaped
command prefixes. This guarded build patch normalizes both API-generated and
legacy fallback commands immediately before they are displayed or copied.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "apps/admin-web/src/components/RoutersManager.tsx"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one target, found {count}")
    return text.replace(old, new, 1)


text = ADMIN.read_text()

if "function normalizeRouterOsCommand(value: string)" not in text:
    marker = """function parseHosts(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

"""
    helper = marker + """function normalizeRouterOsCommand(value: string) {
  return value
    // Rich-text editors sometimes turn a literal URL into [url](url). RouterOS
    // needs only the URL inside the quotes.
    .replace(/\[(https?:\\/\\/[^\]]+)\]\((https?:\\/\\/[^)]+)\)/gi, '$2')
    // Remove accidental escaping added by chat/rich-text copies, e.g. \\:if.
    .replace(/\\\\:/g, ':')
    // Invisible formatting characters can make an otherwise correct command fail.
    .replace(/[\\u200B-\\u200D\\uFEFF]/g, '')
    .replace(/\\u00A0/g, ' ')
    .trim()
}

"""
    text = replace_once(text, marker, helper, "RouterOS command normalizer")

old_function = """  function oneRunCommand() {
    if (!selectedSetup) return ''
    const registrationKey = selectedSetup.router.registrationKey
    return selectedSetup.oneRunCommand ?? (registrationKey ? buildSetupFallbackCommand(registrationKey) : '')
  }
"""
new_function = """  function oneRunCommand() {
    if (!selectedSetup) return ''
    const registrationKey = selectedSetup.router.registrationKey
    const command = selectedSetup.oneRunCommand
      ?? (registrationKey ? buildSetupFallbackCommand(registrationKey) : '')
    return normalizeRouterOsCommand(command)
  }
"""

if "return normalizeRouterOsCommand(command)" not in text:
    text = replace_once(text, old_function, new_function, "one-run command normalization")

required = [
    "function normalizeRouterOsCommand(value: string)",
    ".replace(/\\\\:/g, ':')",
    "return normalizeRouterOsCommand(command)",
]
for sentinel in required:
    if sentinel not in text:
        raise RuntimeError(f"MikroTik command sanitizer missing sentinel: {sentinel}")

ADMIN.write_text(text)
print("MikroTik command output sanitizer applied.")
