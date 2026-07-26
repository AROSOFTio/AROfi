'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  Banknote,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  CreditCard,
  FileBarChart,
  FileText,
  Gauge,
  Globe,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  Lock,
  Mail,
  PenLine,
  Percent,
  PiggyBank,
  RadioTower,
  Router,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Ticket,
  UserCircle,
  Users,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { isPlatformAdmin, isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'
import { formatRoleName } from '@/lib/format'

type NavItem = {
  href: string;
  label: string;
  required?: string[];
  platformOnly?: boolean;
  tenantOnly?: boolean;
};

type NavGroup = {
  label: string;
  icon: ReactNode;
  items: NavItem[];
};

const navItems: NavGroup[] = [
  // Business (vendor) navigation is flat too, same as platform below: every
  // destination is a direct single-item link, nothing folds/expands, and
  // "Register Router" was dropped as a separate entry since it only opens a
  // modal on the Routers page rather than a distinct destination.
  {
    label: 'Routers',
    icon: <Router size={17} />,
    items: [{ href: '/admin/settings/routers', label: 'Routers', required: ['routers.read'], tenantOnly: true }]
  },
  {
    label: 'Router Observability',
    icon: <Gauge size={17} />,
    items: [{ href: '/admin/router', label: 'Router Observability', required: ['routers.read'], tenantOnly: true }]
  },
  {
    label: 'Remote Access',
    icon: <Globe size={17} />,
    items: [{ href: '/admin/remote-access', label: 'Remote Access', required: ['routers.read'], tenantOnly: true }]
  },
  {
    label: 'Hotspots',
    icon: <Wifi size={17} />,
    items: [{ href: '/hotspots', label: 'Hotspots', required: ['hotspots.read'], tenantOnly: true }]
  },
  {
    label: 'Usage Analytics',
    icon: <RadioTower size={17} />,
    items: [{ href: '/sessions', label: 'Usage Analytics', required: ['sessions.read'], tenantOnly: true }]
  },
  {
    label: 'Packages',
    icon: <ShoppingCart size={17} />,
    items: [{ href: '/packages', label: 'Packages', required: ['packages.read'], tenantOnly: true }]
  },
  {
    label: 'Vouchers',
    icon: <Ticket size={17} />,
    items: [{ href: '/vouchers', label: 'Vouchers', required: ['vouchers.read'], tenantOnly: true }]
  },
  {
    label: 'Sales Reports',
    icon: <BarChart3 size={17} />,
    items: [{ href: '/sales', label: 'Sales Reports', required: ['billing.read'], tenantOnly: true }]
  },
  {
    label: 'Transactions',
    icon: <CreditCard size={17} />,
    items: [{ href: '/transactions', label: 'Transactions', required: ['billing.read'], tenantOnly: true }]
  },
  {
    label: 'Reports',
    icon: <FileBarChart size={17} />,
    items: [{ href: '/reports', label: 'Reports', required: ['reports.read'], tenantOnly: true }]
  },
  {
    label: 'Wallet',
    icon: <Wallet size={17} />,
    items: [{ href: '/earnings', label: 'Wallet', required: ['billing.read'] }]
  },
  {
    label: 'Settlement Balance',
    icon: <PiggyBank size={17} />,
    items: [{ href: '/float', label: 'Settlement Balance', required: ['agents.read'], tenantOnly: true }]
  },
  {
    label: 'Withdrawals',
    icon: <Banknote size={17} />,
    items: [{ href: '/disbursements', label: 'Withdrawals', required: ['disbursements.read'], tenantOnly: true }]
  },
  {
    label: 'Staff',
    icon: <Users size={17} />,
    items: [{ href: '/users?tab=staff', label: 'Staff', required: ['users.read'], tenantOnly: true }]
  },
  {
    label: 'Customers',
    icon: <UserCircle size={17} />,
    items: [{ href: '/users?tab=customers', label: 'Customers', required: ['users.read'], tenantOnly: true }]
  },
  {
    label: 'Agent PoS',
    icon: <Store size={17} />,
    items: [{ href: '/agents', label: 'Agent PoS', required: ['agents.read'], tenantOnly: true }]
  },
  {
    label: 'General Settings',
    icon: <Settings size={17} />,
    items: [{ href: '/settings?tab=Business%20Profile', label: 'General Settings', tenantOnly: true }]
  },
  {
    label: 'Captive Templates',
    icon: <LayoutTemplate size={17} />,
    items: [{ href: '/admin/settings/templates', label: 'Captive Templates', tenantOnly: true }]
  },
  {
    label: 'Payment Gateways',
    icon: <CreditCard size={17} />,
    items: [{ href: '/settings?tab=Payment%20%26%20Fees', label: 'Payment Gateways', tenantOnly: true }]
  },
  {
    label: 'Advanced Settings',
    icon: <Lock size={17} />,
    items: [{ href: '/settings?tab=Security', label: 'Advanced Settings', tenantOnly: true }]
  },
  {
    label: 'Support Hub',
    icon: <LifeBuoy size={17} />,
    items: [{ href: '/support', label: 'Support Hub', required: ['support.read'], tenantOnly: true }]
  },
  {
    label: 'Docs',
    icon: <FileText size={17} />,
    items: [{ href: '/docs', label: 'Docs', tenantOnly: true }]
  },
  {
    label: 'Compliance',
    icon: <ShieldCheck size={17} />,
    items: [
      { href: '/compliance', label: 'Compliance Overview', tenantOnly: true },
    ]
  },
  // Platform (Dev Admin) navigation is intentionally FLAT: every destination
  // is a direct top-level link (single-item groups render without sub-menus),
  // nothing is folded away, and no page appears twice.
  {
    label: 'Businesses',
    icon: <Building2 size={17} />,
    items: [{ href: '/businesses', label: 'Businesses', required: ['tenants.read'], platformOnly: true }]
  },
  {
    label: 'Compliance Reviews',
    icon: <ShieldCheck size={17} />,
    items: [{ href: '/admin/compliance-reviews', label: 'Compliance Reviews', required: ['tenants.manage'], platformOnly: true }]
  },
  {
    label: 'Payout Approvals',
    icon: <Wallet size={17} />,
    items: [{ href: '/disbursements', label: 'Payout Approvals', required: ['disbursements.read'], platformOnly: true }]
  },
  {
    label: 'Email Approvals',
    icon: <Mail size={17} />,
    items: [{ href: '/admin/email-approvals', label: 'Email Approvals', required: ['users.manage'], platformOnly: true }]
  },
  {
    label: 'Payment Health',
    icon: <Activity size={17} />,
    items: [{ href: '/payments', label: 'Payment Health', required: ['payments.read'], platformOnly: true }]
  },
  {
    label: 'Referral Management',
    icon: <Share2 size={17} />,
    items: [{ href: '/admin/referrals', label: 'Referral Management', required: ['ALL'], platformOnly: true }]
  },
  {
    label: 'Transactions',
    icon: <CreditCard size={17} />,
    items: [{ href: '/transactions', label: 'Transactions', required: ['billing.read'], platformOnly: true }]
  },
  {
    label: 'Sales by Business',
    icon: <BarChart3 size={17} />,
    items: [{ href: '/sales-by-business', label: 'Sales by Business', required: ['billing.read'], platformOnly: true }]
  },
  {
    label: 'Reports',
    icon: <FileBarChart size={17} />,
    items: [{ href: '/reports', label: 'Reports', required: ['reports.read'], platformOnly: true }]
  },
  {
    label: 'Notifications',
    icon: <Bell size={17} />,
    items: [{ href: '/admin/notifications', label: 'Notifications', required: ['settings.manage'], platformOnly: true }]
  },
  {
    label: 'Routers',
    icon: <Router size={17} />,
    items: [{ href: '/admin/settings/routers', label: 'Routers', required: ['routers.read'], platformOnly: true }]
  },
  {
    label: 'Observability',
    icon: <Gauge size={17} />,
    items: [{ href: '/admin/router', label: 'Observability', required: ['routers.read'], platformOnly: true }]
  },
  {
    label: 'Remote Access',
    icon: <Globe size={17} />,
    items: [{ href: '/admin/remote-access', label: 'Remote Access', required: ['routers.read'], platformOnly: true }]
  },
  {
    label: 'Sessions & RADIUS',
    icon: <RadioTower size={17} />,
    items: [{ href: '/sessions', label: 'Sessions & RADIUS', required: ['sessions.read'], platformOnly: true }]
  },
  {
    label: 'Hotspot Sites',
    icon: <Wifi size={17} />,
    items: [{ href: '/hotspots', label: 'Hotspot Sites', required: ['hotspots.read'], platformOnly: true }]
  },
  {
    label: 'Blog',
    icon: <PenLine size={17} />,
    items: [{ href: '/admin/blog', label: 'Blog', required: ['settings.manage'], platformOnly: true }]
  },
  {
    label: 'Agents',
    icon: <Store size={17} />,
    items: [{ href: '/agents', label: 'Agents', required: ['agents.read'], platformOnly: true }]
  },
  {
    label: 'Support',
    icon: <LifeBuoy size={17} />,
    items: [
      { href: '/support', label: 'Tickets', required: ['support.read'], platformOnly: true },
      { href: '/support?view=feedback', label: 'Feedback', required: ['support.read'], platformOnly: true },
    ]
  },
  {
    label: 'Platform Staff',
    icon: <Users size={17} />,
    items: [{ href: '/users?tab=staff', label: 'Platform Staff', required: ['users.read'], platformOnly: true }]
  },
  {
    label: 'Feature Limits',
    icon: <Zap size={17} />,
    items: [{ href: '/feature-limits', label: 'Feature Limits', required: ['feature_limits.read'], platformOnly: true }]
  },
  {
    label: 'Commission Rates',
    icon: <Percent size={17} />,
    items: [{ href: '/admin/settings/commission', label: 'Commission Rates', required: ['settings.manage'], platformOnly: true }]
  },
  {
    label: 'Audit Logs',
    icon: <FileText size={17} />,
    items: [{ href: '/audit-logs', label: 'Audit Logs', required: ['audit.read'], platformOnly: true }]
  },
]

const tenantNavItems: NavGroup[] = [
  {
    label: 'Agents',
    icon: <Store size={17} />,
    items: [
      { href: '/agents', label: 'Agents', required: ['agents.read'], tenantOnly: true },
    ],
  },
  {
    label: 'Sell Internet',
    icon: <ShoppingCart size={17} />,
    items: [
      { href: '/packages', label: 'Internet Plans', required: ['packages.read'], tenantOnly: true },
      { href: '/vouchers', label: 'Vouchers', required: ['vouchers.read'], tenantOnly: true },
      { href: '/users?tab=customers', label: 'Customers', required: ['users.read'], tenantOnly: true },
    ],
  },
  {
    label: 'Money',
    icon: <Wallet size={17} />,
    items: [
      { href: '/sales', label: 'Sales', required: ['billing.read'], tenantOnly: true },
      { href: '/transactions', label: 'Transactions', required: ['billing.read'], tenantOnly: true },
      { href: '/earnings', label: 'Wallet', required: ['billing.read'], tenantOnly: true },
      { href: '/referrals', label: 'Referral Programme', required: ['referrals.read'] },
      { href: '/disbursements', label: 'Withdraw Money', required: ['disbursements.read'], tenantOnly: true },
    ],
  },
  {
    label: 'Network',
    icon: <Wifi size={17} />,
    items: [
      { href: '/admin/settings/routers', label: 'Routers', required: ['routers.read'], tenantOnly: true },
      { href: '/hotspots', label: 'Access Points', required: ['hotspots.read'], tenantOnly: true },
      { href: '/sessions', label: 'Online Users', required: ['sessions.read'], tenantOnly: true },
      { href: '/admin/remote-access', label: 'Remote Access', required: ['routers.read'], tenantOnly: true },
    ],
  },
  {
    label: 'Staff',
    icon: <Users size={17} />,
    items: [
      { href: '/users?tab=staff', label: 'Staff', required: ['users.read'], tenantOnly: true },
    ],
  },
  {
    label: 'Settings',
    icon: <Settings size={17} />,
    items: [
      { href: '/settings?tab=Business%20Profile', label: 'Profile', tenantOnly: true },
      { href: '/settings?tab=Appearance', label: 'Themes', tenantOnly: true },
      { href: '/settings?tab=Payment%20%26%20Fees', label: 'Payment', tenantOnly: true },
      { href: '/settings?tab=Withdrawals', label: 'Withdrawals', tenantOnly: true },
      { href: '/settings?tab=Router%20%26%20Portal', label: 'Router & Portal', tenantOnly: true },
      { href: '/settings?tab=Voucher%20Printing', label: 'Voucher Printing', tenantOnly: true },
      { href: '/settings?tab=Password', label: 'Password', tenantOnly: true },
      { href: '/settings?tab=Security', label: 'Security', tenantOnly: true },
      { href: '/settings?tab=Subscription%20Plan', label: 'Plan', tenantOnly: true },
    ],
  },
  {
    label: 'Support',
    icon: <LifeBuoy size={17} />,
    items: [
      { href: '/support', label: 'Tickets', required: ['support.read'], tenantOnly: true },
      { href: '/feedback', label: 'Feedback', tenantOnly: true },
      { href: '/docs/getting-started', label: 'Guide', tenantOnly: true },
    ],
  },
]

const resellerNavItems: NavGroup[] = [
  {
    label: 'Referral Programme',
    icon: <Share2 size={17} />,
    items: [
      { href: '/referrals', label: 'Referral Programme', required: ['referrals.read'], tenantOnly: true },
    ],
  },
  {
    label: 'Support',
    icon: <LifeBuoy size={17} />,
    items: [
      { href: '/support', label: 'Support', required: ['support.read'] },
    ],
  },
]

type SidebarUser = AdminSessionResponse['user']

function canAccess(user: SidebarUser, required: string[] = [], platformOnly?: boolean, tenantOnly?: boolean) {
  const isVendor = isVendorWorkspace(user)
  const isPlatform = isPlatformAdmin(user)

  if (platformOnly && !isPlatform) {
    return false
  }

  if (tenantOnly && !isVendor) {
    return false
  }

  if (required.length === 0) {
    return true
  }

  return required.every((permission) => user.permissions.includes(permission) || user.permissions.includes('ALL'))
}

export default function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isVendor = isVendorWorkspace(user)
  const isReseller = isResellerWorkspace(user)
  const currentQuery = searchParams.toString()
  const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname
  const navigationGroups = isReseller ? resellerNavItems : isVendor ? tenantNavItems : navItems
  const visibleGroups = useMemo(() => navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccess(user, item.required, item.platformOnly, item.tenantOnly)),
    }))
    .filter((group) => group.items.length > 0), [navigationGroups, user])
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  useEffect(() => {
    const activeGroup = visibleGroups.find((group) => group.items.length > 1 && group.items.some((item) => isActiveHref(currentHref, item.href)))
    if (activeGroup) setOpenGroup(activeGroup.label)
  }, [currentHref, visibleGroups])

  const workspaceLabel = isReseller ? 'Referral Partner Dashboard' : isVendor ? 'Business Dashboard' : 'Platform Admin'

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/logo.png" alt="AROFi" />
        <div>
          <h1>ARO<span>Fi</span></h1>
          <p>{workspaceLabel}</p>
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-info" style={{ padding: '6px 10px' }}>{isReseller ? 'Referral Partner' : isVendor ? 'Business' : 'Platform'} - {formatRoleName(user.role)}</span>
            {isVendor && user.tenantName && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.tenantName}</span>
            )}
          </div>
        </div>
      </div>
      {isVendor && user.tenantName && <div className="tenant-switcher">{user.tenantName}</div>}
      <div className="sidebar-section">
        <Link
          href="/dashboard"
          className={`sidebar-group-toggle ${isActiveHref(currentHref, '/dashboard') ? 'active' : ''}`}
        >
          <span className="sidebar-group-label">
            <LayoutDashboard size={17} />
            {isVendor ? 'Home' : 'Dashboard'}
          </span>
        </Link>
      </div>
      {visibleGroups.map((group) => {
        // Multi-page sections are accordions; direct destinations stay links.
        const isInSection = group.items.some((item) => isActiveHref(currentHref, item.href))
        const isFoldable = group.items.length > 1
        const isOpen = openGroup === group.label
        return (
          <div key={group.label} className="sidebar-section">
            {isFoldable ? (
              <button type="button" className={`sidebar-group-toggle ${isInSection ? 'active' : ''}`} aria-expanded={isOpen} onClick={() => setOpenGroup(isOpen ? null : group.label)}>
                <span className="sidebar-group-label">{group.icon}{group.label}</span>
                <ChevronDown className={`sidebar-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true" />
              </button>
            ) : (
              <Link href={group.items[0].href} className={`sidebar-group-toggle ${isInSection ? 'active' : ''}`}>
                <span className="sidebar-group-label">{group.icon}{group.label}</span>
              </Link>
            )}
            {isFoldable && isOpen && (
              <div className="sidebar-group-items">
                {group.items.map((item) => (
                  <Link
                    key={`${group.label}-${item.href}-${item.label}`}
                    href={item.href}
                    className={`nav-item ${isActiveHref(currentHref, item.href) ? 'active' : ''}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </aside>
  )
}

function isActiveHref(currentHref: string, href: string) {
  const [currentPath, currentQuery = ''] = currentHref.split('?')
  const [targetPath, targetQuery = ''] = href.split('?')
  if (currentPath !== targetPath) return false
  if (!targetQuery) return true

  const currentParams = new URLSearchParams(currentQuery)
  const targetParams = new URLSearchParams(targetQuery)
  return Array.from(targetParams.entries()).every(([key, value]) => currentParams.get(key) === value)
}

