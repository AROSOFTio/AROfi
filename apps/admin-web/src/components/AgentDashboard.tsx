import { Banknote, Clock3, Coins, Ticket, Wallet } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import type { PackageCatalogResponse } from '@/lib/admin-types'
import AgentSellPanel from '@/components/AgentSellPanel'

type AgentDashboardResponse = {
  agent: {
    id: string
    code: string
    name: string
    email?: string | null
    phoneNumber: string
    status: string
    commissionRateBps: number
    cashLimitUgx: number
    policy: {
      cashEnabled: boolean
      mobileMoneyEnabled: boolean
      allowedPackageIds: string[]
    }
  }
  summary: {
    todaySalesUgx: number
    todayCommissionUgx: number
    totalCommissionUgx: number
    cashToRemitUgx: number
    cashRemainingBeforeLimitUgx: number | null
    availableOfflineVouchers: number
  }
  recentSales: Array<{
    id: string
    amountUgx: number
    customerReference?: string | null
    packageName: string
    voucherCode?: string | null
    paymentMethod: 'CASH' | 'MOBILE_MONEY'
    fulfillment: string
    commissionUgx: number
    createdAt: string
  }>
}

export default async function AgentDashboard() {
  const [data, packageResponse] = await Promise.all([
    fetchApi<AgentDashboardResponse>('/agent-sales/me/dashboard'),
    fetchApi<PackageCatalogResponse>('/packages'),
  ])

  const allowed = new Set(data?.agent.policy.allowedPackageIds ?? [])
  const sellPackages = (packageResponse?.items ?? [])
    .filter((pkg) => pkg.status === 'ACTIVE')
    .filter((pkg) => allowed.size === 0 || allowed.has(pkg.id))
    .map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      code: pkg.code,
      durationMinutes: pkg.durationMinutes,
      activePriceUgx: pkg.activePriceUgx,
    }))

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title">Agent Dashboard</h1>
          <p className="page-subtitle">Welcome {data?.agent.name ?? 'Agent'}. Sell internet, track your commission and know exactly how much cash you need to remit.</p>
        </div>
        <span className={`badge ${data?.agent.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
          {data?.agent.status?.toLowerCase() ?? 'agent'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 14 }} className="agent-dashboard-kpis">
        <AgentKpi icon={<Banknote size={19} />} label="Today's Sales" value={formatCurrency(data?.summary.todaySalesUgx ?? 0)} note="Cash + Mobile Money" />
        <AgentKpi icon={<Coins size={19} />} label="My Commission" value={formatCurrency(data?.summary.totalCommissionUgx ?? 0)} note={`Today ${formatCurrency(data?.summary.todayCommissionUgx ?? 0)}`} />
        <AgentKpi icon={<Wallet size={19} />} label="Cash to Remit" value={formatCurrency(data?.summary.cashToRemitUgx ?? 0)} note={data?.agent.cashLimitUgx > 0 ? `Limit ${formatCurrency(data.agent.cashLimitUgx)}` : 'No cash ceiling set'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, .65fr)', gap: 14, marginBottom: 14 }} className="agent-dashboard-sell-grid">
        <div className="card" style={{ padding: 18, margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div className="card-title">Sell Internet</div>
              <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
                Choose a package, then activate the customer's connected device now or issue a voucher for later.
              </p>
            </div>
            <span className="badge badge-info">{sellPackages.length} plans</span>
          </div>

          {sellPackages.length > 0 && data ? (
            <AgentSellPanel
              packages={sellPackages}
              policy={data.agent.policy}
              cashToRemitUgx={data.summary.cashToRemitUgx}
              cashRemainingBeforeLimitUgx={data.summary.cashRemainingBeforeLimitUgx}
              commissionRateBps={data.agent.commissionRateBps}
            />
          ) : (
            <div className="empty-state"><p>No internet package has been assigned to your agent account.</p></div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9, marginTop: 12 }}>
            <MethodInfo title="⚡ Activate Now" text="Customer connects first, requests a 6-digit agent number, then you complete the sale." />
            <MethodInfo title="🎟 Voucher for Later" text="The voucher is generated only after a completed sale and starts when redeemed." />
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="card" style={{ padding: 16, margin: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ticket size={17} /><strong>Offline Vouchers</strong></div>
            <div style={{ fontSize: 29, fontWeight: 850, marginTop: 9 }}>{data?.summary.availableOfflineVouchers ?? 0}</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, margin: '3px 0 12px' }}>Assigned printed/PDF vouchers still available in your stock.</p>
            <a href="/vouchers" className="btn btn-ghost btn-block">Open Vouchers</a>
          </div>

          <div className="card" style={{ padding: 16, margin: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Wallet size={17} /><strong>Cash Accountability</strong></div>
            <div style={{ marginTop: 10, display: 'grid', gap: 8, fontSize: 12.5 }}>
              <AccountRow label="Outstanding cash" value={formatCurrency(data?.summary.cashToRemitUgx ?? 0)} strong />
              <AccountRow label="Cash limit" value={data?.agent.cashLimitUgx ? formatCurrency(data.agent.cashLimitUgx) : 'No limit'} />
              <AccountRow label="Remaining capacity" value={data?.summary.cashRemainingBeforeLimitUgx === null ? 'No limit' : formatCurrency(data?.summary.cashRemainingBeforeLimitUgx ?? 0)} />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 11.5, lineHeight: 1.45, margin: '11px 0 0' }}>The business owner records settlement after receiving your cash. Mobile Money sales never increase this amount.</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">Sales History</span>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 3 }}>Your latest cash and Mobile Money sales.</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Package</th>
                <th>Delivery</th>
                <th>Payment</th>
                <th>Sale</th>
                <th>My Commission</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentSales ?? []).length === 0 && (
                <tr><td colSpan={7}><div className="empty-state"><p>No agent sales yet. Your first completed sale will appear here.</p></div></td></tr>
              )}
              {(data?.recentSales ?? []).map((sale) => (
                <tr key={sale.id}>
                  <td>{displayPhone(sale.customerReference)}</td>
                  <td style={{ fontWeight: 650 }}>{sale.packageName}</td>
                  <td>
                    <span className="badge badge-info">{sale.fulfillment === 'VOUCHER_LATER' ? 'Voucher later' : 'Activated now'}</span>
                    {sale.voucherCode && <div style={{ fontSize: 11, marginTop: 4, fontFamily: 'monospace' }}>{sale.voucherCode}</div>}
                  </td>
                  <td><span className={sale.paymentMethod === 'MOBILE_MONEY' ? 'badge badge-success' : 'badge badge-warning'}>{sale.paymentMethod === 'MOBILE_MONEY' ? 'Mobile Money' : 'Cash'}</span></td>
                  <td style={{ fontWeight: 700 }}>{formatCurrency(sale.amountUgx)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--success-fg)' }}>{formatCurrency(sale.commissionUgx)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(sale.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .agent-dashboard-kpis { grid-template-columns: 1fr !important; }
          .agent-dashboard-sell-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .agent-dashboard-sell-grid .card { padding: 14px !important; }
        }
      `}</style>
    </div>
  )
}

function AgentKpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <div className="card" style={{ margin: 0, padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>{icon}<span>{label}</span></div>
      <div style={{ fontSize: 23, fontWeight: 850, marginTop: 8 }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 3 }}>{note}</div>
    </div>
  )
}

function MethodInfo({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10 }}>
      <strong style={{ fontSize: 12.5 }}>{title}</strong>
      <p style={{ color: 'var(--text-muted)', fontSize: 11.5, lineHeight: 1.45, margin: '4px 0 0' }}>{text}</p>
    </div>
  )
}

function AccountRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--text-muted)' }}>{label}</span><span style={{ fontWeight: strong ? 800 : 650 }}>{value}</span></div>
}

function displayPhone(value?: string | null) {
  if (!value) return 'Customer'
  return value.startsWith('256') ? `0${value.slice(3)}` : value
}
