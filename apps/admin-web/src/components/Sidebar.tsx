'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  Bell,
  Building2,
  CreditCard,
  FileBarChart,
  FileText,
  Gauge,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  RadioTower,
  Router,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { formatRoleName } from '@/lib/format'
import { isPlatformAdmin, isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'

type NavItem = {
  href: string
  label: string
  required?: string[]
  platformOnly?: boolean
  tenantOnly?: boolean
}

type NavGroup = {
  label: string
  icon: ReactNode
  items: NavItem[]
}

const platformNavItems: NavGroup[] = [
  {
    label: 'Overview',
    icon: <Gauge size={17} />,
    items: [
      { href: '/admin/operations', label: 'Troubleshooting Center', required: ['ALL'], platformOnly: true },
      { href: '/admin/notifications', label: 'Alerts & Notifications', required: ['settings.manage'], platformOnly: true },
    ],
  },
  {
    label: 'Businesses',
    icon: <Building2 size={17} />,
    items: [
      { href: '/businesses', label: 'All Businesses', required: ['tenants.read'], platformOnly: true },
      { href: '/sales-by-business', label: 'Business Performance', required: ['billing.read'], platformOnly: true },
      { href: '/admin/reviews', label: 'Reviews & Approvals', required: ['tenants.manage'], platformOnly: true },
      { href: '/agents', label: 'Partners & Agents', required: ['agents.read'], platformOnly: true },
    ],
  },
  {
    label: 'Finance',
    icon: <Wallet size={17} />,
    items: [
      { href: '/earnings', label: 'Platform Wallet', required: ['billing.read'], platformOnly: true },
      { href: '/transactions', label: 'Transactions & Sales', required: ['billing.read'], platformOnly: true },
      { href: '/disbursements', label: 'Payouts', required: ['disbursements.read'], platformOnly: true },
      { href: '/payments', label: 'Payment Operations', required: ['payments.read'], platformOnly: true },
      { href: '/settings?tab=Payment%20%26%20Fees', label: 'Payment Gateways', required: ['settings.manage'], platformOnly: true },
      { href: '/reports', label: 'Reconciliation & Reports', required: ['reports.read'], platformOnly: true },
    ],
  },
  {
    label: 'Network',
    icon: <Wifi size={17} />,
    items: [
      { href: '/admin/router', label: 'Network Overview', required: ['routers.read'], platformOnly: true },
      { href: '/admin/settings/routers', label: 'Routers & Sites', required: ['routers.read'], platformOnly: true },
      { href: '/sessions', label: 'Live Sessions & RADIUS', required: ['sessions.read'], platformOnly: true },
      { href: '/admin/remote-access', label: 'Remote Access', required: ['routers.read'], platformOnly: true },
      { href: '/admin/router?view=compensation', label: 'Outages & Compensation', required: ['routers.read'], platformOnly: true },
    ],
  },
  {
    label: 'Support',
    icon: <LifeBuoy size={17} />,
    items: [
      { href: '/support', label: 'Support Tickets', required: ['support.read'], platformOnly: true },
      { href: '/support?view=feedback', label: 'Customer Feedback', required: ['support.read'], platformOnly: true },
      { href: '/admin/notifications', label: 'Service Alerts', required: ['settings.manage'], platformOnly: true },
    ],
  },
  {
    label: 'Platform',
    icon: <Settings size={17} />,
    items: [
      { href: '/admin/settings', label: 'Settings Center', required: ['settings.manage'], platformOnly: true },
      { href: '/users?tab=staff', label: 'Team & Roles', required: ['users.read'], platformOnly: true },
      { href: '/feature-limits', label: 'Plans & Limits', required: ['feature_limits.read'], platformOnly: true },
      { href: '/audit-logs', label: 'Audit Trail', required: ['audit.read'], platformOnly: true },
      { href: '/admin/blog', label: 'Content', required: ['settings.manage'], platformOnly: true },
      { href: '/admin/referrals', label: 'Referrals', required: ['ALL'], platformOnly: true },
    ],
  },
]

const tenantNavItems: NavGroup[] = [
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
    label: 'Reports',
    icon: <FileBarChart size={17} />,
    items: [
      { href: '/reports?type=sales', label: 'All Sales', required: ['reports.read'], tenantOnly: true },
      { href: '/reports?type=mobile-money', label: 'Mobile Money Sales', required: ['reports.read'], tenantOnly: true },
      { href: '/reports?type=vouchers', label: 'Voucher Sales', required: ['reports.read'], tenantOnly: true },
      { href: '/reports?type=active-users', label: 'Active Users', required: ['sessions.read'], tenantOnly: true },
      { href: '/reports?type=collections', label: 'Total Collected', required: ['reports.read'], tenantOnly: true },
      { href: '/reports?type=agent-vouchers', label: 'Agent Voucher Sales', required: ['reports.read'], tenantOnly: true },
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
      { href: '/agents', label: 'Agents', required: ['agents.read'], tenantOnly: true },
      { href: '/users?tab=customers', label: 'Customers', required: ['users.read'], tenantOnly: true },
    ],
  },
  {
    label: 'Settings',
    icon: <Settings size={17} />,
    items: [
      { href: '/settings?tab=Business%20Profile', label: 'Business Info', tenantOnly: true },
      { href: '/settings?tab=Themes', label: 'Theme', tenantOnly: true },
      { href: '/settings?tab=Payment%20%26%20Fees', label: 'Payments & Fees', tenantOnly: true },
      { href: '/settings?tab=Password', label: 'Password', tenantOnly: true },
      { href: '/settings?tab=Security', label: 'Account Safety', tenantOnly: true },
      { href: '/settings?tab=Subscription%20Plan', label: 'My Plan', tenantOnly: true },
    ],
  },
  {
    label: 'Support',
    icon: <LifeBuoy size={17} />,
    items: [
      { href: '/support', label: 'Tickets', required: ['support.read'], tenantOnly: true },
      { href: '/feedback', label: 'Feedback', tenantOnly: true },
      { href: '/support?view=documentation', label: 'Documentation', tenantOnly: true },
    ],
  },
]

const resellerNavItems: NavGroup[] = [
  {
    label: 'Referral Programme',
    icon: <Share2 size={17} />,
    items: [{ href: '/referrals', label: 'Referral Programme', required: ['referrals.read'], tenantOnly: true }],
  },
  {
    label: 'Support',
    icon: <LifeBuoy size={17} />,
    items: [{ href: '/support', label: 'Support', required: ['support.read'] }],
  },
]

type SidebarUser = AdminSessionResponse['user']

function canAccess(user: SidebarUser, required: string[] = [], platformOnly?: boolean, tenantOnly?: boolean) {
  const isVendor = isVendorWorkspace(user)
  const isPlatform = isPlatformAdmin(user)

  if (platformOnly && !isPlatform) return false
  if (tenantOnly && !isVendor) return false
  if (required.length === 0) return true

  return required.every((permission) => user.permissions.includes(permission) || user.permissions.includes('ALL'))
}

export default function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isVendor = isVendorWorkspace(user)
  const isReseller = isResellerWorkspace(user)
  const isPlatform = isPlatformAdmin(user)
  const currentQuery = searchParams.toString()
  const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname
  const navigationGroups = isReseller ? resellerNavItems : isVendor ? tenantNavItems : platformNavItems
  const visibleGroups = useMemo(
    () => navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canAccess(user, item.required, item.platformOnly, item.tenantOnly)),
      }))
      .filter((group) => group.items.length > 0),
    [navigationGroups, user],
  )
  const [openGroup, setOpenGroup] = useState<string | null>(isPlatform ? 'Overview' : null)

  useEffect(() => {
    const activeGroup = visibleGroups.find((group) => group.items.some((item) => isActiveHref(currentHref, item.href)))
    if (activeGroup) setOpenGroup(activeGroup.label)
  }, [currentHref, visibleGroups])

  useEffect(() => {
    const hrefs = Array.from(new Set(['/dashboard', ...visibleGroups.flatMap((group) => group.items.map((item) => item.href))]))
    const prefetch = () => hrefs.slice(0, 18).forEach((href) => router.prefetch(href))
    const idle = 'requestIdleCallback' in window
      ? window.requestIdleCallback(prefetch, { timeout: 1800 })
      : window.setTimeout(prefetch, 600)

    return () => {
      if (typeof idle === 'number') {
        window.clearTimeout(idle)
      } else if ('cancelIdleCallback' in window) {
        window.cancelIdleCallback(idle)
      }
    }
  }, [router, visibleGroups])

  const workspaceLabel = isReseller ? 'Referral Partner' : isVendor ? 'Business Console' : 'Platform Control'
  const homeLabel = isVendor ? 'Home' : isReseller ? 'Overview' : 'Command Center'

  return (
    <aside className={`sidebar ${isPlatform ? 'platform-sidebar' : ''}`}>
      <style>{`
        .platform-sidebar .sidebar-logo{padding-bottom:15px}
        .platform-sidebar .sidebar-logo h1{font-size:20px}
        .platform-sidebar .sidebar-logo p{font-size:10px;letter-spacing:.08em;text-transform:uppercase}
        .platform-sidebar .sidebar-section{margin:2px 8px}
        .platform-sidebar .sidebar-group-toggle{min-height:40px;border-radius:8px}
        .platform-sidebar .sidebar-group-label{gap:10px;font-size:13px;font-weight:700}
        .platform-sidebar .sidebar-group-items{margin:3px 0 7px 28px;padding-left:10px;border-left:1px solid var(--border)}
        .platform-sidebar .nav-item{min-height:34px;padding:8px 10px;border-radius:7px;font-size:12px}
        .platform-sidebar .nav-item.active{font-weight:750}
        .platform-sidebar .platform-nav-chevron{margin-left:auto;font-size:15px;line-height:1;transition:transform .18s ease;color:var(--text-3)}
        .platform-sidebar .platform-nav-chevron.open{transform:rotate(90deg)}
      `}</style>

      <div className="sidebar-logo">
        <img src="/logo.svg" alt="AROFi" />
        <div>
          <h1>ARO<span>Fi</span></h1>
          <p>{workspaceLabel}</p>
          <div style={{ marginTop: 8 }}>
            <span className="badge badge-info" style={{ padding: '5px 8px', fontSize: 10.5 }}>
              {formatRoleName(user.role)}
            </span>
          </div>
        </div>
      </div>

      {isVendor && user.tenantName && <div className="tenant-switcher">{user.tenantName}</div>}

      <div className="sidebar-section">
        <Link href="/dashboard" prefetch onPointerEnter={() => router.prefetch('/dashboard')} className={`sidebar-group-toggle ${isActiveHref(currentHref, '/dashboard') ? 'active' : ''}`}>
          <span className="sidebar-group-label">
            <LayoutDashboard size={17} />
            {homeLabel}
          </span>
        </Link>
      </div>

      {visibleGroups.map((group) => {
        const isInSection = group.items.some((item) => isActiveHref(currentHref, item.href))
        const isFoldable = group.items.length > 1
        const isOpen = openGroup === group.label

        return (
          <div key={group.label} className="sidebar-section">
            {isFoldable ? (
              <button
                type="button"
                className={`sidebar-group-toggle ${isInSection ? 'active' : ''}`}
                aria-expanded={isOpen}
                onClick={() => setOpenGroup(isOpen ? null : group.label)}
              >
                <span className="sidebar-group-label">{group.icon}{group.label}</span>
                <span className={`platform-nav-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true">›</span>
              </button>
            ) : (
              <Link href={group.items[0].href} prefetch onPointerEnter={() => router.prefetch(group.items[0].href)} className={`sidebar-group-toggle ${isInSection ? 'active' : ''}`}>
                <span className="sidebar-group-label">{group.icon}{group.label}</span>
              </Link>
            )}

            {isFoldable && isOpen && (
              <div className="sidebar-group-items">
                {group.items.map((item) => (
                  <Link
                    key={`${group.label}-${item.href}-${item.label}`}
                    href={item.href}
                    prefetch
                    onPointerEnter={() => router.prefetch(item.href)}
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
