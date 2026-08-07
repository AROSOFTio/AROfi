#!/usr/bin/env python3
"""Keep public AROFi claims aligned with production payment behaviour.

The repository uses build-time source patches for features assembled from several
parallel implementation passes. This pass removes outdated promises that a
withdrawal is always instant and replaces them with provider-controlled wording.
"""

from pathlib import Path

PAGE = Path("apps/admin-web/src/app/page.tsx")

REPLACEMENTS = {
    "title: 'Instant Withdrawals', text: 'Cash out to your approved mobile money number the moment you need it.'": (
        "title: 'Controlled Withdrawals', text: 'Request payouts to an approved mobile money number. Processing depends on the live gateway, wallet balance, limits, and provider status.'"
    ),
    "Withdraw to your approved MTN or Airtel number whenever you like; approved withdrawals are processed instantly.": (
        "Request a withdrawal to your approved MTN or Airtel number when funds are available. The active live gateway processes it subject to wallet balance, transaction limits, compliance controls, and provider status."
    ),
    "Customer selects a plan, enters phone number, confirms PIN, and gets connected instantly.": (
        "Customer selects a plan, enters a phone number, confirms the prompt, and is connected after the provider confirms payment."
    ),
    "{ icon: ShieldCheck, title: 'Bank-Grade Security', text: 'Encrypted payments, isolated business workspaces, and secret-key protected withdrawals.' }": (
        "{ icon: ShieldCheck, title: 'Security Controls', text: 'Isolated business workspaces, protected credentials, and separate withdrawal security controls.' }"
    ),
}


def main() -> None:
    source = PAGE.read_text(encoding="utf-8")
    updated = source

    for old, new in REPLACEMENTS.items():
        if old in updated:
            updated = updated.replace(old, new)
        elif new not in updated:
            raise SystemExit(f"Expected public-content marker not found: {old[:90]}")

    if updated != source:
        PAGE.write_text(updated, encoding="utf-8")
        print("Updated public homepage claims")
    else:
        print("Public homepage claims already current")


if __name__ == "__main__":
    main()
