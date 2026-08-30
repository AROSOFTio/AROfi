#!/usr/bin/env python3
"""Normalize repeated captive-portal quick-action classes before the premium UI guard.

Earlier portal compatibility patches intentionally reuse the same Tailwind class token for
both Smart TV and returning-buyer actions. The premium UI guard historically expected that
source token to occur once, which made otherwise valid production builds fail before Next.js
could compile. Normalize every identical quick-action token to the final premium class first;
the stricter guard can then validate wording/layout invariants without depending on occurrence
count.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTAL = ROOT / "apps/portal-web/src/components/PortalCheckout.tsx"

OLD = 'className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold ${portalStyle.link}`}'
NEW = 'className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-extrabold tracking-tight ${portalStyle.link}`}'


def main() -> None:
    if not PORTAL.exists():
        raise RuntimeError("Premium portal pre-normalizer rejected: PortalCheckout.tsx is missing")

    text = PORTAL.read_text(encoding="utf-8")
    source_count = text.count(OLD)

    if source_count:
        text = text.replace(OLD, NEW)
        PORTAL.write_text(text, encoding="utf-8")
        print(f"Premium portal action classes normalized: {source_count} repeated source token(s) updated.")
        return

    if NEW in text:
        print("Premium portal action classes already normalized.")
        return

    raise RuntimeError("Premium portal pre-normalizer rejected: no source or final quick-action class token found")


if __name__ == "__main__":
    main()
