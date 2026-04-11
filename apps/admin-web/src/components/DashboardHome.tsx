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

export default async function DashboardHome() {
  const [session, billing, tenants, routers, sessions, vouchers, payments, system] = await Promise.all([
    fetchApi<AdminSessionResponse>('/auth/me'),
    fetchApi<BillingOverviewResponse>('/billing/overview'),
    fetchApi<TenantOverviewResponse>('/tenants'),
    fetchApi<RouterOverviewResponse>('/routers/overview'),
    fetchApi<SessionOverviewResponse>('/sessions/overview'),
    fetchApi<VouchersOverviewResponse>('/vouchers/overview'),
    fetchApi<PaymentOverviewResponse>('/payments/overview'),
    fetchApi<SystemOverviewResponse>('/system/overview'),
  ])

  const isTenantWorkspace = Boolean(session?.user.tenantId)
  const tenantRecord = tenants?.items?.[0]
  const dashboardTitle = session?.user.tenantName ? `${session.user.tenantName} Dashboard` : 'Dashboard'
  const dashboardSubtitle = isTenantWorkspace
    ? 'Run your hotspot business from one tenant-scoped workspace with router onboarding, billing, vouchers, and support.'
    : 'Live platform overview sourced from billing, router, voucher, and tenant records.'

  const stats = [
    {
      label: 'Posted Revenue',
      value: formatCurrency(billing?.summary.totalSalesUgx ?? 0),
      color: 'vibrant',
      change: isTenantWorkspace ? 'Completed tenant sales' : 'Completed platform sales',
    },
    {
      label: isTenantWorkspace ? 'Published Packages' : 'Total Tenants',
      value: isTenantWorkspace ? `${tenantRecord?.counts.packages ?? 0}` : `${tenants?.summary.totalTenants ?? 0}`,
      color: 'green',
      change: isTenantWorkspace ? 'Package catalog ready to sell' : 'Vendors on platform',
    },
    {
      label: isTenantWorkspace ? 'Hotspot Sites' : 'Active Hotspots',
      value: isTenantWorkspace ? `${tenantRecord?.counts.hotspots ?? 0}` : `${tenants?.summary.totalHotspots ?? 0}`,
      color: 'amber',
      change: isTenantWorkspace ? 'Configured tenant access points' : 'Configured hotspot sites',
    },
    {
      label: 'Active Sessions',
      value: `${sessions?.summary.activeSessions ?? 0}`,
      color: 'purple',
      change: 'Online right now',
    },
    {
      label: 'Vouchers Sold',
      value: `${vouchers?.summary.sold ?? 0}`,
      color: 'blue',
      change: 'Redeemable access codes sold',
    },
    {
      label: 'Mobile Money Requests',
      value: `${payments?.summary.mobileMoneyRequests ?? 0}`,
      color: 'green',
      change: 'Checkout attempts recorded',
    },
    {
      label: 'Platform Fees (8%)',
      value: formatCurrency(billing?.summary.platformFeesUgx ?? 0),
      color: 'amber',
      change: 'Fee income posted',
    },
    {
      label: 'Pending Transactions',
      value: `${billing?.summary.pendingTransactions ?? 0}`,
      color: 'purple',
      change: 'Awaiting final state',
    },
  ]

  const recentTransactions = billing?.recentTransactions ?? []
  const activeSessions = sessions?.activeSessions ?? []
  const tenantItems = tenants?.items ?? []

  const revenueBreakdown = [
    { label: 'Mobile Money Gross', value: formatCurrency(billing?.summary.mobileMoneyGrossUgx ?? 0) },
    { label: 'Voucher Gross', value: formatCurrency(billing?.summary.voucherGrossUgx ?? 0) },
    { label: 'Vendor Net', value: formatCurrency(billing?.summary.vendorNetUgx ?? 0) },
    { label: 'Wallet Float', value: formatCurrency(billing?.summary.walletBalanceUgx ?? 0) },
    { label: 'Healthy Routers', value: `${routers?.summary.healthyRouters ?? 0}` },
    { label: 'Open Support Tickets', value: `${system?.summary.openSupportTickets ?? 0}` },
  ]

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{dashboardTitle}</h1>
          <p className="page-subtitle">{dashboardSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/transactions" className="btn btn-ghost">View Transactions</a>
          <a href={isTenantWorkspace ? '/routers' : '/tenants'} className="btn btn-primary">
            {isTenantWorkspace ? '+ Connect Router' : '+ Add Tenant'}
          </a>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color === 'vibrant' ? '' : stat.color}`}>{stat.value}</div>
            <div className="stat-change">{stat.change}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Transactions</span>
          <a href="/transactions" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>View All</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Tenant</th>
                <th>Amount (UGX)</th>
                <th>Method</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No billing transactions have been posted yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {recentTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontSize: 12 }}>
                    {transaction.externalReference ?? transaction.id.slice(0, 8)}
                  </td>
                  <td>{transaction.tenant.name}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {formatCurrency(transaction.grossAmountUgx)}
                  </td>
                  <td>{transaction.paymentProvider ?? transaction.channel.replace(/_/g, ' ')}</td>
                  <td>
                    <span className={getStatusBadgeClass(transaction.status)}>
                      {transaction.status.toLowerCase()}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(transaction.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Sessions</span>
            <span className="badge badge-success">Live</span>
          </div>
          {activeSessions.length === 0 ? (
            <div className="empty-state">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              <p>Session data will appear here once routers start sending live accounting updates.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {activeSessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 14,
                    background: 'rgba(15, 23, 42, 0.22)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {session.customerReference ?? session.phoneNumber ?? session.username}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {session.packageName} via {session.router?.name ?? 'Pending router'}
                      </div>
                    </div>
                    <span className={getStatusBadgeClass(session.status)}>{session.status.toLowerCase()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>{formatMegabytes(session.dataUsedMb)} used</span>
                    <span>{formatDate(session.startedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Revenue Breakdown</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live totals</span>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {revenueBreakdown.map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">{isTenantWorkspace ? 'Tenant Readiness' : 'Tenants (Vendors)'}</span>
          <a
            href={isTenantWorkspace ? '/settings' : '/tenants'}
            className="btn btn-ghost"
            style={{ padding: '5px 12px', fontSize: 12 }}
          >
            {isTenantWorkspace ? 'Open Settings' : 'Manage'}
          </a>
        </div>
        {isTenantWorkspace ? (
          <div style={{ display: 'grid', gap: 16, padding: 20 }}>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 18,
                background: 'linear-gradient(135deg, rgba(14,165,233,0.16), rgba(15,23,42,0.48))',
              }}
            >
              <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Tenant profile
              </div>
              <div style={{ marginTop: 10, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                {tenantRecord?.name ?? session?.user.tenantName ?? 'Your tenant'}
              </div>
              <div style={{ marginTop: 8, display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 14 }}>
                <div>Portal domain: {tenantRecord?.domain ?? 'Auto-assigned during onboarding'}</div>
                <div>Support: {tenantRecord?.supportPhone ?? tenantRecord?.supportEmail ?? 'Update in settings'}</div>
                <div>Wallet balance: {formatCurrency(tenantRecord?.wallet?.balanceUgx ?? 0)}</div>
              </div>
            </div>
            <div className="stats-grid" style={{ marginBottom: 0 }}>
              {[
                { label: 'Routers', value: `${tenantRecord?.counts.routers ?? 0}` },
                { label: 'Hotspots', value: `${tenantRecord?.counts.hotspots ?? 0}` },
                { label: 'Packages', value: `${tenantRecord?.counts.packages ?? 0}` },
                { label: 'Users', value: `${tenantRecord?.counts.users ?? 0}` },
              ].map((item) => (
                <div key={item.label} className="stat-card blue">
                  <div className="stat-label">{item.label}</div>
                  <div className="stat-value blue">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tenant Name</th>
                  <th>Domain</th>
                  <th>Hotspots</th>
                  <th>Routers</th>
                  <th>Balance (UGX)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tenantItems.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state" style={{ padding: '24px' }}>
                        <p>No tenants yet. Add your first vendor to get started.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {tenantItems.slice(0, 6).map((tenant) => (
                  <tr key={tenant.id}>
                    <td>{tenant.name}</td>
                    <td>{tenant.domain ?? 'Not configured'}</td>
                    <td>{tenant.counts.hotspots}</td>
                    <td>{tenant.counts.routers}</td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {formatCurrency(tenant.wallet?.balanceUgx ?? 0)}
                    </td>
                    <td>
                      <span className={getStatusBadgeClass(tenant.domain ? 'success' : 'pending')}>
                        {tenant.domain ? 'ready' : 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
