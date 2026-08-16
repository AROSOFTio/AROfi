#!/usr/bin/env python3
"""Make browser-side MikroTik macro detection safe before TypeScript compilation.

HotSpot HTML is processed by RouterOS before it reaches the captive browser.
Therefore browser JavaScript must never contain a literal ``'$(`` sentinel: the
router may treat it as a template macro and corrupt the script. Construct the
sentinel at runtime from character codes instead.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    ROOT / "apps/api/src/modules/routers/mikrotik.service.ts",
    ROOT / "apps/api/src/modules/routers/router-captive-flow.initializer.ts",
    ROOT / "apps/api/src/modules/routers/mikrotik.controller.ts",
)

UNSAFE_SINGLE = "indexOf('$(')"
UNSAFE_DOUBLE = 'indexOf("$(")'
SAFE = "indexOf(String.fromCharCode(36,40))"


def main() -> None:
    for path in FILES:
        if not path.exists():
            raise RuntimeError(f"RouterOS JS safety patch: missing {path.relative_to(ROOT)}")

        text = path.read_text(encoding="utf-8")
        text = text.replace(UNSAFE_SINGLE, SAFE).replace(UNSAFE_DOUBLE, SAFE)

        if UNSAFE_SINGLE in text or UNSAFE_DOUBLE in text:
            raise RuntimeError(
                f"RouterOS JS safety patch: unsafe literal macro sentinel remains in {path.relative_to(ROOT)}"
            )
        if "String.fromCharCode(36,40)" not in text:
            raise RuntimeError(
                f"RouterOS JS safety patch: safe sentinel missing in {path.relative_to(ROOT)}"
            )

        path.write_text(text, encoding="utf-8")

    print(
        "RouterOS captive JavaScript sentinel hardened: literal '$(' checks replaced "
        "with runtime character construction before TypeScript compilation."
    )


if __name__ == "__main__":
    main()
