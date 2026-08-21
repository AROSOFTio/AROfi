import { Ticket } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import type { PackageCatalogResponse } from '@/lib/admin-types'
import AgentSalesAccountability from '@/components/AgentSalesAccountability'
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
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title">Agent Dashboard</h1>
          <p className="page-subtitle">
            Welcome {data?.agent.name ?? 'Agent'}. Sell internet, track Cash and Mobile Money separately, deposit outstanding cash, and withdraw eligible Mobile Money commission.
          </p>
        </div>
        <span className={`badge ${data?.agent.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
          {data?.agent.status?.toLowerCase() ?? 'agent'}
        </span>
      </div>

      <AgentSalesAccountability />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(260px, .55fr)', gap: 14, margin: '14px 0' }} className="agent-dashboard-sell-grid">
        <div className="card" style={{ padding: 18, margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div className="card-title">Sell Internet</div>
              <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
                Choose an allowed package, then activate the customer now or create one voucher only after a completed sale.
              </p>
            </div>
            <span className="badge badge-info">{sellPackages.length} packages</span>
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
            <div className="empty-state"><p>No internet package has been assigned to your Agent account.</p></div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9, marginTop: 12 }}>
            <MethodInfo title="Activate Now" text="The customer connects first and gives you the 6-digit activation number shown on their device." />
            <MethodInfo title="Voucher for Later" text="A single voucher is created only after the Cash or Mobile Money sale completes. It starts when redeemed." />
          </div>
        </div>

        <div className="card" style={{ padding: 16, margin: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ticket size={17} /><strong>Assigned Offline Vouchers</strong></div>
          <div style={{ fontSize: 29, fontWeight: 850, marginTop: 9 }}>{data?.summary.availableOfflineVouchers ?? 0}</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, margin: '3px 0 12px' }}>
            Printed or PDF vouchers assigned to you by the business owner for offline selling. Agents cannot create templates or generate voucher batches.
          </p>
          <a href="/vouchers" className="btn btn-ghost btn-block">View Assigned Stock</a>
        </div>
      </div>

      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">Sales History</span>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 3 }}>Your latest Cash and Mobile Money sales with the commission earned on each sale.</div>
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
                <th>Commission</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentSales ?? []).length === 0 && (
                <tr><td colSpan={7}><div className="empty-state"><p>No Agent sales yet. Your first completed sale will appear here.</p></div></td></tr>
              )}
              {(data?.recentSales ?? []).map((sale) => (
                <tr key={sale.id}>
                  <td>{displayPhone(sale.customerReference)}</td>
                  <td style={{ fontWeight: 650 }}>{sale.packageName}</td>
                  <td>
                    <span className="badge badge-info">{sale.fulfillment === 'VOUCHER_LATER' ? 'Voucher for later' : 'Activated now'}</span>
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
          .agent-dashboard-sell-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .agent-dashboard-sell-grid .card { padding: 14px !important; }
        }
      `}</style>
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

function displayPhone(value?: string | null) {
  if (!value) return 'Customer'
  return value.startsWith('256') ? `0${value.slice(3)}` : value
}
