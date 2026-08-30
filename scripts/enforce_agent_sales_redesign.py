#!/usr/bin/env python3
"""Lock the simplified Agent selling workflow into the production build.

Agent requirements:
- selling WiFi is the primary Agent action;
- code delivery is the default, phone-free path;
- customer phone is optional metadata (Mobile Money still requires a paying phone);
- the 6-digit captive claim remains available for immediate device activation;
- Agent-only navigation stays focused on sales, vouchers, money and support.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "apps/api/src/modules/agents/agent-sales.service.ts"
SIDEBAR = ROOT / "apps/admin-web/src/components/Sidebar.tsx"
SELL_PANEL = ROOT / "apps/admin-web/src/components/AgentSellPanel.tsx"
DASHBOARD = ROOT / "apps/admin-web/src/components/AgentDashboard.tsx"
DTO = ROOT / "apps/api/src/modules/agents/dto/agent-sales.dto.ts"


def replace_once(text: str, before: str, after: str, label: str) -> str:
    if after in text:
        return text
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"Agent sales redesign rejected: {label} expected 1 match, found {count}")
    return text.replace(before, after, 1)


def patch_service() -> None:
    text = SERVICE.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "  customerPhoneNumber: string\n  payingPhoneNumber: string",
        "  customerPhoneNumber?: string\n  payingPhoneNumber: string",
        "optional Agent payment customer phone",
    )

    text = replace_once(
        text,
        "    const customerPhoneNumber = this.phoneNumberService.normalize(dto.customerPhoneNumber)\n    const amountUgx = pkg.prices[0].amountUgx",
        "    const customerPhoneNumber = dto.customerPhoneNumber?.trim()\n      ? this.phoneNumberService.normalize(dto.customerPhoneNumber)\n      : undefined\n    const amountUgx = pkg.prices[0].amountUgx",
        "optional Cash-sale customer phone",
    )

    text = replace_once(
        text,
        "    const pkg = await this.requireSellablePackage(tenantId, dto.packageId, policy)\n    const customerPhoneNumber = this.phoneNumberService.normalize(dto.customerPhoneNumber)\n    const network = dto.network ?? this.phoneNumberService.resolveNetwork(dto.payingPhoneNumber)\n    if (network !== PaymentNetwork.MTN && network !== PaymentNetwork.AIRTEL) {\n      throw new BadRequestException('Choose MTN or Airtel Mobile Money.')\n    }\n    const payingPhoneNumber = this.phoneNumberService.normalizeForNetwork(dto.payingPhoneNumber, network)",
        "    const pkg = await this.requireSellablePackage(tenantId, dto.packageId, policy)\n    const network = dto.network ?? this.phoneNumberService.resolveNetwork(dto.payingPhoneNumber)\n    if (network !== PaymentNetwork.MTN && network !== PaymentNetwork.AIRTEL) {\n      throw new BadRequestException('Choose MTN or Airtel Mobile Money.')\n    }\n    const payingPhoneNumber = this.phoneNumberService.normalizeForNetwork(dto.payingPhoneNumber, network)\n    const customerPhoneNumber = dto.customerPhoneNumber?.trim()\n      ? this.phoneNumberService.normalize(dto.customerPhoneNumber)\n      : undefined",
        "optional Mobile Money customer phone",
    )

    text = replace_once(
        text,
        "      customerReference: customerPhoneNumber,\n      narrative: `AROFi agent sale - ${pkg.name}`",
        "      customerReference: customerPhoneNumber ?? payingPhoneNumber,\n      narrative: `AROFi agent sale - ${pkg.name}`",
        "provider customer reference fallback",
    )

    text = replace_once(
        text,
        "    customerPhoneNumber: string,\n    claim: ClaimState,\n    paymentMethod: 'MOBILE_MONEY' | 'CASH',",
        "    customerPhoneNumber: string | undefined,\n    claim: ClaimState,\n    paymentMethod: 'MOBILE_MONEY' | 'CASH',",
        "phone-free immediate activation signature",
    )

    text = replace_once(
        text,
        "    customerReference: string,\n  ) {\n    const sale = await this.prisma.billingTransaction.findUnique({ where: { id: saleId } })",
        "    customerReference: string | undefined,\n  ) {\n    const sale = await this.prisma.billingTransaction.findUnique({ where: { id: saleId } })",
        "phone-free voucher creation signature",
    )

    for marker in (
        "customerPhoneNumber?: string",
        "dto.customerPhoneNumber?.trim()",
        "customerReference: customerPhoneNumber ?? payingPhoneNumber",
        "customerPhoneNumber: string | undefined",
        "customerReference: string | undefined",
    ):
        if marker not in text:
            raise RuntimeError(f"Agent sales redesign rejected: service marker missing: {marker}")

    SERVICE.write_text(text, encoding="utf-8")


def patch_sidebar() -> None:
    text = SIDEBAR.read_text(encoding="utf-8")

    anchor = "const resellerNavItems: NavGroup[] = ["
    agent_nav = """const agentNavItems: NavGroup[] = [
  {
    label: 'Sell WiFi / Internet',
    icon: <ShoppingCart size={17} />,
    items: [{ href: '/dashboard?sell=1', label: 'Sell WiFi / Internet' }],
  },
  {
    label: 'My Sales',
    icon: <FileBarChart size={17} />,
    items: [{ href: '/agent/sales', label: 'My Sales' }],
  },
  {
    label: 'My Vouchers',
    icon: <CreditCard size={17} />,
    items: [{ href: '/vouchers', label: 'My Vouchers' }],
  },
  {
    label: 'Money & Commission',
    icon: <Wallet size={17} />,
    items: [{ href: '/agent/money', label: 'Money & Commission' }],
  },
  {
    label: 'Support',
    icon: <LifeBuoy size={17} />,
    items: [{ href: '/support', label: 'Support' }],
  },
]

const resellerNavItems: NavGroup[] = ["""
    text = replace_once(text, anchor, agent_nav, "Agent-only sidebar navigation")

    text = replace_once(
        text,
        "  const isPlatform = isPlatformAdmin(user)\n  const currentQuery = searchParams.toString()",
        "  const isPlatform = isPlatformAdmin(user)\n  const isAgent = user.role === 'VoucherAgent'\n  const currentQuery = searchParams.toString()",
        "Agent sidebar role detection",
    )

    text = replace_once(
        text,
        "  const navigationGroups = isReseller ? resellerNavItems : isVendor ? tenantNavItems : platformNavItems",
        "  const navigationGroups = isAgent ? agentNavItems : isReseller ? resellerNavItems : isVendor ? tenantNavItems : platformNavItems",
        "Agent navigation selection",
    )

    text = replace_once(
        text,
        "  const workspaceLabel = isReseller ? 'Referral Partner' : isVendor ? 'Business Console' : 'Platform Control'\n  const homeLabel = isVendor ? 'Dashboard' : isReseller ? 'Overview' : 'Command Center'",
        "  const workspaceLabel = isAgent ? 'Agent Console' : isReseller ? 'Referral Partner' : isVendor ? 'Business Console' : 'Platform Control'\n  const homeLabel = isAgent ? 'Dashboard' : isVendor ? 'Dashboard' : isReseller ? 'Overview' : 'Command Center'",
        "Agent sidebar labels",
    )

    text = replace_once(
        text,
        "    <aside className={`sidebar ${isPlatform ? 'platform-sidebar' : ''}`}>",
        "    <aside className={`sidebar ${isPlatform ? 'platform-sidebar' : ''} ${isAgent ? 'agent-sidebar' : ''}`}>",
        "Agent sidebar class",
    )

    text = replace_once(
        text,
        "        .platform-sidebar .platform-nav-chevron.open{transform:rotate(90deg)}",
        "        .platform-sidebar .platform-nav-chevron.open{transform:rotate(90deg)}\n        .agent-sidebar .agent-sell-nav{background:var(--brand);color:#fff;border-color:var(--brand);font-weight:850;box-shadow:0 8px 22px rgba(37,99,235,.22)}\n        .agent-sidebar .agent-sell-nav .sidebar-group-label{color:#fff}\n        .agent-sidebar .agent-sell-nav svg{color:#fff}",
        "primary Agent sell navigation style",
    )

    text = replace_once(
        text,
        "<Link href={group.items[0].href} prefetch={false} onPointerEnter={() => router.prefetch(group.items[0].href)} className={`sidebar-group-toggle ${isInSection ? 'active' : ''}`}>",
        "<Link href={group.items[0].href} prefetch={false} onPointerEnter={() => router.prefetch(group.items[0].href)} className={`sidebar-group-toggle ${isInSection ? 'active' : ''} ${isAgent && group.label === 'Sell WiFi / Internet' ? 'agent-sell-nav' : ''}`}>",
        "primary Agent sell navigation class",
    )

    for marker in (
        "const agentNavItems: NavGroup[]",
        "href: '/dashboard?sell=1'",
        "href: '/agent/sales'",
        "href: '/agent/money'",
        "isAgent ? agentNavItems",
        "agent-sell-nav",
    ):
        if marker not in text:
            raise RuntimeError(f"Agent sales redesign rejected: sidebar marker missing: {marker}")

    SIDEBAR.write_text(text, encoding="utf-8")


def verify_frontend() -> None:
    dto = DTO.read_text(encoding="utf-8")
    sell = SELL_PANEL.read_text(encoding="utf-8")
    dashboard = DASHBOARD.read_text(encoding="utf-8")

    for marker in (
        "customerPhoneNumber?: string",
        "@IsOptional()",
    ):
        if marker not in dto:
            raise RuntimeError(f"Agent sales redesign rejected: DTO marker missing: {marker}")

    for marker in (
        "SELL WIFI / INTERNET",
        "Give Access Code",
        "Customer phone",
        "(optional)",
        "No phone number is required",
        "useState<'ACTIVATE_NOW' | 'VOUCHER_LATER'>('VOUCHER_LATER')",
    ):
        if marker not in sell:
            raise RuntimeError(f"Agent sales redesign rejected: seller UI marker missing: {marker}")

    if "AgentSalesAccountability" in dashboard:
        raise RuntimeError("Agent sales redesign rejected: accounting controls are still embedded on the dashboard")
    for marker in ("Sales today", "Commission today", "Cash to remit", "Offline vouchers", "/agent/money", "/agent/sales"):
        if marker not in dashboard:
            raise RuntimeError(f"Agent sales redesign rejected: dashboard marker missing: {marker}")


def main() -> None:
    for path in (SERVICE, SIDEBAR, SELL_PANEL, DASHBOARD, DTO):
        if not path.exists():
            raise RuntimeError(f"Agent sales redesign rejected: missing {path.relative_to(ROOT)}")

    patch_service()
    patch_sidebar()
    verify_frontend()
    print("Agent sales redesign verified: code-first selling, optional customer phone, focused dashboard and Agent-only navigation are locked.")


if __name__ == "__main__":
    main()
