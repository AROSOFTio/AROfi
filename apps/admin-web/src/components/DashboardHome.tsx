import {
  AdminSessionResponse,
  BillingOverviewResponse,
  RouterOverviewResponse,
  SessionOverviewResponse,
  TenantOverviewResponse,
  VouchersOverviewResponse,
  PackageCatalogResponse,
  PlatformWithdrawalsResponse,
} from '@/lib/admin-types'
import ComplianceBanner from '@/components/ComplianceBanner'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatMegabytes, getStatusBadgeClass } from '@/lib/format'
import { isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'
import ReferralProgrammePage from '@/app/(dashboard)/referrals/page'
import { DashboardAutoRefresh } from '@/components/DashboardAutoRefresh'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { SalesMixChart } from '@/components/charts/SalesMixChart'
import { RouterUsageChart } from '@/components/charts/RouterUsageChart'
import { Cpu, Database, Users, Wallet, CreditCard, ArrowUpRight, CheckCircle2, AlertCircle, ShieldCheck, Store, Ticket, FileBarChart, Router, Activity, Banknote } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

type DashboardSearchParams = { range?: string; from?: string; to?: string }

export default async function DashboardHome({ searchParams }: { searchParams?: DashboardSearchParams }) {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  const isVendor = isVendorWorkspace(session?.user)
  const isReseller = isResellerWorkspace(session?.user)

  if (isReseller) {
    return <ReferralProgrammePage />
  }

  if (isVendor) {
    return <VendorDashboard session={session} searchParams={searchParams} />
  }

  return <PlatformDashboard />
}

async function PlatformDashboard() {
  const [tenants, routers, payoutProfile, billing, withdrawals, complianceQueue, emailQueue] = await Promise.all([
    fetchApi<TenantOverviewResponse>('/tenants'),
    fetchApi<RouterOverviewResponse>('/routers/overview'),
    fetchApi<any>('/wallets/payouts/profile/me'),
    fetchApi<BillingOverviewResponse>('/billing/overview'),
    fetchApi<PlatformWithdrawalsResponse>('/wallets/withdrawals/all'),
    fetchApi<Array<{ id: string }>>('/compliance/requests?status=PENDING_REVIEW').catch(() => null),
    fetchApi<Array<{ id: string }>>('/auth/email-change-requests?status=PENDING').catch(() => null),
  ])

  const tenantItems = tenants?.items ?? []
  const routerItems = routers?.routers ?? []
  const totalActiveSessions = routerItems.reduce((sum, r) => sum + (r.activeSessions ?? 0), 0)
  const liveRouters = routers?.summary.liveRouters ?? routerItems.filter((r) => r.liveState === 'LIVE').length
  const totalRouters = routers?.summary.totalRouters ?? routerItems.length

  const pendingCompliance = complianceQueue?.length ?? 0
  const pendingEmailChanges = emailQueue?.length ?? 0
  const pendingPayouts =
    (withdrawals?.summary.pendingReview ?? 0) +
    (withdrawals?.summary.pendingPayoutNumbers ?? 0) +
    (withdrawals?.summary.pendingNumberChanges ?? 0)
  const pendingTotal = pendingCompliance + pendingEmailChanges + pendingPayouts

  const availableUgx = payoutProfile?.wallet?.balanceUgx ?? 0
  const platformFeesUgx = billing?.summary.platformFeesUgx ?? 0
  const todayGrossUgx = billing?.summary.todayGrossSalesUgx ?? 0
  const monthGrossUgx = billing?.summary.monthGrossSalesUgx ?? 0

  const recentBusinesses = [...tenantItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
  const routersByTenant = new Map<string, typeof routerItems>()
  for (const router of routerItems) {
    const key = router.tenant?.id ?? 'unknown'
    const bucket = routersByTenant.get(key) ?? []
    bucket.push(router)
    routersByTenant.set(key, bucket)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Developer Admin</h1>
          <p className="page-subtitle">Platform control center — approvals, businesses, routers, and commission at a glance.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/admin/compliance-reviews" className="btn btn-ghost">Compliance Reviews</a>
          <a href="/businesses" className="btn btn-primary">Businesses</a>
        </div>
      </div>

      {/* KPI strip */}
      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <Stat label="Pending Approvals" value={`${pendingTotal}`} color={pendingTotal > 0 ? 'amber' : 'green'} note="Compliance, email & payout reviews" />
        <Stat label="Businesses" value={`${tenants?.summary.totalTenants ?? 0}`} color="purple" note="Active workspaces" />
        <Stat label="Routers Live" value={`${liveRouters} / ${totalRouters}`} color="green" note="Sending signals right now" />
        <Stat label="Active Sessions" value={`${totalActiveSessions}`} color="blue" note="Users online" />
        <Stat label="Sales Today" value={formatCurrency(todayGrossUgx)} color="blue" note={`This month: ${formatCurrency(monthGrossUgx)}`} />
        <Stat label="Commission Earned" value={formatCurrency(platformFeesUgx)} color="amber" note={`Wallet: ${formatCurrency(availableUgx)}`} />
      </div>

      {/* Action Center — every pending queue, one click deep */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header">
          <span className="card-title">Action Center</span>
          <span className={`badge ${pendingTotal > 0 ? 'badge-warning' : 'badge-success'}`}>
            {pendingTotal > 0 ? `${pendingTotal} item${pendingTotal === 1 ? '' : 's'} need attention` : 'All clear'}
          </span>
        </div>
        <div className="action-center-grid">
          <a href="/admin/compliance-reviews" className="action-center-item">
            <ShieldCheck size={20} />
            <div>
              <strong>{pendingCompliance}</strong>
              <span>Compliance submissions</span>
            </div>
          </a>
          <a href="/disbursements" className="action-center-item">
            <Wallet size={20} />
            <div>
              <strong>{pendingPayouts}</strong>
              <span>Payout &amp; withdrawal reviews</span>
            </div>
          </a>
          <a href="/admin/email-approvals" className="action-center-item">
            <Users size={20} />
            <div>
              <strong>{pendingEmailChanges}</strong>
              <span>Email change requests</span>
            </div>
          </a>
          <a href="/support" className="action-center-item">
            <Database size={20} />
            <div>
              <strong>Support</strong>
              <span>Open ticket queue</span>
            </div>
          </a>
        </div>
      </div>

      {/* Businesses — each with its routers, locations, ISPs and site managers */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header">
          <span className="card-title">Businesses &amp; Their Routers</span>
          <a href="/businesses" className="btn btn-ghost btn-sm">Manage Businesses</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Contact</th>
                <th>Wallet</th>
                <th>Routers (location · ISP · site manager)</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentBusinesses.length === 0 && <EmptyRow colSpan={6} text="No businesses have been onboarded yet." />}
              {recentBusinesses.map((tenant) => {
                const tenantRouters = routersByTenant.get(tenant.id) ?? []
                return (
                  <tr key={tenant.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{tenant.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{tenant.domain ?? 'No domain'}</div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      <div>{tenant.supportPhone ?? '—'}</div>
                      <div style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{tenant.supportEmail ?? ''}</div>
                    </td>
                    <td>{formatCurrency(tenant.wallet?.balanceUgx ?? 0)}</td>
                    <td>
                      {tenantRouters.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No routers yet</span>}
                      <div style={{ display: 'grid', gap: 6 }}>
                        {tenantRouters.slice(0, 3).map((router) => (
                          <div key={router.id} style={{ fontSize: 12, lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 600 }}>{router.name}</span>
                            <span style={{ color: router.liveState === 'LIVE' ? 'var(--success-fg)' : router.liveState === 'OFFLINE' ? 'var(--danger-fg)' : 'var(--warn-fg)', fontWeight: 700, marginLeft: 6, fontSize: 10.5 }}>
                              {router.liveState ?? 'PENDING'}
                            </span>
                            <div style={{ color: 'var(--text-2)' }}>
                              {[router.locationText ?? router.siteLabel, router.ispName, router.managerName ? `${router.managerName}${router.managerPhone ? ` (${router.managerPhone})` : ''}` : null]
                                .filter(Boolean)
                                .join(' · ') || 'Location, ISP & manager not set'}
                            </div>
                          </div>
                        ))}
                        {tenantRouters.length > 3 && (
                          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>+{tenantRouters.length - 3} more router(s)</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className={getStatusBadgeClass(tenant.status?.accountActive === false ? 'failed' : 'success')}>
                          {tenant.status?.accountActive === false ? 'suspended' : 'active'}
                        </span>
                        {tenant.status?.fraudHold && <span className={getStatusBadgeClass('failed')}>fraud hold</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{formatDate(tenant.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform wallet + payout settings row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 12, marginBottom: 14 }}>
        <div className="card" style={{ margin: 0, padding: 20, background: 'var(--brand)', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 190 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={17} />
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.07em' }}>PLATFORM WALLET</span>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Commission balance available to withdraw</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>{formatCurrency(availableUgx)}</div>
          </div>
          <a href="/earnings" className="btn" style={{ background: '#fff', color: 'var(--brand)', fontWeight: 700, justifyContent: 'center' }}>
            Withdraw Platform Fees <ArrowUpRight size={15} />
          </a>
        </div>

        <div className="card" style={{ padding: 16, margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Payout Configuration</span>
            <a href="/earnings" style={{ color: 'var(--green)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>Manage</a>
          </div>
          <div style={{ display: 'grid', gap: 9, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-2)' }}>Primary payout number</span>
              <span style={{ fontWeight: 600 }}>
                {payoutProfile?.numbers?.find((n: any) => n.isPrimary && n.status === 'VERIFIED')
                  ? `${payoutProfile.numbers.find((n: any) => n.isPrimary && n.status === 'VERIFIED').network} line`
                  : <span style={{ color: 'var(--danger-fg)' }}>Not set</span>}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-2)' }}>Withdrawal secret</span>
              <span style={{ fontWeight: 600 }}>
                {payoutProfile?.profile?.secretConfigured
                  ? <span style={{ color: 'var(--success-fg)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={14} /> Set</span>
                  : <span style={{ color: 'var(--warn-fg)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><AlertCircle size={14} /> Setup needed</span>}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-2)' }}>Completed payouts</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(withdrawals?.summary.completedAmountUgx ?? 0)}</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 16, margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Recent Platform Withdrawals</span>
            <a href="/disbursements" style={{ color: 'var(--green)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>All</a>
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 140, overflowY: 'auto' }}>
            {(!payoutProfile?.recentWithdrawals || payoutProfile.recentWithdrawals.length === 0) ? (
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No payout history yet.</span>
            ) : (
              payoutProfile.recentWithdrawals.slice(0, 5).map((item: any) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                  <span style={{ fontWeight: 600 }}>{formatCurrency(item.amountUgx)}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{formatDate(item.createdAt)}</span>
                  <span className={getStatusBadgeClass(item.status)} style={{ fontSize: 10.5 }}>{item.status.toLowerCase()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Router fleet */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Router Fleet</span>
          <a href="/admin/router" className="btn btn-ghost btn-sm">Observability</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Router</th>
                <th>Business</th>
                <th>Location</th>
                <th>ISP</th>
                <th>Site Manager</th>
                <th>State</th>
                <th>Users</th>
                <th>Last Signal</th>
              </tr>
            </thead>
            <tbody>
              {routerItems.length === 0 && <EmptyRow colSpan={8} text="No routers registered yet." />}
              {routerItems.slice(0, 20).map((router) => (
                <tr key={router.id}>
                  <td style={{ fontWeight: 600 }}>{router.name}</td>
                  <td style={{ fontSize: 12.5 }}>{router.tenant?.name ?? '—'}</td>
                  <td style={{ fontSize: 12.5 }}>{router.locationText ?? router.siteLabel ?? '—'}</td>
                  <td style={{ fontSize: 12.5 }}>{router.ispName ?? '—'}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {router.managerName ?? '—'}
                    {router.managerPhone && <div style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{router.managerPhone}</div>}
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(router.liveState === 'LIVE' ? 'success' : router.liveState === 'OFFLINE' ? 'failed' : 'pending')}>
                      {(router.liveState ?? 'PENDING').toLowerCase()}
                    </span>
                  </td>
                  <td>{router.activeSessions ?? 0}</td>
                  <td style={{ fontSize: 12 }}>{router.lastSignalAt ? formatDate(router.lastSignalAt) : '—'}</td>
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
  const [billing, routers, sessions, vouchers, payoutProfile, packages, tenantSettings, compliance] = await Promise.all([
    fetchApi<BillingOverviewResponse>(`/billing/overview?${query}`),
    fetchApi<RouterOverviewResponse>('/routers/overview'),
    fetchApi<SessionOverviewResponse>('/sessions/overview'),
    fetchApi<VouchersOverviewResponse>('/vouchers/overview'),
    fetchApi<any>('/wallets/payouts/profile/me'),
    fetchApi<PackageCatalogResponse>('/packages'),
    fetchApi<any>('/system/tenant-settings').catch(() => null),
    fetchApi<{ status: string }>('/compliance/me').catch(() => null),
  ])
  const complianceStatus = compliance?.status ?? 'NOT_SUBMITTED'

  void tenantSettings

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

  // Wallet helper calculations
  const verifiedNumbers = payoutProfile?.numbers?.filter((item: any) => item.status === 'VERIFIED') ?? []
  const primaryNumber = verifiedNumbers.find((item: any) => item.isPrimary) ?? verifiedNumbers[0] ?? null
  const availableUgx = payoutProfile?.wallet?.balanceUgx ?? billing?.summary.withdrawableBalanceUgx ?? billing?.summary.walletBalanceUgx ?? 0
  const minimumPayoutUgx = payoutProfile?.rules?.minimumPayoutUgx ?? 0

  return (
    <div className="tenant-dashboard">
      <DashboardAutoRefresh />
      <div className="dashboard-header dashboard-header-compact">
        <h1 className="page-title">Dashboard</h1>
        <div className="quick-menu">
          <button type="button" className="btn btn-ghost quick-menu-trigger">Quick</button>
          <div className="quick-menu-panel">
            <a href="/agents" className="quick-menu-item"><Store size={16} /><span>Sell voucher</span></a>
            <a href="/vouchers" className="quick-menu-item"><Ticket size={16} /><span>Vouchers</span></a>
            <a href="/reports" className="quick-menu-item"><FileBarChart size={16} /><span>Reports</span></a>
            <a href="/admin/settings/routers?add=true" className="quick-menu-item"><Router size={16} /><span>Add router</span></a>
          </div>
        </div>
      </div>

      <ComplianceBanner status={complianceStatus as any} tenantId={session?.user.tenantId} />

      {/* Quick Actions — the day-to-day operator tasks, one click deep. */}
      <div className="card dashboard-action-card" style={{ display: 'none', marginBottom: 14 }}>
        <div className="card-header">
          <span className="card-title">Quick Actions</span>
        </div>
        <div className="action-center-grid">
          <a href="/agents" className="action-center-item dashboard-action-item">
            <Store size={20} />
            <div>
              <strong>Sell</strong>
              <span>Sell a voucher to a walk-in customer</span>
            </div>
          </a>
          <a href="/vouchers" className="action-center-item dashboard-action-item">
            <Ticket size={20} />
            <div>
              <strong>Vouchers</strong>
              <span>Generate a new voucher batch</span>
            </div>
          </a>
          <a href="/reports" className="action-center-item dashboard-action-item">
            <FileBarChart size={20} />
            <div>
              <strong>Reports</strong>
              <span>Export sales, vouchers &amp; payouts</span>
            </div>
          </a>
          <a href="/admin/settings/routers?add=true" className="action-center-item dashboard-action-item">
            <Router size={20} />
            <div>
              <strong>Add Router</strong>
              <span>Register a new hotspot router</span>
            </div>
          </a>
        </div>
      </div>

      {/* System Insights (with the date filter at its top) and the money KPI
          boxes sit in one row. Platform Fees is intentionally omitted here —
          it's a platform-level number, not something tenants need on their
          own dashboard. Active / Online / Data live in the System Insights
          card only, so they are not repeated in the KPI boxes. */}
      <div className="dashboard-insights-row">
        <DashboardStatTodayMonth
          title="Gross Sales"
          icon={<Banknote size={24} />}
          filteredUgx={billing?.summary.grossSalesUgx ?? billing?.summary.totalSalesUgx ?? 0}
          dateRangeLabel={dateRange}
          todayUgx={billing?.summary.todayGrossSalesUgx ?? 0}
          monthUgx={billing?.summary.monthGrossSalesUgx ?? 0}
        />
        <DashboardStatTodayMonth
          title="Net Earnings"
          icon={<Wallet size={24} />}
          filteredUgx={billing?.summary.netEarningsUgx ?? billing?.summary.vendorNetUgx ?? 0}
          dateRangeLabel={dateRange}
          todayUgx={billing?.summary.todayNetEarningsUgx ?? 0}
          monthUgx={billing?.summary.monthNetEarningsUgx ?? 0}
        />
        <DashboardStatCompact title="Pending Withdrawals" value={formatCurrency(billing?.summary.pendingWithdrawalUgx ?? 0)} icon={<Activity size={24} />} />
        <SystemInsightsCompact
          live={liveRouters > 0}
          activeUsers={billing?.summary.activeUsers ?? sessions?.summary.activeSessions ?? 0}
          onlineRouters={liveRouters}
          dataUsedLabel={formatMegabytes(billing?.summary.dataUsedMb ?? totalDataUsedMb)}
          statusColor={routerStatusColor}
          filter={<DateRangeFilter from={range.from} to={range.to} />}
        />
      </div>

      {/* Modern Wallet Card & Disbursement Settings Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 12, marginBottom: 4 }}>
        {/* Visual Credit Card Style Wallet Card */}
        <div className="wallet-showcase-card">
          {/* Card background shape accents */}
          <div style={{
            position: 'absolute',
            top: -24,
            right: -24,
            width: 148,
            height: 148,
            borderRadius: '50%',
            background: 'rgba(37, 99, 235, 0.08)',
            pointerEvents: 'none'
          }} />
          <div style={{
            position: 'absolute',
            bottom: -44,
            left: -24,
            width: 168,
            height: 168,
            borderRadius: '50%',
            background: 'rgba(15, 23, 42, 0.04)',
            pointerEvents: 'none'
          }} />

          {/* Top Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wallet size={18} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.9 }}>AROFi WALLET</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(37,99,235,0.22)' }} />
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(22,163,74,0.2)', marginLeft: -9 }} />
            </div>
          </div>

          {/* Balance */}
          <div style={{ zIndex: 2, marginTop: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>Available Balance</div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>
              {formatCurrency(availableUgx)}
            </div>
          </div>

          {/* Footer Details */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 2, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account Owner</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{session?.user.tenantName || 'Business'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payout Network</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                {primaryNumber ? `${primaryNumber.network} Line` : 'None Configured'}
              </div>
            </div>
          </div>
        </div>

        {/* Disbursement settings & actions */}
        <div className="card" style={{ padding: 15, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', margin: 0 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Disbursement Settings</span>
              <a href="/earnings" style={{ color: 'var(--green)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>Manage</a>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--text-2)' }}>Primary payout number</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                  {primaryNumber ? `${primaryNumber.network} - ${primaryNumber.normalizedPhone}` : <span style={{ color: '#ef4444' }}>Not set</span>}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--text-2)' }}>Secret key verification</span>
                <span>
                  {payoutProfile?.profile?.secretConfigured ? (
                    <span style={{ color: 'var(--arofi-theme-accent-text)', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                      <CheckCircle2 size={14} /> Set
                    </span>
                  ) : (
                    <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                      <AlertCircle size={14} /> Setup needed
                    </span>
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Minimum withdrawable</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                  {minimumPayoutUgx > 0 ? formatCurrency(minimumPayoutUgx) : 'None'}
                </span>
              </div>
            </div>
          </div>
          <a href="/earnings" className="btn btn-primary btn-block" style={{ marginTop: 14, display: 'inline-flex', gap: 6 }}>
            Withdraw Funds <ArrowUpRight size={16} />
          </a>
        </div>

        {/* Withdrawal History */}
        <div className="card" style={{ padding: 15, margin: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12 }}>Recent Withdrawals</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto', maxHeight: 150 }}>
            {(!payoutProfile?.recentWithdrawals || payoutProfile.recentWithdrawals.length === 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0', gap: 6 }}>
                <CreditCard size={24} style={{ opacity: 0.4 }} />
                <span>No payout history found</span>
              </div>
            ) : (
              payoutProfile.recentWithdrawals.slice(0, 3).map((w: any) => (
                <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{formatCurrency(w.amountUgx)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(w.createdAt)}</div>
                  </div>
                  <span className={getStatusBadgeClass(w.status)}>{w.status.toLowerCase().replace(/_/g, ' ')}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <div className="dashboard-panel-title">Revenue Overview</div>
              <div className="dashboard-panel-subtitle">{dateRange}</div>
            </div>
          </div>
          <RevenueChart data={billing?.chart ?? []} />
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
                <div className="sale-avatar">{transaction.voucher ? <Ticket size={18} /> : initialsFor(transaction.customerReference ?? 'Customer')}</div>
                <div>
                  <div className="sale-title">{transaction.customerReference ?? transaction.voucher?.code ?? 'Customer'}</div>
                  {transaction.channel === 'MOBILE_MONEY' && transaction.payment?.phoneNumber && transaction.customerReference !== transaction.payment.phoneNumber && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {transaction.payment.phoneNumber}
                    </div>
                  )}
                  <div className="sale-meta">{transaction.package?.name ?? 'Package'} · {transaction.channel?.replace('_', ' ') ?? 'Sale'} · {relativeTime(transaction.createdAt)}</div>
                </div>
                <div className="sale-amount-col">
                  {transaction.grossAmountUgx > 0 ? (
                    <div className="sale-amount">+{formatCurrency(transaction.netAmountUgx)}</div>
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

      {/* Secondary charts row */}
      <div className="charts-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Sales Mix</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{dateRange}</span>
          </div>
          <SalesMixChart
            mobileMoneyUgx={billing?.summary.mobileMoneyGrossUgx ?? 0}
            voucherUgx={billing?.summary.voucherGrossUgx ?? 0}
          />
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Data Usage by Router</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Today</span>
          </div>
          <RouterUsageChart data={sessions?.usageByRouter ?? []} />
        </div>
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
          <span className="live-dot" style={{ background: live ? 'var(--success-fg)' : statusColor }} />
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
  filter,
}: {
  live: boolean
  activeUsers: number
  onlineRouters: number
  dataUsedLabel: string
  statusColor: string
  filter?: ReactNode
}) {
  return (
    <div className="system-insights-card">
      {filter && <div className="system-insights-card-filter">{filter}</div>}
      <div className="system-insights-card-head">
        <span className="system-insights-card-title">System Insights</span>
        <span className={`live-pill-mini ${live ? 'is-live' : 'is-offline'}`}>
          <span className="live-dot-mini" style={{ background: live ? 'var(--success-fg)' : statusColor }} />
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

function DashboardStatCompact({
  title,
  value,
  mmUgx,
  voucherUgx,
  icon,
}: {
  title: string
  value: string
  mmUgx?: number
  voucherUgx?: number
  icon?: ReactNode
}) {
  const hasSplit = (mmUgx !== undefined || voucherUgx !== undefined) && (mmUgx! + (voucherUgx ?? 0)) > 0
  return (
    <div className="tenant-stat-compact">
      <div className="tenant-stat-compact-head">
        {icon && <span className="tenant-stat-icon-mark">{icon}</span>}
        <div className="tenant-stat-compact-title">{title}</div>
      </div>
      <div className="tenant-stat-compact-value">{value}</div>
      {hasSplit && (
        <div className="tenant-stat-compact-split">
          {mmUgx !== undefined && mmUgx > 0 && (
            <span>
              <span className="split-label">MM</span> {formatCurrency(mmUgx)}
            </span>
          )}
          {voucherUgx !== undefined && voucherUgx > 0 && (
            <span>
              <span className="split-label">VRTS</span> {formatCurrency(voucherUgx)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function DashboardStatTodayMonth({
  title,
  icon,
  filteredUgx,
  dateRangeLabel,
  todayUgx,
  monthUgx,
}: {
  title: string
  icon?: ReactNode
  filteredUgx: number
  dateRangeLabel: string
  todayUgx: number
  monthUgx: number
}) {
  return (
    <div className="tenant-stat-compact">
      <div className="tenant-stat-compact-head">
        {icon && <span className="tenant-stat-icon-mark">{icon}</span>}
        <div className="tenant-stat-compact-title">{title}</div>
      </div>
      <div className="tenant-stat-compact-value">{formatCurrency(filteredUgx)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: -2, marginBottom: 4 }}>{dateRangeLabel}</div>
      <div className="tenant-stat-compact-split">
        <span><span className="split-label">Today</span> {formatCurrency(todayUgx)}</span>
        <span style={{ marginLeft: 'auto' }}>
          <span className="split-label">This month</span> {formatCurrency(monthUgx)}
        </span>
      </div>
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
        <div className="empty-state" style={{ padding: 16 }}>
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
