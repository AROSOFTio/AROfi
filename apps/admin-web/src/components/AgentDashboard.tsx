import Link from 'next/link'
import { Banknote, Coins, History, Ticket, TrendingUp, Wifi } from 'lucide-react'
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

function isTrialPackage(pkg: PackageCatalogResponse['items'][number]) {
  const haystack = `${pkg.name} ${pkg.code} ${pkg.description ?? ''}`.toLowerCase()
  return Boolean(pkg.isTrialEnabled) || (pkg.activePriceUgx ?? 0) <= 0 || haystack.includes('trial')
}

export default async function AgentDashboard({ openSeller = false }: { openSeller?: boolean }) {
  const [data, packageResponse] = await Promise.all([
    fetchApi<AgentDashboardResponse>('/agent-sales/me/dashboard'),
    fetchApi<PackageCatalogResponse>('/packages'),
  ])

  const allowed = new Set(data?.agent.policy.allowedPackageIds ?? [])
  const sellPackages = (packageResponse?.items ?? [])
    .filter((pkg) => pkg.status === 'ACTIVE' && !isTrialPackage(pkg))
    .filter((pkg) => allowed.size === 0 || allowed.has(pkg.id))
    .map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      code: pkg.code,
      durationMinutes: pkg.durationMinutes,
      activePriceUgx: pkg.activePriceUgx,
    }))

  const recentSales = (data?.recentSales ?? []).slice(0, 5)

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 16 }}>
      <section
        className="card"
        style={{
          margin: 0,
          padding: '22px 22px 20px',
          border: '1px solid var(--brand)',
          background: 'var(--bg-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>AGENT</div>
            <h1 className="page-title" style={{ marginTop: 4 }}>Hi {firstName(data?.agent.name)} 👋</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>Sell WiFi access, give the customer their code, and keep moving.</p>
          </div>
          <span className={`badge ${data?.agent.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
            {data?.agent.status?.toLowerCase() ?? 'agent'}
          </span>
        </div>

        <div style={{ marginTop: 18 }}>
          {sellPackages.length > 0 && data ? (
            <AgentSellPanel
              packages={sellPackages}
              policy={data.agent.policy}
              cashToRemitUgx={data.summary.cashToRemitUgx}
              cashRemainingBeforeLimitUgx={data.summary.cashRemainingBeforeLimitUgx}
              commissionRateBps={data.agent.commissionRateBps}
              defaultOpen={openSeller}
            />
          ) : (
            <div className="empty-state"><p>No internet package has been assigned to your Agent account.</p></div>
          )}
        </div>
      </section>

      <section className="agent-kpi-grid">
        <Kpi icon={<TrendingUp size={20} />} label="Sales today" value={formatCurrency(data?.summary.todaySalesUgx ?? 0)} />
        <Kpi icon={<Coins size={20} />} label="Commission today" value={formatCurrency(data?.summary.todayCommissionUgx ?? 0)} />
        <Kpi icon={<Banknote size={20} />} label="Cash to remit" value={formatCurrency(data?.summary.cashToRemitUgx ?? 0)} />
        <Kpi icon={<Ticket size={20} />} label="Offline vouchers" value={`${data?.summary.availableOfflineVouchers ?? 0}`} />
      </section>

      <section className="agent-quick-grid">
        <Link href="/agent/sales" className="card agent-quick-card">
          <History size={21} />
          <span><strong>My sales</strong><small>See codes and recent transactions</small></span>
        </Link>
        <Link href="/vouchers" className="card agent-quick-card">
          <Ticket size={21} />
          <span><strong>My vouchers</strong><small>View assigned offline stock</small></span>
        </Link>
        <Link href="/agent/money" className="card agent-quick-card">
          <Coins size={21} />
          <span><strong>Money & commission</strong><small>Deposit cash or withdraw commission</small></span>
        </Link>
      </section>

      <section className="card" style={{ margin: 0 }}>
        <div className="card-header" style={{ alignItems: 'center' }}>
          <span className="card-title">Latest sales</span>
          <Link href="/agent/sales" style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 800 }}>View all</Link>
        </div>
        {recentSales.length === 0 ? (
          <div className="empty-state"><p>No sales yet. Tap Sell WiFi / Internet to make your first sale.</p></div>
        ) : (
          <div className="agent-recent-sales">
            {recentSales.map((sale) => (
              <div key={sale.id} className="agent-sale-row">
                <div className="agent-sale-icon"><Wifi size={18} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{sale.packageName}</strong>
                  <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11.5, marginTop: 2 }}>
                    {sale.voucherCode ? `Code ${sale.voucherCode}` : sale.fulfillment === 'ACTIVATE_NOW' ? 'Device activated' : 'Access sold'} · {formatDate(sale.createdAt)}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ display: 'block' }}>{formatCurrency(sale.amountUgx)}</strong>
                  <span style={{ color: 'var(--success-fg)', fontSize: 11 }}>+{formatCurrency(sale.commissionUgx)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <style>{`
        .agent-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .agent-kpi{margin:0;padding:15px;display:flex;gap:11px;align-items:center;min-width:0}
        .agent-kpi-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);flex:0 0 auto}
        .agent-kpi-label{font-size:11px;color:var(--text-muted);font-weight:700}
        .agent-kpi-value{margin-top:3px;font-size:18px;font-weight:850;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .agent-quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
        .agent-quick-card{margin:0;padding:15px;display:flex;gap:11px;align-items:center;text-decoration:none;color:var(--text-primary);transition:.15s ease}
        .agent-quick-card:hover{border-color:var(--brand);transform:translateY(-1px)}
        .agent-quick-card svg{color:var(--brand);flex:0 0 auto}
        .agent-quick-card strong{display:block;font-size:13px}
        .agent-quick-card small{display:block;margin-top:3px;color:var(--text-muted);font-size:11px;line-height:1.3}
        .agent-recent-sales{display:grid}
        .agent-sale-row{display:flex;align-items:center;gap:11px;padding:13px 16px;border-top:1px solid var(--border)}
        .agent-sale-row:first-child{border-top:0}
        .agent-sale-icon{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);flex:0 0 auto}
        @media(max-width:820px){.agent-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.agent-quick-grid{grid-template-columns:1fr}}
        @media(max-width:480px){.agent-kpi-grid{gap:8px}.agent-kpi{padding:12px 10px;gap:8px}.agent-kpi-icon{width:34px;height:34px}.agent-kpi-value{font-size:15px}.agent-sale-row{padding:12px 10px}}
      `}</style>
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card agent-kpi">
      <div className="agent-kpi-icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="agent-kpi-label">{label}</div>
        <div className="agent-kpi-value">{value}</div>
      </div>
    </div>
  )
}

function firstName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || 'Agent'
}
