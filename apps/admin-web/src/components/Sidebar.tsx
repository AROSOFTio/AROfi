'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { AdminSessionResponse } from '@/lib/admin-types'

const navItems = [
  {
    section: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <HomeIcon /> },
    ]
  },
  {
    section: 'Network',
    items: [
      { href: '/routers', label: 'Routers', icon: <RouterIcon />, required: ['routers.read'] },
      { href: '/hotspots', label: 'Hotspots', icon: <HotspotIcon />, required: ['hotspots.read'] },
      { href: '/packages', label: 'Packages', icon: <PackageIcon />, required: ['packages.read'] },
      { href: '/sessions', label: 'Usage Analytics', icon: <ActivityIcon />, required: ['sessions.read'] },
    ]
  },
  {
    section: 'Sales',
    items: [
      { href: '/sales', label: 'Sales', icon: <PaymentIcon />, required: ['billing.read'] },
      { href: '/vouchers', label: 'Vouchers', icon: <VoucherIcon />, required: ['vouchers.read'] },
      { href: '/customers', label: 'Customers', icon: <UsersIcon />, required: ['sessions.read'] },
      { href: '/agents', label: 'Agents', icon: <AgentIcon />, required: ['agents.read'] },
    ]
  },
  {
    section: 'Finance',
    items: [
      { href: '/transactions', label: 'Transactions', icon: <PaymentIcon />, required: ['billing.read'] },
      { href: '/payments', label: 'Payment Logs', icon: <PaymentPulseIcon />, required: ['payments.read'] },
      { href: '/billing', label: 'Billing & Wallet', icon: <BillingIcon />, required: ['billing.read'] },
      { href: '/float', label: 'Float', icon: <FloatIcon />, required: ['agents.read'] },
      { href: '/disbursements', label: 'Disbursements', icon: <SettlementIcon />, required: ['disbursements.read'] },
    ]
  },
  {
    section: 'System',
    items: [
      { href: '/tenants', label: 'Tenants', icon: <TenantIcon />, required: ['tenants.read'], platformOnly: true },
      { href: '/audit-logs', label: 'Audit Logs', icon: <AuditIcon />, required: ['audit.read'] },
      { href: '/feature-limits', label: 'Feature Limits', icon: <LimitIcon />, required: ['feature_limits.read'] },
      { href: '/support', label: 'Support', icon: <SupportIcon />, required: ['support.read'] },
      { href: '/reports', label: 'Reports', icon: <ReportIcon />, required: ['reports.read'] },
      { href: '/settings', label: 'Settings', icon: <SettingsIcon />, required: ['settings.manage'] },
    ]
  },
]

type SidebarUser = AdminSessionResponse['user']

function canAccess(user: SidebarUser, required: string[] = [], platformOnly?: boolean) {
  if (platformOnly && user.tenantId) {
    return false
  }

  if (required.length === 0) {
    return true
  }

  return required.every((permission) => user.permissions.includes(permission) || user.permissions.includes('ALL'))
}

export default function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname()
  const visibleGroups = navItems
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccess(user, item.required, item.platformOnly)),
    }))
    .filter((group) => group.items.length > 0)

  const workspaceLabel = user.tenantName ? `${user.tenantName} Workspace` : 'Platform Workspace'

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div>
          <h1>ARO<span>Fi</span></h1>
          <p>{workspaceLabel}</p>
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-info" style={{ padding: '6px 10px' }}>{user.role}</span>
            {user.tenantName && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.tenantName}</span>
            )}
          </div>
        </div>
      </div>
      {visibleGroups.map((group) => (
        <div key={group.section} className="sidebar-section">
          <div className="sidebar-section-label">{group.section}</div>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href ? 'active' : ''}`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  )
}

function HomeIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> }
function RouterIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg> }
function HotspotIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg> }
function PackageIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> }
function ActivityIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> }
function VoucherIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg> }
function UsersIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> }
function AgentIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> }
function PaymentIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg> }
function PaymentPulseIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h4l2-4 4 8 2-4h6" /></svg> }
function BillingIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> }
function FloatIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .896-3 2s1.343 2 3 2 3 .896 3 2-1.343 2-3 2m0-10V6m0 12v-2m9-4a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> }
function SettlementIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> }
function TenantIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> }
function AuditIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg> }
function LimitIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> }
function SupportIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h8m-8 4h5m-9 7l2.6-2.6A2 2 0 018 17h8a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v14z" /></svg> }
function ReportIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> }
function SettingsIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> }
