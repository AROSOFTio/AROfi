import type {
  AdminSessionResponse,
  AgentsOverviewResponse,
  BillingOverviewResponse,
  PackageCatalogResponse,
  RouterOverviewResponse,
  SessionOverviewResponse,
  VouchersOverviewResponse,
} from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatMegabytes } from '@/lib/format'
import ComplianceBanner from '@/components/ComplianceBanner'
import VendorOnboardingTour from '@/components/VendorOnboardingTour'
import { DashboardAutoRefresh } from '@/components/DashboardAutoRefresh'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { BusinessDailyEarningsChart, BusinessSalesChannelChart } from '@/components/charts/BusinessDashboardCharts'
import {
  Activity,
  ArrowUpRight,
  Banknote,
  Boxes,
  Clock3,
  Cpu,
  Database,
  Router,
  Star,
  Store,
  Ticket,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import styles from './VendorBusinessDashboard.module.css'

type DashboardSearchParams = { range?: string; from?: string; to?: string }

type AgentVoucherMetricsResponse = {
  summary: {
    agentsWithStock: number
    totalAssigned: number
    unsold: number
    soldAwaitingUse: number
    redeemed: number
    expired: number
    voided: number
    unsoldValueUgx: number
    recordedSales: number
    recordedSalesUgx: number
  }
}

export default async function VendorBusinessDashboard({
  session,
  searchParams,
}: {
  session: AdminSessionResponse | null
  searchParams?: DashboardSearchParams
}) {
  const range = resolveDashboardRange(searchParams)
  const query = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() }).toString()

  const [billing, routers, sessions, vouchers, payoutProfile, packages, compliance, agents, agentVoucherMetrics] = await Promise.all([
    fetchApi<BillingOverviewResponse>(`/billing/overview?${query}`),
    fetchApi<RouterOverviewResponse>('/routers/overview'),
    fetchApi<SessionOverviewResponse>('/sessions/overview'),
    fetchApi<VouchersOverviewResponse>('/vouchers/overview'),
    fetchApi<any>('/wallets/payouts/profile/me'),
    fetchApi<PackageCatalogResponse>('/packages'),
    fetchApi<{ status: string }>('/compliance/me').catch(() => null),
    fetchApi<AgentsOverviewResponse>('/agents/overview').catch(() => null),
    fetchApi<AgentVoucherMetricsResponse>('/agents/voucher-metrics').catch(() => null),
  ])

  const recentTransactions = billing?.recentTransactions ?? []
  const routerItems = routers?.routers ?? []
  const activeSessions = sessions?.activeSessions ?? []
  const packageItems = packages?.items ?? []
  const voucherBatches = vouchers?.batches ?? []
  const initialRouter = routerItems[0] ?? null

  const grossSales = billing?.summary.grossSalesUgx ?? billing?.summary.totalSalesUgx ?? 0
  const netEarnings = billing?.summary.netEarningsUgx ?? billing?.summary.vendorNetUgx ?? 0
  const activeCustomers = billing?.summary.activeUsers ?? sessions?.summary.activeSessions ?? 0
  const totalRouters = routers?.summary.totalRouters ?? routerItems.length
  const liveRouters = routers?.summary.liveRouters ?? routerItems.filter((router) => router.liveState === 'LIVE').length
  const staleRouters = routers?.summary.staleRouters ?? routerItems.filter((router) => router.liveState === 'STALE').length
  const onlineRouters = liveRouters + staleRouters
  const dataUsedTodayMb = sessions?.summary.dataUsedTodayMb ?? activeSessions.reduce((total, item) => total + (item.dataUsedMb ?? 0), 0)
  const averageLatency = routers?.summary.averageLatencyMs ?? 0

  const verifiedNumbers = payoutProfile?.numbers?.filter((item: any) => item.status === 'VERIFIED') ?? []
  const availableUgx = payoutProfile?.wallet?.balanceUgx ?? billing?.summary.withdrawableBalanceUgx ?? billing?.summary.walletBalanceUgx ?? 0
  const recentWithdrawals = payoutProfile?.recentWithdrawals ?? []

  const agentItems = agents?.agents ?? []
  const activeAgents = agents?.summary.activeAgents ?? agentItems.filter((agent) => agent.status === 'ACTIVE').length
  const agentSalesUgx = agentVoucherMetrics?.summary.recordedSalesUgx ?? agents?.summary.voucherSalesUgx ?? agentItems.reduce((sum, agent) => sum + (agent.voucherSalesUgx ?? 0), 0)
  const cashDueUgx = agents?.summary.cashToCollectUgx ?? agentItems.reduce((sum, agent) => sum + (agent.cashToCollectUgx ?? 0), 0)
  const availableVoucherStock = agentVoucherMetrics?.summary.unsold ?? vouchers?.summary.activeUnused ?? 0
  const availableVoucherStockValue = agentVoucherMetrics?.summary.unsoldValueUgx ?? 0
  const topAgent = [...agentItems].sort((a, b) => (b.voucherSalesUgx ?? b.lifetimeSalesUgx) - (a.voucherSalesUgx ?? a.lifetimeSalesUgx))[0]
  const topAgentSales = topAgent ? (topAgent.voucherSalesUgx ?? topAgent.lifetimeSalesUgx) : 0

  const recentAgentSales = recentTransactions.filter((item) => item.agent).reduce((sum, item) => sum + Math.max(item.grossAmountUgx ?? 0, 0), 0)
  const recentDirectVoucherSales = recentTransactions.filter((item) => item.voucher && !item.agent).reduce((sum, item) => sum + Math.max(item.grossAmountUgx ?? 0, 0), 0)
  const recentMobileMoneySales = recentTransactions.filter((item) => item.channel === 'MOBILE_MONEY').reduce((sum, item) => sum + Math.max(item.grossAmountUgx ?? 0, 0), 0)
  const recentOtherSales = recentTransactions.filter((item) => item.channel !== 'MOBILE_MONEY' && !item.voucher && !item.agent).reduce((sum, item) => sum + Math.max(item.grossAmountUgx ?? 0, 0), 0)

  const dateRange = `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`
  const routerHealthLabel = totalRouters > 0 ? `${onlineRouters}/${totalRouters} available` : 'No routers yet'

  return (
    <div className={styles.dashboard}>
      <DashboardAutoRefresh />
      {session && (
        <VendorOnboardingTour
          session={session}
          initialRouter={initialRouter}
          initialHasPackage={packageItems.length > 0}
          initialHasVouchers={voucherBatches.length > 0}
        />
      )}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Overview of your business performance</p>
        </div>
        <div className={styles.headerTools}>
          <DateRangeFilter from={range.from} to={range.to} />
          <a href="/agents" className={styles.quickLink}><Zap size={14} /> Quick</a>
        </div>
      </div>

      <ComplianceBanner status={(compliance?.status ?? 'NOT_SUBMITTED') as any} tenantId={session?.user.tenantId} />

      <div className={styles.shell}>
        <main className={styles.main}>
          <section className={styles.kpis} aria-label="Business summary">
            <Kpi
              title="Gross Sales"
              value={formatCurrency(grossSales)}
              note={dateRange}
              icon={<Banknote size={17} />}
              footLeft={['Today', formatCurrency(billing?.summary.todayGrossSalesUgx ?? 0)]}
              footRight={['This month', formatCurrency(billing?.summary.monthGrossSalesUgx ?? 0)]}
            />
            <Kpi
              title="Net Earnings"
              value={formatCurrency(netEarnings)}
              note={dateRange}
              icon={<Wallet size={17} />}
              iconTone="green"
              footLeft={['Today', formatCurrency(billing?.summary.todayNetEarningsUgx ?? 0)]}
              footRight={['This month', formatCurrency(billing?.summary.monthNetEarningsUgx ?? 0)]}
            />
            <Kpi
              title="Active Customers"
              value={`${activeCustomers}`}
              note="Customers online now"
              icon={<Users size={17} />}
              iconTone="purple"
              footLeft={['Sessions today', `${sessions?.summary.totalSessionsToday ?? 0}`]}
              footRight={['Data today', formatMegabytes(dataUsedTodayMb)]}
            />
            <Kpi
              title="Routers Online"
              value={`${onlineRouters}`}
              note={routerHealthLabel}
              icon={<Router size={17} />}
              footLeft={['Total routers', `${totalRouters}`]}
              footRight={['Live now', `${liveRouters}`]}
            />
          </section>

          <section className={styles.twoCol}>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <div className={styles.panelTitle}>Revenue Trend</div>
                  <div className={styles.panelSubtitle}>{dateRange}</div>
                </div>
                <a href={`/reports?${query}`} className={styles.panelLink}>Open report →</a>
              </div>
              <RevenueChart data={billing?.chart ?? []} />
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <div className={styles.panelTitle}>Sales by Channel</div>
                  <div className={styles.panelSubtitle}>Recent transaction mix</div>
                </div>
              </div>
              <BusinessSalesChannelChart channels={[
                { name: 'Mobile Money', value: recentMobileMoneySales, color: '#2563eb' },
                { name: 'Voucher', value: recentDirectVoucherSales, color: '#10b981' },
                { name: 'Agent Sales', value: recentAgentSales, color: '#8b5cf6' },
                { name: 'Other', value: recentOtherSales, color: '#f59e0b' },
              ]} />
            </div>
          </section>

          <section className={styles.twoCol}>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <div className={styles.panelTitle}>Daily Earnings &amp; Voucher Sales</div>
                  <div className={styles.panelSubtitle}>Per-day business breakdown</div>
                </div>
              </div>
              <BusinessDailyEarningsChart data={billing?.chart ?? []} />
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <div className={styles.panelTitle}>System Insights</div>
                  <div className={styles.panelSubtitle}>Live network overview</div>
                </div>
                <a href="/admin/router" className={styles.panelLink}>Network health →</a>
              </div>
              <div className={styles.insightGrid}>
                <Insight icon={<Users size={16} />} value={`${activeCustomers}`} label="Active users" />
                <Insight icon={<Database size={16} />} value={formatMegabytes(dataUsedTodayMb)} label="Data used today" />
                <Insight icon={<Activity size={16} />} value={`${onlineRouters}/${totalRouters}`} label="Routers available" />
                <Insight icon={<Cpu size={16} />} value={averageLatency > 0 ? `${Math.round(averageLatency)} ms` : '—'} label="Average latency" />
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.agentPanel}`}>
            <div className={styles.agentHeader}>
              <div className={styles.agentHeaderTitle}>Voucher &amp; Agent Performance <span className={styles.live}>Live</span></div>
              <a href="/agents" className={styles.panelLink}>View full agent report →</a>
            </div>
            <div className={styles.agentStats}>
              <AgentStat icon={<Ticket size={15} />} label="Voucher Sales" value={formatCurrency(vouchers?.summary.totalVoucherSalesUgx ?? billing?.summary.voucherGrossUgx ?? 0)} note={`${vouchers?.summary.redeemed ?? 0} redeemed`} />
              <AgentStat icon={<Store size={15} />} label="Agent Sales" value={formatCurrency(agentSalesUgx)} note={`${activeAgents} active agent${activeAgents === 1 ? '' : 's'}`} />
              <AgentStat icon={<Banknote size={15} />} label="Cash Due" value={formatCurrency(cashDueUgx)} note="Unsettled agent accountability" />
              <AgentStat icon={<Boxes size={15} />} label="Available Stock" value={`${availableVoucherStock}`} note={availableVoucherStockValue > 0 ? formatCurrency(availableVoucherStockValue) : 'Unused vouchers'} />
              <AgentStat icon={<Star size={15} />} label="Top Agent" value={topAgent?.name ?? '—'} note={topAgent ? `${formatCurrency(topAgentSales)} sold` : 'No agent sales yet'} />
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <div className={styles.panelTitle}>Recent Sales</div>
                <div className={styles.panelSubtitle}>Latest business transactions</div>
              </div>
              <a href={`/sales?${query}`} className={styles.panelLink}>View all sales →</a>
            </div>
            <div className={styles.salesWrap}>
              {recentTransactions.length === 0 ? (
                <div className={styles.empty}>No recent sales yet.</div>
              ) : (
                <table className={styles.salesTable}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Customer / Agent</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.slice(0, 6).map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{formatDate(transaction.createdAt)}</td>
                        <td><span className={styles.saleBadge}>{transaction.agent ? 'Agent' : transaction.voucher ? 'Voucher' : transaction.channel?.replaceAll('_', ' ') || 'Sale'}</span></td>
                        <td><strong>{transaction.agent?.name ?? transaction.customerReference ?? transaction.payment?.phoneNumber ?? 'Customer'}</strong></td>
                        <td>{transaction.package?.name ?? transaction.voucher?.code ?? transaction.channel?.replaceAll('_', ' ') ?? 'Internet sale'}</td>
                        <td><strong>{transaction.grossAmountUgx > 0 ? formatCurrency(transaction.grossAmountUgx) : 'Redeemed'}</strong></td>
                        <td><span className={styles.status}>{transaction.status?.toLowerCase().replaceAll('_', ' ') || 'completed'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </main>

        <aside className={styles.side}>
          <section className={styles.wallet}>
            <div className={styles.walletHead}><Wallet size={16} /> AROFi Wallet</div>
            <div className={styles.walletBlue}>
              <div><span>Available Balance</span><strong>{formatCurrency(availableUgx)}</strong></div>
            </div>
            <div className={styles.walletMeta}>
              <div><span>Owner</span><strong>{session?.user.tenantName ?? 'Business'}</strong></div>
              <div><span>Payout</span><strong>{verifiedNumbers.length ? `${verifiedNumbers.length} registered` : 'Not set'}</strong></div>
            </div>
            <a href="/earnings" className={styles.walletButton}>Withdraw Funds <ArrowUpRight size={14} /></a>
          </section>

          <section className={styles.withdrawals}>
            <div className={styles.panelHead}>
              <div>
                <div className={styles.panelTitle}>Recent Withdrawals</div>
                <div className={styles.panelSubtitle}>Latest payout activity</div>
              </div>
              <a href="/earnings" className={styles.panelLink}>View all</a>
            </div>
            <div className={styles.withdrawList}>
              {recentWithdrawals.length === 0 ? (
                <div className={styles.empty}>No payout history yet.</div>
              ) : recentWithdrawals.slice(0, 5).map((withdrawal: any) => (
                <div className={styles.withdrawItem} key={withdrawal.id}>
                  <div><strong>{formatCurrency(withdrawal.amountUgx)}</strong><small>{formatDate(withdrawal.createdAt)}</small></div>
                  <span className={styles.status}>{String(withdrawal.status ?? 'pending').toLowerCase().replaceAll('_', ' ')}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Kpi({
  title,
  value,
  note,
  icon,
  iconTone,
  footLeft,
  footRight,
}: {
  title: string
  value: string
  note: string
  icon: React.ReactNode
  iconTone?: 'green' | 'purple'
  footLeft: [string, string]
  footRight: [string, string]
}) {
  const tone = iconTone === 'green' ? styles.iconGreen : iconTone === 'purple' ? styles.iconPurple : ''
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiHead}><span className={`${styles.icon} ${tone}`}>{icon}</span>{title}</div>
      <strong className={styles.kpiValue}>{value}</strong>
      <div className={styles.kpiNote}>{note}</div>
      <div className={styles.kpiFoot}>
        <span>{footLeft[0]}<strong>{footLeft[1]}</strong></span>
        <span>{footRight[0]}<strong>{footRight[1]}</strong></span>
      </div>
    </div>
  )
}

function Insight({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className={styles.insight}>{icon}<div><strong>{value}</strong><span>{label}</span></div></div>
}

function AgentStat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <div className={styles.agentStat}>
      <div className={styles.agentLabel}>{icon}{label}</div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  )
}

function DateRangeFilter({ from, to }: { from: Date; to: Date }) {
  return (
    <form className={styles.dateFilter} action="/dashboard" method="get">
      <input type="hidden" name="range" value="custom" />
      <input className={styles.dateInput} type="date" name="from" defaultValue={toInputDate(from)} aria-label="From date" />
      <span className={styles.dateArrow}>→</span>
      <input className={styles.dateInput} type="date" name="to" defaultValue={toInputDate(to)} aria-label="To date" />
      <button className={styles.filterButton} type="submit">Filter</button>
    </form>
  )
}

function resolveDashboardRange(searchParams?: DashboardSearchParams) {
  const now = new Date()
  const key = searchParams?.range ?? 'this-month'
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (key === 'today') return { key, from: startOfToday, to: now }
  if (key === 'last-7') {
    const from = new Date(startOfToday)
    from.setDate(from.getDate() - 6)
    return { key, from, to: now }
  }
  if (key === 'custom' && searchParams?.from && searchParams?.to) {
    const from = new Date(searchParams.from)
    const to = new Date(searchParams.to)
    if (Number.isFinite(from.getTime()) && Number.isFinite(to.getTime())) {
      to.setHours(23, 59, 59, 999)
      return { key, from, to }
    }
  }

  return { key: 'this-month', from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toInputDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
