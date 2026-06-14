import {
  AdminSessionResponse,
  BillingOverviewResponse,
  PaymentOverviewResponse,
  RouterOverviewResponse,
  SessionOverviewResponse,
  SystemOverviewResponse,
  TenantOverviewResponse,
  VouchersOverviewResponse,
} from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatMegabytes, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'
import { DashboardAutoRefresh } from '@/components/DashboardAutoRefresh'
import { Cpu, Database, Users } from 'lucide-react'
import type { CSSProperties } from 'react'

type DashboardSearchParams = { range?: string; from?: string; to?: string }

export default async function DashboardHome({ searchParams }: { searchParams?: DashboardSearchParams }) {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  const isVendor = isVendorWorkspace(session?.user)

  if (isVendor) {
    return <VendorDashboard session={session} searchParams={searchParams} />
  }

  return <PlatformDashboard />
}

async function PlatformDashboard() {
  const [tenants, routers, system, payments] = await Promise.all([
    fetchApi<TenantOverviewResponse>('/tenants'),
    fetchApi<RouterOverviewResponse>('/routers/overview'),
    fetchApi<SystemOverviewResponse>('/system/overview'),
    fetchApi<PaymentOverviewResponse>('/payments/overview'),
  ])

  const supportTickets = system?.support.items ?? []
  const recentRouterChecks = routers?.recentHealthChecks ?? []
  const tenantItems = tenants?.items ?? []
  const routersNeedingHelp = (routers?.summary.offlineRouters ?? 0) + (routers?.summary.degradedRouters ?? 0) + (routers?.summary.pendingRouters ?? 0)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Developer Admin Dashboard</h1>
          <p className="page-subtitle">Manage vendors, troubleshoot router onboarding, monitor support tickets, and keep platform services healthy.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/support" className="btn btn-ghost">Support Queue</a>
          <a href="/tenants" className="btn btn-primary">Add Vendor</a>
        </div>
      </div>

      <div className="stats-grid">
        <Stat label="Vendors" value={`${tenants?.summary.totalTenants ?? 0}`} color="green" note="Tenant workspaces managed" />
        <Stat label="Router Help Needed" value={`${routersNeedingHelp}`} color="amber" note="Offline, degraded, or pending" />
        <Stat label="Open Tickets" value={`${system?.summary.openSupportTickets ?? 0}`} color="purple" note="Vendor support workload" />
        <Stat label="Critical Audits" value={`${system?.summary.criticalAudits ?? 0}`} color="amber" note="Platform events to review" />
        <Stat label="Router Groups" value={`${routers?.summary.routerGroups ?? 0}`} color="blue" note="Configured vendor networks" />
        <Stat label="Payment Requests" value={`${payments?.summary.mobileMoneyRequests ?? 0}`} color="green" note="Provider activity visible" />
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Vendor Workspaces</span>
            <a href="/tenants" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>Manage</a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Domain</th>
                  <th>Routers</th>
                  <th>Hotspots</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tenantItems.length === 0 && <EmptyRow colSpan={5} text="No vendors have been onboarded yet." />}
                {tenantItems.slice(0, 8).map((tenant) => (
                  <tr key={tenant.id}>
                    <td>{tenant.name}</td>
                    <td>{tenant.domain ?? 'Not configured'}</td>
                    <td>{tenant.counts.routers}</td>
                    <td>{tenant.counts.hotspots}</td>
                    <td><span className={getStatusBadgeClass(tenant.domain ? 'success' : 'pending')}>{tenant.domain ? 'ready' : 'setup needed'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Router Support Queue</span>
            <a href="/routers" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>Open Routers</a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Router</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Last Check</th>
                </tr>
              </thead>
              <tbody>
                {recentRouterChecks.length === 0 && <EmptyRow colSpan={4} text="No router health checks yet." />}
                {recentRouterChecks.slice(0, 8).map((check) => (
                  <tr key={check.id}>
                    <td>{check.router.name}</td>
                    <td>{check.tenant.name}</td>
                    <td><span className={getStatusBadgeClass(check.status)}>{check.status.toLowerCase()}</span></td>
                    <td style={{ fontSize: 12 }}>{formatDate(check.checkedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Vendor Support Tickets</span>
          <a href="/support" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>View All</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Vendor</th>
                <th>Subject</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {supportTickets.length === 0 && <EmptyRow colSpan={6} text="No support tickets are open." />}
              {supportTickets.slice(0, 10).map((ticket) => (
                <tr key={ticket.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ticket.reference}</td>
                  <td>{ticket.tenant?.name ?? 'Vendor'}</td>
                  <td>{ticket.subject}</td>
                  <td>{ticket.priority.toLowerCase()}</td>
                  <td><span className={getStatusBadgeClass(ticket.status)}>{ticket.status.toLowerCase()}</span></td>
                  <td style={{ fontSize: 12 }}>{formatDate(ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

async function VendorDashboard({ session, searchParams }: { session: AdminSessionResponse | null; searchParams?: DashboardSearchParams }) {
  const range = resolveDashboardRange(searchParams)
  const query = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() }).toString()
  const [billing, routers, sessions, vouchers] = await Promise.all([
    fetchApi<BillingOverviewResponse>(`/billing/overview?${query}`),
    fetchApi<RouterOverviewResponse>('/routers/overview'),
    fetchApi<SessionOverviewResponse>('/sessions/overview'),
    fetchApi<VouchersOverviewResponse>('/vouchers/overview'),
  ])

  const recentTransactions = billing?.recentTransactions ?? []
  const activeSessions = sessions?.activeSessions ?? []
  const routerItems = routers?.routers ?? []
  const now = range.to
  const dateRange = `${formatShortDate(range.from)} - ${formatShortDate(range.to)}`
  const liveRouters = routers?.summary.liveRouters ?? routerItems.filter((router) => router.liveState === 'LIVE').length
  const staleRouters = routers?.summary.staleRouters ?? routerItems.filter((router) => router.liveState === 'STALE').length
  const offlineRouters = routers?.summary.offlineRouters ?? routerItems.filter((router) => router.liveState === 'OFFLINE').length
  const onlineRouters = liveRouters + staleRouters
  const routerStatusLabel = onlineRouters > 0 ? 'Online' : offlineRouters > 0 ? 'Offline' : 'Pending'
  const routerStatusColor = onlineRouters > 0 ? 'var(--green)' : offlineRouters > 0 ? '#ef4444' : '#f59e0b'
  const totalDataUsedMb = activeSessions.reduce((total, item) => total + (item.dataUsedMb ?? 0), 0)
  const overviewTicks = Array.from({ length: 12 }).map((_, index) => {
    const day = Math.max(1, Math.round(1 + (index * Math.max(1, now.getDate() - 1)) / 11))
    return `${now.toLocaleString('en-US', { month: 'short' })} ${day}`
  })

  return (
    <div className="tenant-dashboard">
      <DashboardAutoRefresh />
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <DateRangeFilter from={range.from} to={range.to} />
        </div>
        <SystemInsightsCompact
          live={liveRouters > 0}
          activeUsers={billing?.summary.activeUsers ?? sessions?.summary.activeSessions ?? 0}
          onlineRouters={liveRouters}
          dataUsedLabel={formatMegabytes(billing?.summary.dataUsedMb ?? totalDataUsedMb)}
          statusColor={routerStatusColor}
        />
      </div>

      <div className="tenant-stats-compact">
        <DashboardStatCompact title="Gross Sales" value={formatCurrency(billing?.summary.grossSalesUgx ?? billing?.summary.totalSalesUgx ?? 0)} />
        <DashboardStatCompact title="Platform Fees" value={formatCurrency(billing?.summary.platformFeesUgx ?? 0)} />
        <DashboardStatCompact title="Net Earnings" value={formatCurrency(billing?.summary.netEarningsUgx ?? billing?.summary.vendorNetUgx ?? 0)} />
        <DashboardStatCompact title="Withdrawable Balance" value={formatCurrency(billing?.summary.withdrawableBalanceUgx ?? billing?.summary.walletBalanceUgx ?? 0)} />
        <DashboardStatCompact title="Active Users" value={`${billing?.summary.activeUsers ?? sessions?.summary.activeSessions ?? 0}`} />
        <DashboardStatCompact title="Online Routers" value={`${billing?.summary.onlineRouters ?? onlineRouters}`} />
        <DashboardStatCompact title="Pending Withdrawals" value={formatCurrency(billing?.summary.pendingWithdrawalUgx ?? 0)} />
        <DashboardStatCompact title="Data Used" value={formatMegabytes(billing?.summary.dataUsedMb ?? totalDataUsedMb)} />
      </div>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <div className="dashboard-panel-title">Overview</div>
              <div className="dashboard-panel-subtitle">{dateRange}</div>
            </div>
            <select className="form-input" style={{ width: 212, minHeight: 46 }}>
              <option>All ...</option>
            </select>
          </div>
          <div className="chart-shell">
            <div className="chart-grid" />
            <div className="chart-axis">
              {overviewTicks.map((tick, index) => <span key={`${tick}-${index}`}>{tick}</span>)}
            </div>
            <div className="chart-legend">
              <span style={{ '--legend-color': 'var(--green)' } as CSSProperties}>Proceeds</span>
              <span style={{ '--legend-color': '#111827' } as CSSProperties}>Commission</span>
              <span style={{ '--legend-color': '#818cf8' } as CSSProperties}>Gross Revenue</span>
            </div>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <div className="dashboard-panel-title">Recent Sales</div>
              <div className="dashboard-panel-subtitle">You made {recentTransactions.length} sales today.</div>
            </div>
            <a href={`/sales?${query}`} style={{ color: '#9aa3b2', textDecoration: 'none' }}>Open sales</a>
          </div>
          <div className="recent-sales-list">
            {recentTransactions.length === 0 && <div className="empty-state"><p>No recent sales yet.</p></div>}
            {recentTransactions.slice(0, 6).map((transaction) => (
              <div className="recent-sale" key={transaction.id}>
                <div className="sale-avatar">{transaction.voucher ? '[]' : initialsFor(transaction.customerReference ?? 'Customer')}</div>
                <div>
                  <div className="sale-title">{transaction.customerReference ?? transaction.voucher?.code ?? 'Customer'}</div>
                  <div className="sale-meta">{transaction.package?.name ?? 'Package'} · {transaction.channel?.replace('_', ' ') ?? 'Sale'} · {relativeTime(transaction.createdAt)}</div>
                </div>
                <div className="sale-amount-col">
                  {transaction.grossAmountUgx > 0 ? (
                    <>
                      <div className="sale-amount">+{formatCurrency(transaction.netAmountUgx)}</div>
                      {transaction.feeAmountUgx > 0 && (
                        <div className="sale-fee">fee {formatCurrency(transaction.feeAmountUgx)}</div>
                      )}
                    </>
                  ) : (
                    <div className="sale-redeemed">Redeemed</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="recent-sales-footer">Showing {Math.min(recentTransactions.length, 20)} recent sales</div>
        </section>
      </div>
    </div>
  )
}

function relativeTime(iso: string) {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return 'just now'
  const mins = Math.round(diffSec / 60)
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function resolveDashboardRange(searchParams?: DashboardSearchParams) {
  const now = new Date()
  const key = searchParams?.range ?? 'this-month'
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (key === 'today') return { key, from: startOfToday, to: now }
  if (key === 'yesterday') {
    const from = new Date(startOfToday)
    from.setDate(from.getDate() - 1)
    const to = new Date(startOfToday)
    to.setMilliseconds(-1)
    return { key, from, to }
  }
  if (key === 'last-7') {
    const from = new Date(startOfToday)
    from.setDate(from.getDate() - 6)
    return { key, from, to: now }
  }
  if (key === 'last-month') {
    return {
      key,
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    }
  }
  if (key === 'custom' && searchParams?.from && searchParams?.to) {
    const from = new Date(searchParams.from)
    const to = new Date(searchParams.to)
    if (Number.isFinite(from.getTime()) && Number.isFinite(to.getTime())) {
      // Include the whole "to" day so a same-day range still shows that day.
      to.setHours(23, 59, 59, 999)
      return { key, from, to }
    }
  }
  return { key: 'this-month', from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
}

// Real date-range picker + Filter button. Implemented as a plain GET form so it
// works inside this server component with no client JS: submitting navigates to
// /dashboard?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD.
function DateRangeFilter({ from, to }: { from: Date; to: Date }) {
  const toInput = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return (
    <form className="date-filter" action="/dashboard" method="get">
      <input type="hidden" name="range" value="custom" />
      <input type="date" name="from" className="form-input date-filter-input" defaultValue={toInput(from)} aria-label="From date" />
      <span className="date-filter-sep">to</span>
      <input type="date" name="to" className="form-input date-filter-input" defaultValue={toInput(to)} aria-label="To date" />
      <button type="submit" className="btn btn-primary date-filter-btn">Filter</button>
    </form>
  )
}

function SystemInsights({
  live,
  activeUsers,
  onlineRouters,
  dataUsedLabel,
  statusColor,
}: {
  live: boolean
  activeUsers: number
  onlineRouters: number
  dataUsedLabel: string
  statusColor: string
}) {
  return (
    <div className="system-insights">
      <div className="system-insights-head">
        <span className="system-insights-title">System Insights</span>
        <span className={`live-pill ${live ? 'is-live' : 'is-offline'}`}>
          <span className="live-dot" style={{ background: live ? '#16a34a' : statusColor }} />
          {live ? 'Live' : 'Offline'}
        </span>
      </div>
      <div className="system-insights-metrics">
        <div className="system-insights-metric"><strong>{activeUsers}</strong><span>Active</span></div>
        <div className="system-insights-metric"><strong>{onlineRouters}</strong><span>Online routers</span></div>
        <div className="system-insights-metric"><strong>{dataUsedLabel}</strong><span>Data usage</span></div>
      </div>
    </div>
  )
}

function SystemInsightsCompact({
  live,
  activeUsers,
  onlineRouters,
  dataUsedLabel,
  statusColor,
}: {
  live: boolean
  activeUsers: number
  onlineRouters: number
  dataUsedLabel: string
  statusColor: string
}) {
  return (
    <div className="system-insights-card">
      <div className="system-insights-card-head">
        <span className="system-insights-card-title">System Insights</span>
        <span className={`live-pill-mini ${live ? 'is-live' : 'is-offline'}`}>
          <span className="live-dot-mini" style={{ background: live ? '#16a34a' : statusColor }} />
          {live ? 'Live' : 'Offline'}
        </span>
      </div>
      <div className="system-insights-card-metrics">
        <div className="sic-metric"><Users size={15} /><div><strong>{activeUsers}</strong><span>Active</span></div></div>
        <div className="sic-metric"><Cpu size={15} /><div><strong>{onlineRouters}</strong><span>Online</span></div></div>
        <div className="sic-metric"><Database size={15} /><div><strong>{dataUsedLabel}</strong><span>Data</span></div></div>
      </div>
    </div>
  )
}

function DashboardStatCompact({ title, value }: { title: string; value: string }) {
  return (
    <div className="tenant-stat-compact">
      <div className="tenant-stat-compact-title">{title}</div>
      <div className="tenant-stat-compact-value">{value}</div>
    </div>
  )
}

function DashboardStat({ title, value, note, icon }: { title: string; value: string; note: string; icon: string }) {
  return (
    <div className="tenant-stat">
      <div className="tenant-stat-icon">{icon}</div>
      <div className="tenant-stat-title">{title}</div>
      <div className="tenant-stat-value">{value}</div>
      <div className="tenant-stat-note">{note}</div>
    </div>
  )
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function initialsFor(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'C'
}

function relativeDays(value: string) {
  const then = new Date(value).getTime()
  const now = Date.now()
  if (!Number.isFinite(then)) {
    return 'recently'
  }
  const days = Math.max(0, Math.round((now - then) / 86400000))
  if (days === 0) {
    return 'today'
  }
  if (days === 1) {
    return '1 day ago'
  }
  return `${days} days ago`
}

function Stat({ label, value, color, note }: { label: string; value: string; color: string; note: string }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
      <div className="stat-change">{note}</div>
    </div>
  )
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="empty-state" style={{ padding: 24 }}>
          <p>{text}</p>
        </div>
      </td>
    </tr>
  )
}

function Readiness({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className={getStatusBadgeClass(ready ? 'success' : 'pending')}>{ready ? 'ready' : 'needed'}</span>
    </div>
  )
}
