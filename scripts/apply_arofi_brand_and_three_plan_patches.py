#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TEXT_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".md", ".txt", ".css", ".svg", ".webmanifest"
}


def replace_required(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text and old not in text:
        return
    if old not in text:
        raise SystemExit(f"{label}: expected source marker not found in {path}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def normalize_brand_display() -> None:
    # Exact mixed-case AROFi is the legacy display spelling. Internal technical
    # identifiers such as AROFI_IMAGE_TAG remain untouched because they use the
    # all-uppercase AROFI token, not this display token.
    roots = [
        ROOT / "apps/admin-web/src",
        ROOT / "apps/portal-web/src",
        ROOT / "apps/api/src",
        ROOT / "apps/admin-web/public",
        ROOT / "apps/portal-web/public",
    ]
    for base in roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            updated = text.replace("AROFi", "AroFi")
            if updated != text:
                path.write_text(updated, encoding="utf-8")


def patch_subscription_catalog() -> None:
    dto = ROOT / "apps/api/src/modules/subscription/dto/select-plan.dto.ts"
    replace_required(
        dto,
        "export const SUBSCRIPTION_PLAN_KEYS = ['FREE', 'PRO'] as const",
        "export const SUBSCRIPTION_PLAN_KEYS = ['FREE', 'PRO', 'ENTERPRISE'] as const",
        "subscription plan DTO",
    )

    service = ROOT / "apps/api/src/modules/subscription/subscription.service.ts"
    text = service.read_text(encoding="utf-8")

    old_catalog = """  FREE: {\n    name: 'Starter (Free)',\n    amountUgx: 0,\n    routerLimit: 'Unlimited Routers',\n    features: ['Unlimited routers and hotspots', 'MTN MoMo & Airtel collection', 'Voucher sales and wallets', 'Cloud WinBox Tunnels', 'Live sales dashboard', 'AroFi branding'],\n  },\n  PRO: {\n    name: 'Pro Plan',\n    amountUgx: 20000,\n    durationDays: 30,\n    routerLimit: 'Unlimited Routers',\n    features: [\n      'Everything in Starter',\n      '4% gateway fee',\n      'Free voucher sales',\n      'Custom branding',\n      '100 SMS/month included',\n      'Buy extra SMS at UGX 40 each',\n      'Router outage compensation alerts',\n      '30-day analytics history',\n      'Priority support',\n    ],\n  },\n"""
    new_catalog = """  FREE: {\n    name: 'Free',\n    amountUgx: 0,\n    routerLimit: 'Unlimited Routers',\n    features: [\n      'Unlimited routers and hotspots',\n      'MTN MoMo & Airtel collection',\n      'Voucher sales and wallets',\n      'Agents',\n      'Cloud WinBox Tunnels',\n      'Live sales dashboard',\n      'AroFi branding',\n    ],\n  },\n  PRO: {\n    name: 'Pro',\n    amountUgx: 18000,\n    durationDays: 30,\n    routerLimit: 'Unlimited Routers',\n    features: [\n      'Everything in Free',\n      'Lower Mobile Money fees',\n      'Free voucher sales',\n      'Custom logo and colours',\n      'SMS alerts',\n      'Smart TV package workflows',\n      'Router outage compensation alerts',\n      '30-day analytics history',\n      'Priority support',\n    ],\n  },\n  ENTERPRISE: {\n    name: 'Enterprise',\n    amountUgx: 30000,\n    durationDays: 30,\n    routerLimit: 'Unlimited Routers',\n    features: [\n      'Everything in Pro',\n      'Connect own domain (Coming soon)',\n      'Connect own APIs (Coming soon)',\n      'White label (Coming soon)',\n    ],\n  },\n"""
    if new_catalog not in text:
        if old_catalog not in text:
            raise SystemExit("subscription catalog: expected FREE/PRO catalog marker not found")
        text = text.replace(old_catalog, new_catalog)

    old_commissions = """    const commissionSummaryByPlan: Record<SubscriptionPlanKey, string> = {\n      FREE: this.formatCommissionSummary(platformSettings.mobileMoneyFeeBps, platformSettings.voucherFeeBps),\n      PRO: this.formatCommissionSummary(platformSettings.proMobileMoneyFeeBps, platformSettings.proVoucherFeeBps),\n    }\n"""
    new_commissions = """    const commissionSummaryByPlan: Record<SubscriptionPlanKey, string> = {\n      FREE: this.formatCommissionSummary(platformSettings.mobileMoneyFeeBps, platformSettings.voucherFeeBps),\n      PRO: this.formatCommissionSummary(platformSettings.proMobileMoneyFeeBps, platformSettings.proVoucherFeeBps),\n      ENTERPRISE: this.formatCommissionSummary(platformSettings.enterpriseMobileMoneyFeeBps, platformSettings.enterpriseVoucherFeeBps),\n    }\n"""
    if new_commissions not in text:
        if old_commissions not in text:
            raise SystemExit("subscription catalog: commission map marker not found")
        text = text.replace(old_commissions, new_commissions)

    text = text.replace("Starter (Free)", "Free")
    text = text.replace("Starter fees", "Free plan fees")
    text = text.replace("Starter plan", "Free plan")
    text = text.replace("Subscription moved to Starter", "Subscription moved to Free")

    service.write_text(text, encoding="utf-8")

    # New databases should also start at the approved Pro price/copy. Existing
    # databases are updated by the migration committed with this patch.
    schema = ROOT / "apps/api/prisma/schema.prisma"
    schema_text = schema.read_text(encoding="utf-8")
    schema_text = schema_text.replace("proSubscriptionPriceUgx    Int      @default(20000)", "proSubscriptionPriceUgx    Int      @default(18000)")
    schema_text = schema_text.replace(
        'freePlanDescription        String   @default("Starter plan with no monthly subscription. Services remain active with standard transaction fees.")',
        'freePlanDescription        String   @default("Free plan with no monthly subscription. Services remain active with standard transaction fees.")',
    )
    schema_text = schema_text.replace(
        'freePlanBenefits           String   @default("Cloud WinBox Tunnels|7-day analytics history|AROFi branding")',
        'freePlanBenefits           String   @default("Unlimited routers and hotspots|MTN MoMo & Airtel collection|Voucher sales and wallets|Agents|Cloud WinBox Tunnels|Live sales dashboard|AroFi branding")',
    )
    schema_text = schema_text.replace(
        'proPlanBenefits            String   @default("Cloud WinBox Tunnels|Custom Branding|30-day analytics history")',
        'proPlanBenefits            String   @default("Everything in Free|Lower Mobile Money fees|Free voucher sales|Custom logo and colours|SMS alerts|Smart TV package workflows|Router outage compensation alerts|30-day analytics history|Priority support")',
    )
    schema.write_text(schema_text, encoding="utf-8")


def patch_public_pricing() -> None:
    page = ROOT / "apps/admin-web/src/app/page.tsx"
    text = page.read_text(encoding="utf-8")
    text = text.replace("type SignupPlan = 'FREE' | 'PRO'", "type SignupPlan = 'FREE' | 'PRO' | 'ENTERPRISE'")
    text = text.replace(
        "setSignupPlan(plan === 'PRO' ? 'PRO' : plan === 'FREE' ? 'FREE' : null)",
        "setSignupPlan(plan === 'ENTERPRISE' ? 'ENTERPRISE' : plan === 'PRO' ? 'PRO' : plan === 'FREE' ? 'FREE' : null)",
    )

    old_tiers = """  {\n    key: 'FREE',\n    name: 'Starter',\n    priceUgx: 0,\n    period: null,\n    commissionSummary: 'Gateway fee 8% · Voucher 2%',\n    routerLimit: 'Unlimited routers and hotspots',\n    features: ['Unlimited routers and hotspots', 'MTN MoMo & Airtel collection', 'Voucher sales and wallets', 'Cloud WinBox tunnels', 'Live sales dashboard', 'AroFi branding'],\n    featured: false,\n  },\n  {\n    key: 'PRO',\n    name: 'Pro',\n    priceUgx: 20000,\n    period: '/month',\n    commissionSummary: 'Gateway fee 4% · Voucher free',\n    routerLimit: 'Unlimited routers and hotspots',\n    features: ['Everything in Starter', '4% gateway fee', 'Free voucher sales', 'Custom logo and colours', 'SMS alerts', 'Smart TV package workflows', 'Router outage compensation alerts', '30-day analytics history', 'Priority support'],\n    featured: true,\n  },\n"""
    new_tiers = """  {\n    key: 'FREE',\n    name: 'Free',\n    priceUgx: 0,\n    period: null,\n    commissionSummary: 'Gateway fee 8% · Voucher 2%',\n    routerLimit: 'Unlimited routers and hotspots',\n    features: ['Unlimited routers and hotspots', 'MTN MoMo & Airtel collection', 'Voucher sales and wallets', 'Agents', 'Cloud WinBox tunnels', 'Live sales dashboard', 'AroFi branding'],\n    featured: false,\n  },\n  {\n    key: 'PRO',\n    name: 'Pro',\n    priceUgx: 18000,\n    period: '/month',\n    commissionSummary: 'Lower transaction fees',\n    routerLimit: 'Unlimited routers and hotspots',\n    features: ['Everything in Free', 'Lower Mobile Money fees', 'Free voucher sales', 'Custom logo and colours', 'SMS alerts', 'Smart TV package workflows', 'Router outage compensation alerts', '30-day analytics history', 'Priority support'],\n    featured: true,\n  },\n  {\n    key: 'ENTERPRISE',\n    name: 'Enterprise',\n    priceUgx: 30000,\n    period: '/month',\n    commissionSummary: 'Best transaction rates',\n    routerLimit: 'Unlimited routers and hotspots',\n    features: ['Everything in Pro', 'Connect own domain (Coming soon)', 'Connect own APIs (Coming soon)', 'White label (Coming soon)'],\n    featured: false,\n  },\n"""
    if new_tiers not in text:
        if old_tiers not in text:
            raise SystemExit("homepage pricing: expected old pricing tiers not found")
        text = text.replace(old_tiers, new_tiers)

    text = text.replace("Starter stays free", "Free stays free")
    text = text.replace("Starter and Pro", "Free, Pro and Enterprise")
    text = text.replace("Starter fees", "Free plan fees")
    text = text.replace("Starter plan", "Free plan")
    page.write_text(text, encoding="utf-8")

    register = ROOT / "apps/admin-web/src/components/RegisterModal.tsx"
    register_text = register.read_text(encoding="utf-8")
    old_cards = """const PLAN_CARDS = [\n  {\n    key: 'FREE',\n    name: 'Starter (Free)',\n    price: 'UGX 0 / Month',\n    desc: 'Perfect for testing and small operations starting out.',\n    color: '#64748b',\n    badge: undefined as string | undefined,\n  },\n  {\n    key: 'PRO',\n    name: 'Pro Plan',\n    price: 'UGX 20,000 / Month',\n    desc: 'For growing ISPs wanting lower fees and branding control.',\n    color: 'var(--arofi-theme-accent)',\n    badge: 'Recommended',\n  },\n] as const\n"""
    new_cards = """const PLAN_CARDS = [\n  {\n    key: 'FREE',\n    name: 'Free',\n    price: 'UGX 0 / Month',\n    desc: 'Core AroFi WiFi billing with vouchers, Mobile Money, wallets and Agents.',\n    color: '#64748b',\n    badge: undefined as string | undefined,\n  },\n  {\n    key: 'PRO',\n    name: 'Pro',\n    price: 'UGX 18,000 / Month',\n    desc: 'Everything in Free, with lower fees and advanced operator tools.',\n    color: 'var(--arofi-theme-accent)',\n    badge: 'Recommended',\n  },\n  {\n    key: 'ENTERPRISE',\n    name: 'Enterprise',\n    price: 'UGX 30,000 / Month',\n    desc: 'Everything in Pro, with upcoming domain, API and white-label controls.',\n    color: '#0f172a',\n    badge: undefined as string | undefined,\n  },\n] as const\n"""
    if new_cards not in register_text:
        if old_cards not in register_text:
            raise SystemExit("register pricing: expected old plan cards not found")
        register_text = register_text.replace(old_cards, new_cards)
    register_text = register_text.replace("Starter continues free", "Free continues without a subscription payment")
    register_text = register_text.replace("Mobile money number for your Pro subscription", "Mobile Money number for your selected paid subscription")
    register.write_text(register_text, encoding="utf-8")

    settings = ROOT / "apps/admin-web/src/components/SettingsManager.tsx"
    settings_text = settings.read_text(encoding="utf-8")
    settings_text = settings_text.replace("key: 'FREE' | 'PRO'", "key: 'FREE' | 'PRO' | 'ENTERPRISE'")
    old_meta = """const PLAN_CARD_META: Record<string, { price: string; desc: string; color: string; badge?: string }> = {\n  FREE: { price: 'UGX 0 / Month', desc: 'Perfect for testing and small operations starting out.', color: '#64748b' },\n  PRO: {\n    price: 'UGX 20,000 / Month',\n    desc: 'For growing ISPs wanting lower fees and branding control.',\n    color: 'var(--green)',\n    badge: 'Recommended',\n  },\n}\n"""
    new_meta = """const PLAN_CARD_META: Record<string, { price: string; desc: string; color: string; badge?: string }> = {\n  FREE: { price: 'UGX 0 / Month', desc: 'Core AroFi WiFi billing with vouchers, Mobile Money, wallets and Agents.', color: '#64748b' },\n  PRO: {\n    price: 'UGX 18,000 / Month',\n    desc: 'Everything in Free, with lower fees and advanced operator tools.',\n    color: 'var(--green)',\n    badge: 'Recommended',\n  },\n  ENTERPRISE: {\n    price: 'UGX 30,000 / Month',\n    desc: 'Everything in Pro, with upcoming domain, API and white-label controls.',\n    color: '#0f172a',\n  },\n}\n"""
    if new_meta not in settings_text:
        if old_meta not in settings_text:
            raise SystemExit("settings pricing: expected old plan card metadata not found")
        settings_text = settings_text.replace(old_meta, new_meta)
    settings_text = settings_text.replace("Switched to the Starter (Free) plan.", "Switched to the Free plan.")
    settings.write_text(settings_text, encoding="utf-8")


def main() -> None:
    # Normalize display casing first so all targeted replacement markers use the
    # approved AroFi spelling.
    normalize_brand_display()
    patch_subscription_catalog()
    patch_public_pricing()
    print("AroFi branding and Free/Pro/Enterprise plan patches applied")


if __name__ == "__main__":
    main()
