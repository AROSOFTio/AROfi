import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  Building2,
  CreditCard,
  LifeBuoy,
  Router,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import type {
  BillingOverviewResponse,
  PaymentOverviewResponse,
  PlatformWithdrawalsResponse,
  RouterOverviewResponse,
  SessionOverviewResponse,
  TenantOverviewResponse,
} from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'

type GatewayProviderSnapshot = {
  configured?: boolean
  webhookConfigured?: boolean
  liveWalletConfigured?: boolean
  missingConfiguration?: string[]
}

type PlatformSettingsSnapshot = {
  paymentGateway?: string
  supportEmail?: string | null
  gatewayReadiness?: {
    gateway?: string
    gatewayLabel?: string
    productionReady?: boolean
    webhookReady?: boolean
    providers?: Record<string, GatewayProviderSnapshot>
  }
}

type DashboardSummaryResponse = {
  support: {
    open: number
    critical: number
  }
  audit: {
    critical: number
  }
  reviews: {
    pendingCompliance: number
  }
}

type ReviewItem = {
  id: string
}

async function safeFetch<T>(path: string): Promise<T | null> {
  try {
    return await fetchApi<T>(path)
  } catch {
    return null
  }
}

export default async function PlatformCommandCenter() {
  const [tenants, routers, billing, withdrawals, emailChanges, sessions, payments, system, settings] = await Promise.all([
    safeFetch<TenantOverviewResponse>('/tenants'),
    safeFetch<RouterOverviewResponse>('/routers/overview'),
    safeFetch<BillingOverviewResponse>('/billing/overview'),
    safeFetch<PlatformWithdrawalsResponse>('/wallets/withdrawals/all'),
    safeFetch<ReviewItem[]>('/auth/email-change-requests?status=PENDING'),
    safeFetch<SessionOverviewResponse>('/sessions/overview'),
    safeFetch<PaymentOverviewResponse>('/payments/overview'),
    safeFetch<DashboardSummaryResponse>('/system/dashboard-summary'),
    safeFetch<PlatformSettingsSnapshot>('/system/settings'),
  ])

  const businesses = tenants?.items ?? []
  const routerItems = routers?.routers ?? []
  const recentTransactions = billing?.recentTransactions ?? []
  const activeBusinesses = businesses.filter((item) => item.status?.accountActive !== false).length
  const totalRouters = routers?.summary.totalRouters ?? routerItems.length
  const liveRouters = routers?.summary.liveRouters ?? routerItems.filter((item) => item.liveState === 'LIVE').length
  const offlineRouters = routerItems.filter((item) => item.liveState === 'OFFLINE' || item.liveState === 'STALE')
  const activeUsers = sessions?.summary.activeSessions ?? routerItems.reduce((sum, item) => sum + (item.activeSessions ?? 0), 0)
  const paymentTotal = payments?.summary.totalPayments ?? 0
  const paymentCompleted = payments?.summary.completedPayments ?? 0
  const paymentFailed = payments?.summary.failedPayments ?? 0
  const paymentSuccessRate = paymentTotal > 0 ? Math.round((paymentCompleted / paymentTotal) * 1000) / 10 : 100
  const networkUptime = totalRouters > 0 ? Math.round((liveRouters / totalRouters) * 1000) / 10 : 100
  const pendingPayouts =
    (withdrawals?.summary.pendingReview ?? 0) +
    (withdrawals?.summary.pendingPayoutNumbers ?? 0) +
    (withdrawals?.summary.pendingNumberChanges ?? 0)
  const pendingCompliance = system?.reviews.pendingCompliance ?? 0
  const pendingReviews = pendingCompliance + (emailChanges?.length ?? 0)
  const openTickets = system?.support.open ?? 0
  const criticalTickets = system?.support.critical ?? 0
  const criticalAudits = system?.audit.critical ?? 0
  const criticalAlerts = offlineRouters.length + paymentFailed + pendingPayouts + pendingReviews + criticalTickets
  const selectedGateway = settings?.gatewayReadiness?.gatewayLabel ?? settings?.paymentGateway ?? 'Not selected'
  const gatewayReady = Boolean(settings?.gatewayReadiness?.productionReady)
  const chart = (billing?.chart ?? []).slice(-10)
  const chartMax = Math.max(1, ...chart.map((point) => point.grossSalesUgx))

  const routersByTenant = new Map<string, typeof routerItems>()
  for (const router of routerItems) {
    const tenantId = router.tenant?.id
    if (!tenantId) continue
    const bucket = routersByTenant.get(tenantId) ?? []
    bucket.push(router)
    routersByTenant.set(tenantId, bucket)
  }

  const topBusinesses = [...businesses]
    .sort((a, b) => (b.earnings?.grossSalesUgx ?? 0) - (a.earnings?.grossSalesUgx ?? 0))
    .slice(0, 7)

  const attentionItems = [
    {
      href: '/admin/settings/routers',
      label: 'Routers needing attention',
      value: offlineRouters.length,
      tone: offlineRouters.length > 0 ? 'danger' : 'success',
    },
    {
      href: '/payments',
      label: 'Failed payment requests',
      value: paymentFailed,
      tone: paymentFailed > 0 ? 'danger' : 'success',
    },
    {
      href: '/disbursements',
      label: 'Payout actions pending',
      value: pendingPayouts,
      tone: pendingPayouts > 0 ? 'warning' : 'success',
    },
    {
      href: '/admin/reviews',
      label: 'Business reviews pending',
      value: pendingReviews,
      tone: pendingReviews > 0 ? 'warning' : 'success',
    },
    {
      href: '/support',
      label: 'Open support tickets',
      value: openTickets,
      tone: criticalTickets > 0 ? 'danger' : openTickets > 0 ? 'warning' : 'success',
    },
  ]

  return (
    <div className="platform-command-center">
      <style>{`
        .platform-command-center{display:grid;gap:14px;font-family:"Segoe UI",SegoeUI,Arial,sans-serif;color:var(--text-1)}
        .pcc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
        .pcc-header h1{margin:0;font-size:27px;line-height:1.12;letter-spacing:-.035em;font-weight:820}
        .pcc-header p{margin:5px 0 0;color:var(--text-3);font-size:13px}
        .pcc-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .pcc-status-strip{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:10px 13px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);font-size:11.5px;color:var(--text-3)}
        .pcc-status-strip strong{color:var(--text-1);font-size:13px}
        .pcc-alert-count{color:${criticalAlerts > 0 ? '#b91c1c' : '#15803d'}!important}
        .pcc-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .pcc-metric{min-width:0;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);padding:15px;box-shadow:0 2px 8px rgba(15,23,42,.035)}
        .pcc-metric-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--text-3);font-size:10.5px;font-weight:800;letter-spacing:.045em;text-transform:uppercase}
        .pcc-metric-icon{display:grid;place-items:center;width:31px;height:31px;border-radius:9px;background:var(--surface-muted);color:var(--brand-fg,#2563eb)}
        .pcc-metric-value{display:block;margin-top:9px;font-size:27px;line-height:1;font-weight:820;letter-spacing:-.035em;color:var(--text-1)}
        .pcc-metric-note{display:block;margin-top:6px;color:var(--text-3);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pcc-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.75fr);gap:12px;align-items:stretch}
        .pcc-card{border:1px solid var(--border);border-radius:12px;background:var(--bg-card);overflow:hidden;min-width:0}
        .pcc-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border)}
        .pcc-card-title{font-size:13px;font-weight:800;color:var(--text-1)}
        .pcc-card-link{display:inline-flex;align-items:center;gap:4px;color:var(--brand-fg,#2563eb);font-size:11.5px;font-weight:750;text-decoration:none}
        .pcc-chart{display:flex;align-items:flex-end;gap:8px;height:210px;padding:20px 16px 14px;background:linear-gradient(180deg,var(--bg-card),var(--bg-app))}
        .pcc-chart-column{display:flex;flex:1;min-width:0;height:100%;flex-direction:column;justify-content:flex-end;align-items:center;gap:7px}
        .pcc-chart-bars{display:flex;align-items:flex-end;gap:3px;width:100%;height:160px}
        .pcc-chart-gross,.pcc-chart-fees{display:block;border-radius:5px 5px 2px 2px;min-height:3px}
        .pcc-chart-gross{flex:1;background:var(--brand-fg,#2563eb)}
        .pcc-chart-fees{width:5px;background:#16a34a}
        .pcc-chart-label{font-size:9.5px;color:var(--text-3);white-space:nowrap}
        .pcc-attention{display:grid;gap:7px;padding:10px}
        .pcc-attention-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 11px;border:1px solid var(--border);border-radius:9px;text-decoration:none;color:var(--text-2);font-size:12px;background:var(--bg-card)}
        .pcc-attention-item:hover{border-color:rgba(37,99,235,.35);background:var(--surface-muted)}
        .pcc-attention-item strong{font-size:14px}
        .pcc-attention-item.danger strong{color:#b91c1c}.pcc-attention-item.warning strong{color:#b45309}.pcc-attention-item.success strong{color:#15803d}
        .pcc-health{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px}
        .pcc-health-item{border:1px solid var(--border);border-radius:9px;padding:11px;background:var(--surface-muted)}
        .pcc-health-item span{display:block;color:var(--text-3);font-size:10px;text-transform:uppercase;letter-spacing:.04em}
        .pcc-health-item strong{display:block;margin-top:4px;font-size:12.5px;color:var(--text-1)}
        .pcc-table-wrap{overflow:auto}
        .pcc-table{width:100%;border-collapse:collapse}
        .pcc-table th{padding:9px 12px;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.045em;color:var(--text-3);background:var(--surface-muted);white-space:nowrap}
        .pcc-table td{padding:11px 12px;border-top:1px solid var(--border);font-size:11.5px;color:var(--text-2);vertical-align:middle}
        .pcc-business-link{display:block;color:var(--text-1);font-size:12.5px;font-weight:750;text-decoration:none}
        .pcc-business-sub{display:block;margin-top:2px;color:var(--text-3);font-size:10.5px}
        .pcc-list{display:grid;gap:0}
        .pcc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-top:1px solid var(--border);text-decoration:none;color:var(--text-2)}
        .pcc-row:first-child{border-top:0}.pcc-row:hover{background:var(--surface-muted)}
        .pcc-row strong{display:block;font-size:12px;color:var(--text-1)}
        .pcc-row small{display:block;margin-top:2px;font-size:10.5px;color:var(--text-3)}
        .pcc-row em{font-style:normal;font-size:11.5px;font-weight:750;color:var(--text-1);white-space:nowrap}
        .pcc-empty{padding:28px 14px;text-align:center;color:var(--text-3);font-size:12px}
        @media(max-width:1100px){.pcc-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.pcc-grid{grid-template-columns:1fr}}
        @media(max-width:650px){.pcc-header{align-items:stretch;flex-direction:column}.pcc-actions{justify-content:flex-start}.pcc-metrics{grid-template-columns:1fr 1fr}.pcc-metric{padding:13px}.pcc-metric-value{font-size:22px}.pcc-status-strip{gap:10px 15px}.pcc-chart{height:185px;gap:5px;padding-left:10px;padding-right:10px}.pcc-chart-bars{height:135px}.pcc-health{grid-template-columns:1fr 1fr}}
        @media(max-width:430px){.pcc-metrics{grid-template-columns:1fr}.pcc-health{grid-template-columns:1fr}}
      `}</style>

      <header className="pcc-header">
        <div>
          <h1>Platform Command Center</h1>
          <p>Sales, businesses, payments, network health, and support in one place.</p>
        </div>
        <div className="pcc-actions">
          <Link href="/admin/operations" className="btn btn-ghost">Troubleshoot</Link>
          <Link href="/admin/settings" className="btn btn-ghost">Settings</Link>
          <Link href="/businesses" className="btn btn-primary">Businesses</Link>
        </div>
      </header>

      <div className="pcc-status-strip">
        <span><strong>{activeBusinesses}</strong> active businesses</span>
        <span><strong>{activeUsers}</strong> users online</span>
        <span><strong>{pendingPayouts}</strong> payout actions</span>
        <span><strong className="pcc-alert-count">{criticalAlerts}</strong> items need attention</span>
      </div>

      <section className="pcc-metrics">
        <Metric label="Sales today" value={formatCurrency(billing?.summary.todayGrossSalesUgx ?? 0)} note={`Month ${formatCurrency(billing?.summary.monthGrossSalesUgx ?? 0)}`} icon={<CreditCard size={16} />} />
        <Metric label="Platform revenue" value={formatCurrency(billing?.summary.platformFeesUgx ?? 0)} note={`Wallet ${formatCurrency(billing?.summary.walletBalanceUgx ?? 0)}`} icon={<Wallet size={16} />} />
        <Metric label="Payment success" value={`${paymentSuccessRate}%`} note={`${paymentFailed} failed · ${paymentCompleted} completed`} icon={<Activity size={16} />} />
        <Metric label="Network uptime" value={`${networkUptime}%`} note={`${liveRouters}/${totalRouters} routers live`} icon={<Router size={16} />} />
      </section>

      <section className="pcc-grid">
        <div className="pcc-card">
          <div className="pcc-card-head">
            <span className="pcc-card-title">Sales and platform revenue</span>
            <Link href="/sales-by-business" className="pcc-card-link">Open performance <ArrowUpRight size={13} /></Link>
          </div>
          {chart.length === 0 ? (
            <div className="pcc-empty">Sales history will appear after transactions are recorded.</div>
          ) : (
            <div className="pcc-chart" aria-label="Sales chart">
              {chart.map((point) => (
                <div className="pcc-chart-column" key={point.date} title={`${formatDate(point.date)} · ${formatCurrency(point.grossSalesUgx)}`}>
                  <div className="pcc-chart-bars">
                    <span className="pcc-chart-gross" style={{ height: `${Math.max(3, (point.grossSalesUgx / chartMax) * 100)}%` }} />
                    <span className="pcc-chart-fees" style={{ height: `${Math.max(3, (point.platformFeesUgx / chartMax) * 100)}%` }} />
                  </div>
                  <span className="pcc-chart-label">{shortDate(point.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pcc-card">
          <div className="pcc-card-head">
            <span className="pcc-card-title">Needs attention</span>
            <Link href="/admin/operations" className="pcc-card-link">Diagnose <ArrowUpRight size={13} /></Link>
          </div>
          <div className="pcc-attention">
            {attentionItems.map((item) => (
              <Link key={item.label} href={item.href} className={`pcc-attention-item ${item.tone}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="pcc-grid">
        <div className="pcc-card">
          <div className="pcc-card-head">
            <span className="pcc-card-title">Business performance</span>
            <Link href="/businesses" className="pcc-card-link">All businesses <ArrowUpRight size={13} /></Link>
          </div>
          <div className="pcc-table-wrap">
            <table className="pcc-table">
              <thead>
                <tr><th>Business</th><th>Sales</th><th>Platform fees</th><th>Network</th><th>Status</th></tr>
              </thead>
              <tbody>
                {topBusinesses.length === 0 ? (
                  <tr><td colSpan={5}><div className="pcc-empty">No businesses have been onboarded.</div></td></tr>
                ) : topBusinesses.map((business) => {
                  const businessRouters = routersByTenant.get(business.id) ?? []
                  const businessLive = businessRouters.filter((item) => item.liveState === 'LIVE').length
                  const active = business.status?.accountActive !== false
                  return (
                    <tr key={business.id}>
                      <td>
                        <Link href={`/businesses/${business.id}`} className="pcc-business-link">{business.name}</Link>
                        <span className="pcc-business-sub">{business.supportPhone ?? business.domain ?? 'No contact set'}</span>
                      </td>
                      <td>{formatCurrency(business.earnings?.grossSalesUgx ?? 0)}</td>
                      <td>{formatCurrency(business.earnings?.platformFeesUgx ?? 0)}</td>
                      <td>{businessLive}/{businessRouters.length}</td>
                      <td><span className={getStatusBadgeClass(active ? 'success' : 'failed')}>{active ? 'active' : 'suspended'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pcc-card">
          <div className="pcc-card-head">
            <span className="pcc-card-title">Platform health</span>
            <Link href="/admin/settings" className="pcc-card-link">Settings <ArrowUpRight size={13} /></Link>
          </div>
          <div className="pcc-health">
            <Health label="Payment gateway" value={selectedGateway} healthy={gatewayReady} />
            <Health label="Callbacks" value={settings?.gatewayReadiness?.webhookReady ? 'Ready' : 'Check setup'} healthy={Boolean(settings?.gatewayReadiness?.webhookReady)} />
            <Health label="RADIUS" value={`${routers?.radiusFoundation.authEventsToday ?? 0} auth events`} healthy={Boolean(routers)} />
            <Health label="Support" value={`${openTickets} open tickets`} healthy={criticalTickets === 0} />
            <Health label="Audit" value={`${criticalAudits} critical`} healthy={criticalAudits === 0} />
            <Health label="Compliance" value={`${pendingCompliance} pending`} healthy={pendingCompliance === 0} />
          </div>
        </div>
      </section>

      <section className="pcc-grid">
        <div className="pcc-card">
          <div className="pcc-card-head">
            <span className="pcc-card-title">Recent platform sales</span>
            <Link href="/transactions" className="pcc-card-link">Transactions <ArrowUpRight size={13} /></Link>
          </div>
          <div className="pcc-list">
            {recentTransactions.length === 0 ? <div className="pcc-empty">No recent sales.</div> : recentTransactions.slice(0, 7).map((transaction) => (
              <Link href={`/transactions?search=${encodeURIComponent(transaction.externalReference ?? transaction.id)}`} className="pcc-row" key={transaction.id}>
                <span>
                  <strong>{transaction.tenant.name} · {transaction.package?.name ?? transaction.type}</strong>
                  <small>{transaction.channel.replace(/_/g, ' ')} · {relativeTime(transaction.createdAt)}</small>
                </span>
                <em>{formatCurrency(transaction.grossAmountUgx)}</em>
              </Link>
            ))}
          </div>
        </div>

        <div className="pcc-card">
          <div className="pcc-card-head">
            <span className="pcc-card-title">Network problems</span>
            <Link href="/admin/router" className="pcc-card-link">Network <ArrowUpRight size={13} /></Link>
          </div>
          <div className="pcc-list">
            {offlineRouters.length === 0 ? <div className="pcc-empty">All registered routers are live.</div> : offlineRouters.slice(0, 7).map((router) => (
              <Link href={`/admin/settings/routers?routerId=${encodeURIComponent(router.id)}`} className="pcc-row" key={router.id}>
                <span>
                  <strong>{router.name}</strong>
                  <small>{router.tenant.name} · {router.locationText ?? router.siteLabel ?? 'No location'}</small>
                </span>
                <em>{router.liveState?.toLowerCase() ?? 'offline'}</em>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return (
    <article className="pcc-metric">
      <div className="pcc-metric-head"><span>{label}</span><span className="pcc-metric-icon">{icon}</span></div>
      <strong className="pcc-metric-value">{value}</strong>
      <span className="pcc-metric-note">{note}</span>
    </article>
  )
}

function Health({ label, value, healthy }: { label: string; value: string; healthy: boolean }) {
  return (
    <div className="pcc-health-item">
      <span>{label}</span>
      <strong style={{ color: healthy ? '#15803d' : '#b45309' }}>{value}</strong>
    </div>
  )
}

function shortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(5)
  return date.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })
}

function relativeTime(value: string) {
  const milliseconds = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return formatDate(value)
  const minutes = Math.floor(milliseconds / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
