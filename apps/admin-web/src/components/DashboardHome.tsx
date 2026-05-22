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
import LiveRouterStatusCard from '@/components/LiveRouterStatusCard'

export default async function DashboardHome() {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  const isVendor = Boolean(session?.user.tenantId)

  if (isVendor) {
    return <VendorDashboard session={session} />
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

async function VendorDashboard({ session }: { session: AdminSessionResponse | null }) {
  const [billing, tenants, routers, sessions, vouchers, payments, system] = await Promise.all([
    fetchApi<BillingOverviewResponse>('/billing/overview'),
    fetchApi<TenantOverviewResponse>('/tenants'),
    fetchApi<RouterOverviewResponse>('/routers/overview'),
    fetchApi<SessionOverviewResponse>('/sessions/overview'),
    fetchApi<VouchersOverviewResponse>('/vouchers/overview'),
    fetchApi<PaymentOverviewResponse>('/payments/overview'),
    fetchApi<SystemOverviewResponse>('/system/overview'),
  ])

  const tenantRecord = tenants?.items?.[0]
  const recentTransactions = billing?.recentTransactions ?? []
  const activeSessions = sessions?.activeSessions ?? []
  const supportTickets = system?.support.items ?? []
  const routerItems = routers?.routers ?? []
  const liveRouters = routerItems.filter((router) => router.liveState === 'LIVE' || router.isLiveNow)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{session?.user.tenantName ?? 'Vendor'} Dashboard</h1>
          <p className="page-subtitle">Run sales, vouchers, packages, customer sessions, wallet withdrawals, and support from this vendor workspace.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/disbursements" className="btn btn-ghost">Withdraw</a>
          <a href="/routers" className="btn btn-primary">{routerItems.length > 0 ? 'Manage Routers' : 'Connect Router'}</a>
        </div>
      </div>

      <LiveRouterStatusCard initialRouters={routerItems} />

      <div className="stats-grid">
        <Stat label="Sales Revenue" value={formatCurrency(billing?.summary.totalSalesUgx ?? 0)} color="green" note="Completed customer sales" />
        <Stat label="Wallet Balance" value={formatCurrency(billing?.summary.walletBalanceUgx ?? 0)} color="blue" note="Available vendor wallet" />
        <Stat label="Active Sessions" value={`${sessions?.summary.activeSessions ?? 0}`} color="purple" note="Customers online now" />
        <Stat label="Packages" value={`${tenantRecord?.counts.packages ?? 0}`} color="amber" note="Sellable offers" />
        <Stat label="Vouchers Sold" value={`${vouchers?.summary.sold ?? 0}`} color="blue" note="Voucher access sold" />
        <Stat label="Pending Payments" value={`${payments?.summary.pendingPayments ?? 0}`} color="amber" note="Awaiting provider result" />
        <Stat label="Open Tickets" value={`${supportTickets.filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.status)).length}`} color="purple" note="Support conversations" />
        <Stat label="Live Routers" value={`${routers?.summary.liveRouters ?? liveRouters.length}`} color="green" note="Fresh callback, RADIUS, accounting, or API signal" />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Live Customer Transactions</span>
          <a href="/transactions" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>View All</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer / Phone</th>
                <th>Package / Voucher</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.length === 0 && <EmptyRow colSpan={6} text="Customer payments and voucher sales will appear here." />}
              {recentTransactions.slice(0, 10).map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{transaction.customerReference ?? 'Customer'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{transaction.externalReference ?? transaction.id.slice(0, 8)}</div>
                  </td>
                  <td>{transaction.package?.name ?? transaction.voucher?.code ?? transaction.type.replace(/_/g, ' ')}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatCurrency(transaction.grossAmountUgx)}</td>
                  <td>{transaction.paymentProvider ?? transaction.channel.replace(/_/g, ' ')}</td>
                  <td><span className={getStatusBadgeClass(transaction.status)}>{transaction.status.toLowerCase()}</span></td>
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
            <span className="card-title">Customers Online</span>
            <span className="badge badge-success">Live</span>
          </div>
          {activeSessions.length === 0 ? (
            <div className="empty-state">
              <p>Live customer sessions will appear after router accounting starts.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {activeSessions.slice(0, 6).map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-app)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.customerReference ?? item.phoneNumber ?? item.username}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.packageName} via {item.router?.name ?? 'Router pending'}</div>
                    </div>
                    <span className={getStatusBadgeClass(item.status)}>{item.status.toLowerCase()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>{formatMegabytes(item.dataUsedMb)} used</span>
                    <span>{formatDate(item.startedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Vendor Readiness</span>
            <a href="/support" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>Submit Ticket</a>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Readiness label="Router registered" ready={(routers?.summary.totalRouters ?? 0) > 0} />
            <Readiness label="Router live now" ready={(routers?.summary.liveRouters ?? liveRouters.length) > 0} />
            <Readiness label="Package catalog ready" ready={(tenantRecord?.counts.packages ?? 0) > 0} />
            <Readiness label="Hotspot configured" ready={(tenantRecord?.counts.hotspots ?? 0) > 0} />
            <Readiness label="Payments visible" ready={(payments?.summary.mobileMoneyRequests ?? 0) > 0} />
            <Readiness label="Support channel open" ready />
          </div>
        </div>
      </div>
    </>
  )
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
