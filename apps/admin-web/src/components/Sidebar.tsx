'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useMemo, type ReactNode } from 'react'
import {
  Building2,
  CircleDollarSign,
  LayoutDashboard,
  RadioTower,
  Router,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { isPlatformAdmin, isVendorWorkspace } from '@/lib/workspace'
import ThemeToggle from './ThemeToggle'

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
  {
    label: 'Routers',
    icon: <Router size={17} />,
    items: [
      { href: '/admin/settings/routers', label: 'Routers', required: ['routers.read'], tenantOnly: true },
      { href: '/admin/router', label: 'Router Observability', required: ['routers.read'], tenantOnly: true },
      { href: '/admin/settings/routers?add=true', label: 'Register Router', required: ['routers.manage'], tenantOnly: true },
      { href: '/admin/remote-access', label: 'Remote Access', required: ['routers.read'], tenantOnly: true },
      { href: '/hotspots', label: 'Hotspots', required: ['hotspots.read'], tenantOnly: true },
      { href: '/sessions', label: 'Usage Analytics', required: ['sessions.read'], tenantOnly: true },
    ]
  },
  {
    label: 'Sales',
    icon: <ShoppingCart size={17} />,
    items: [
      { href: '/packages', label: 'Packages', required: ['packages.read'], tenantOnly: true },
      { href: '/vouchers', label: 'Vouchers', required: ['vouchers.read'], tenantOnly: true },
      { href: '/sales', label: 'Sales Reports', required: ['billing.read'], tenantOnly: true },
      { href: '/transactions', label: 'Transactions', required: ['billing.read'], tenantOnly: true },
    ]
  },
  {
    label: 'Earnings',
    icon: <Wallet size={17} />,
    items: [
      { href: '/earnings', label: 'Wallet', required: ['billing.read'] },
      { href: '/float', label: 'Settlement Balance', required: ['agents.read'], tenantOnly: true },
      { href: '/disbursements', label: 'Withdrawals', required: ['disbursements.read'], tenantOnly: true },
    ]
  },
  {
    label: 'Users',
    icon: <Users size={17} />,
    items: [
      { href: '/users?tab=staff', label: 'Staff', required: ['users.read'], tenantOnly: true },
      { href: '/users?tab=customers', label: 'Customers', required: ['users.read'], tenantOnly: true },
      { href: '/agents', label: 'Agent PoS', required: ['agents.read'], tenantOnly: true },
    ]
  },
  {
    label: 'Settings',
    icon: <Settings size={17} />,
    items: [
      { href: '/settings?tab=Business%20Profile', label: 'General', tenantOnly: true },
      { href: '/admin/settings/templates', label: 'Captive Templates', tenantOnly: true },
      { href: '/settings?tab=Payment%20%26%20Fees', label: 'Payment Gateways', tenantOnly: true },
      { href: '/settings?tab=Security', label: 'Advanced', tenantOnly: true },
      { href: '/support', label: 'Support Hub', required: ['support.read'], tenantOnly: true },
      { href: '/docs', label: 'Docs', tenantOnly: true },
    ]
  },
  {
    label: 'Compliance',
    icon: <ShieldCheck size={17} />,
    items: [
      { href: '/compliance', label: 'Compliance Overview', tenantOnly: true },
    ]
  },
  {
    label: 'Business Management',
    icon: <Building2 size={17} />,
    items: [
      { href: '/tenants', label: 'Businesses', required: ['tenants.read'], platformOnly: true },
      { href: '/sales-by-tenant', label: 'Sales by Business', required: ['billing.read'], platformOnly: true },
      { href: '/users?tab=staff', label: 'Platform Staff', required: ['users.read'], platformOnly: true },
      { href: '/support', label: 'Support Tickets', required: ['support.read'], platformOnly: true },
      { href: '/feature-limits', label: 'Feature Limits', required: ['feature_limits.read'], platformOnly: true },
      { href: '/admin/settings/commission', label: 'Commission Rates', required: ['settings.manage'], platformOnly: true },
      { href: '/admin/blog', label: 'Blog', required: ['settings.manage'], platformOnly: true },
      { href: '/audit-logs', label: 'Audit Logs', required: ['audit.read'], platformOnly: true },
    ]
  },
  {
    label: 'Router Support',
    icon: <RadioTower size={17} />,
    items: [
      { href: '/admin/router', label: 'Router Observability', required: ['routers.read'], platformOnly: true },
      { href: '/admin/remote-access', label: 'Remote Access', required: ['routers.read'], platformOnly: true },
      { href: '/admin/settings/routers', label: 'Routers Support', required: ['routers.read'], platformOnly: true },
      { href: '/sessions', label: 'Sessions & RADIUS', required: ['sessions.read'], platformOnly: true },
      { href: '/hotspots', label: 'Hotspot Sites', required: ['hotspots.read'], platformOnly: true },
    ]
  },
  {
    label: 'Finance & Approvals',
    icon: <CircleDollarSign size={17} />,
    items: [
      { href: '/payments', label: 'Payment Health', required: ['payments.read'], platformOnly: true },
      { href: '/disbursements', label: 'Phone Approvals', required: ['disbursements.read'], platformOnly: true },
      { href: '/admin/email-approvals', label: 'Email Approvals', required: ['users.manage'], platformOnly: true },
      { href: '/admin/compliance-reviews', label: 'Compliance Reviews', required: ['tenants.manage'], platformOnly: true },
      { href: '/transactions', label: 'All Transactions', required: ['billing.read'], platformOnly: true },
    ]
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
  const currentQuery = searchParams.toString()
  const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname
  const visibleGroups = useMemo(() => navItems
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccess(user, item.required, item.platformOnly, item.tenantOnly)),
    }))
    .filter((group) => group.items.length > 0), [user])

  const workspaceLabel = isVendor ? 'Business Dashboard' : 'Platform Admin'

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/logo.png" alt="AROFi" />
        <div>
          <h1>ARO<span>Fi</span></h1>
          <p>{workspaceLabel}</p>
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-info" style={{ padding: '6px 10px' }}>{isVendor ? 'Business' : 'Platform'} - {user.role}</span>
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
            Dashboard
          </span>
        </Link>
      </div>
      {visibleGroups.map((group) => {
        // A single click on a section navigates straight to its main page —
        // no expand/collapse step required, which is what made the sidebar
        // feel scattered. The sub-links for that section only appear once
        // you're actually inside it (based on the current route), so nothing
        // is lost — you just don't see every section's internals at once.
        const isInSection = group.items.some((item) => isActiveHref(currentHref, item.href))
        return (
          <div key={group.label} className="sidebar-section">
            <Link
              href={group.items[0].href}
              className={`sidebar-group-toggle ${isInSection ? 'active' : ''}`}
            >
              <span className="sidebar-group-label">
                {group.icon}
                {group.label}
              </span>
            </Link>
            {isInSection && group.items.length > 1 && (
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
      <div className="sidebar-footer">
        <span className="sidebar-footer-label">Appearance</span>
        <ThemeToggle variant="segmented" />
      </div>
    </aside>
  )
}

function isActiveHref(currentHref: string, href: string) {
  if (href.includes('?')) {
    return currentHref === href
  }
  return currentHref.split('?')[0] === href
}

