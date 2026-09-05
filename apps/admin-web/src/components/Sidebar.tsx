'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import {
  Activity,
  Bell,
  Building2,
  CircleDollarSign,
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
  Ticket,
  Users,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { formatRoleName } from '@/lib/format'
import { isPlatformAdmin, isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  required?: string[]
  platformOnly?: boolean
  tenantOnly?: boolean
  dividerBefore?: boolean
}

const vendorNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, tenantOnly: true },
  { href: '/admin/settings/routers', label: 'Routers', icon: Router, required: ['routers.read'], tenantOnly: true },
  { href: '/hotspots', label: 'Access Points', icon: Wifi, required: ['hotspots.read'], tenantOnly: true },
  { href: '/packages', label: 'Internet Packages', icon: ShoppingCart, required: ['packages.read'], tenantOnly: true },
  { href: '/vouchers', label: 'Vouchers', icon: Ticket, required: ['vouchers.read'], tenantOnly: true },
  { href: '/agents', label: 'Agents', icon: Store, required: ['agents.read'], tenantOnly: true },
  { href: '/users?tab=customers', label: 'Customers', icon: Users, required: ['users.read'], tenantOnly: true },
  { href: '/sessions', label: 'Active Sessions', icon: Activity, required: ['sessions.read'], tenantOnly: true },
  { href: '/sales', label: 'Sales & Payments', icon: CircleDollarSign, required: ['billing.read'], tenantOnly: true, dividerBefore: true },
  { href: '/transactions', label: 'Transactions', icon: CreditCard, required: ['billing.read'], tenantOnly: true },
  { href: '/earnings', label: 'Wallet & Withdrawals', icon: Wallet, required: ['billing.read'], tenantOnly: true },
  { href: '/reports', label: 'Reports', icon: FileBarChart, required: ['reports.read'], tenantOnly: true },
  { href: '/admin/remote-access', label: 'Remote Access', icon: RadioTower, required: ['routers.read'], tenantOnly: true, dividerBefore: true },
  { href: '/referrals', label: 'Referral Programme', icon: Share2, required: ['referrals.read'] },
  { href: '/users?tab=staff', label: 'Team & Staff', icon: Users, required: ['users.read'], tenantOnly: true },
  { href: '/support', label: 'Support', icon: LifeBuoy, required: ['support.read'], tenantOnly: true, dividerBefore: true },
  { href: '/settings', label: 'Settings', icon: Settings, tenantOnly: true },
]

const platformNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Command Center', icon: LayoutDashboard, platformOnly: true },
  { href: '/admin/operations', label: 'Troubleshooting', icon: Gauge, required: ['ALL'], platformOnly: true },
  { href: '/businesses', label: 'Businesses', icon: Building2, required: ['tenants.read'], platformOnly: true },
  { href: '/sales-by-business', label: 'Business Performance', icon: FileBarChart, required: ['billing.read'], platformOnly: true },
  { href: '/admin/reviews', label: 'Reviews & Approvals', icon: ShieldCheck, required: ['tenants.manage'], platformOnly: true },
  { href: '/agents', label: 'Agents', icon: Store, required: ['agents.read'], platformOnly: true },
  { href: '/earnings', label: 'Platform Wallet', icon: Wallet, required: ['billing.read'], platformOnly: true, dividerBefore: true },
  { href: '/transactions', label: 'Transactions & Sales', icon: CreditCard, required: ['billing.read'], platformOnly: true },
  { href: '/disbursements', label: 'Payouts', icon: CircleDollarSign, required: ['disbursements.read'], platformOnly: true },
  { href: '/payments', label: 'Payment Operations', icon: CreditCard, required: ['payments.read'], platformOnly: true },
  { href: '/reports', label: 'Reports & Reconciliation', icon: FileBarChart, required: ['reports.read'], platformOnly: true },
  { href: '/admin/router', label: 'Network Overview', icon: Wifi, required: ['routers.read'], platformOnly: true, dividerBefore: true },
  { href: '/admin/settings/routers', label: 'Routers & Sites', icon: Router, required: ['routers.read'], platformOnly: true },
  { href: '/sessions', label: 'Live Sessions', icon: Activity, required: ['sessions.read'], platformOnly: true },
  { href: '/admin/remote-access', label: 'Remote Access', icon: RadioTower, required: ['routers.read'], platformOnly: true },
  { href: '/support', label: 'Support Tickets', icon: LifeBuoy, required: ['support.read'], platformOnly: true, dividerBefore: true },
  { href: '/admin/notifications', label: 'Alerts & Notifications', icon: Bell, required: ['settings.manage'], platformOnly: true },
  { href: '/admin/settings', label: 'Settings Center', icon: Settings, required: ['settings.manage'], platformOnly: true, dividerBefore: true },
  { href: '/users?tab=staff', label: 'Team & Roles', icon: Users, required: ['users.read'], platformOnly: true },
  { href: '/feature-limits', label: 'Plans & Limits', icon: Zap, required: ['feature_limits.read'], platformOnly: true },
  { href: '/audit-logs', label: 'Audit Trail', icon: FileText, required: ['audit.read'], platformOnly: true },
  { href: '/admin/blog', label: 'Content', icon: Globe, required: ['settings.manage'], platformOnly: true },
  { href: '/admin/referrals', label: 'Referrals', icon: Share2, required: ['ALL'], platformOnly: true },
  { href: '/admin/backups', label: 'Backup & Recovery', icon: ShieldCheck, required: ['ALL'], platformOnly: true },
]

const resellerNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/referrals', label: 'Referral Programme', icon: Share2, required: ['referrals.read'] },
  { href: '/support', label: 'Support', icon: LifeBuoy, required: ['support.read'], dividerBefore: true },
]

type SidebarUser = AdminSessionResponse['user']

function canAccess(user: SidebarUser, item: NavItem) {
  const isVendor = isVendorWorkspace(user)
  const isPlatform = isPlatformAdmin(user)
  if (item.platformOnly && !isPlatform) return false
  if (item.tenantOnly && !isVendor) return false
  if (!item.required?.length) return true
  return item.required.every((permission) => user.permissions.includes(permission) || user.permissions.includes('ALL'))
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
  const navigation = isReseller ? resellerNavItems : isVendor ? vendorNavItems : platformNavItems
  const visibleItems = useMemo(() => navigation.filter((item) => canAccess(user, item)), [navigation, user])
  const workspaceLabel = isReseller ? 'Referral Partner' : isVendor ? 'WiFi Console' : 'Platform Control'

  return (
    <aside className={`sidebar ${isPlatform ? 'platform-sidebar' : ''}`}>
      <div className="sidebar-logo">
        <img src="/logo.svg" alt="AROFi" />
        <div style={{ minWidth: 0 }}>
          <h1>ARO<span>Fi</span></h1>
          <p className="sidebar-workspace-label">{workspaceLabel}</p>
        </div>
      </div>

      {isVendor && user.tenantName && <div className="tenant-switcher" title={user.tenantName}>{user.tenantName}</div>}

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = isActiveHref(currentHref, item.href)
          return (
            <div key={`${item.href}-${item.label}`}>
              {item.dividerBefore && <div className="sidebar-divider" aria-hidden="true" />}
              <Link
                href={item.href}
                prefetch={false}
                onPointerEnter={() => router.prefetch(item.href)}
                className={`sidebar-direct-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            </div>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto', padding: '10px 8px 2px' }}>
        <span className="badge badge-info" style={{ padding: '4px 7px', fontSize: 10.5 }}>
          {formatRoleName(user.role)}
        </span>
      </div>
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
