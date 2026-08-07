'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, CircleAlert, Clock3, Download, MapPin, PackageOpen, Ticket, Users } from 'lucide-react'
import Modal from './Modal'
import { clientFetchApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'
import { useRealtimeEvents } from '@/lib/realtime'

type PeriodKey = 'today' | '7d' | '30d'

type VoucherSale = {
  id: string
  createdAt: string
  amountUgx: number
  netUgx: number
  voucherCode: string | null
  batchId: string | null
  batchNumber: string | null
  packageId: string | null
  packageName: string
  agentId: string | null
  agentName: string
  agentCode: string
  location: string
  tenantName: string
}

type VoucherAgent = {
  agentId: string
  code: string
  name: string
  territory: string
  stock: number
  stockValueUgx: number
  sales: number
  grossSalesUgx: number
  platformFeesUgx: number
  commissionUgx: number
  settledGrossUgx: number
  cashDueUgx: number
  expired: number
  voided: number
  expiringSoon: number
  lastSaleAt: string | null
}

type VoucherLocation = {
  location: string
  agents: number
  stock: number
  sales: number
  grossSalesUgx: number
  cashDueUgx: number
}

type VoucherDashboardData = {
  generatedAt: string
  range: { from: string; to: string; previousFrom: string; previousTo: string }
  summary: {
    sales: number
    grossSalesUgx: number
    netSalesUgx: number
    platformFeesUgx: number
    agentSalesUgx: number
    mainSalesUgx: number
    agentSales: number
    mainSales: number
    cashDueUgx: number
    stock: number
    stockValueUgx: number
    agentsTracked: number
    locationsTracked: number
    changePercent: number
  }
  alerts: {
    expiringSoon: number
    expired: number
    voided: number
    lowStockAgents: number
    dormantAgents: number
    overdueSettlements: number
  }
  recentSales: VoucherSale[]
  agents: VoucherAgent[]
  locations: VoucherLocation[]
}

const periods: Array<{ key: PeriodKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
]

export default function VoucherSalesDashboard() {
  const [period, setPeriod] = useState<PeriodKey>('today')
  const [data, setData] = useState<VoucherDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [streamState, setStreamState] = useState<'live' | 'reconnecting'>('reconnecting')
  const [selectedAgent, setSelectedAgent] = useState<VoucherAgent | null>(null)
  const requestInFlight = useRef(false)
  const lastEventAt = useRef<number>(0)

  const query = useMemo(() => {
    const { from, to } = periodRange(period)
    return new URLSearchParams({ from: from.toISOString(), to: to.toISOString() }).toString()
  }, [period])

  const load = useCallback(async (quiet = false) => {
    if (requestInFlight.current) return
    try {
      requestInFlight.current = true
      if (!quiet) setLoading(true)
      const next = await clientFetchApi<VoucherDashboardData>(`/voucher-dashboard?${query}`)
      setData(next)
      setStreamState('live')
    } catch {
      setStreamState('reconnecting')
    } finally {
      requestInFlight.current = false
      if (!quiet) setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void load(false)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [load])

  useRealtimeEvents((event) => {
    lastEventAt.current = Date.now()
    setStreamState('live')
    window.setTimeout(() => void load(true), 120)
  }, ['voucher.redeemed'])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lastEventAt.current > 0 && Date.now() - lastEventAt.current > 30000) {
        // A quiet sales period is still healthy; successful polling keeps this green.
        if (!data) setStreamState('reconnecting')
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [data])

  const summary = data?.summary
  const alerts = data?.alerts
  const exportExcel = `/api/voucher-dashboard/export.xlsx?${query}`
  const exportPdf = `/api/voucher-dashboard/export.pdf?${query}`
  const fullReport = `/agents/reports?${query}`

  return (
    <section className="voucher-live-dashboard" aria-label="Voucher sales and stock">
      <style>{`
        .voucher-live-dashboard{margin:16px 0}
        .vld-shell{border:1px solid var(--border);border-radius:12px;background:var(--bg-card);overflow:hidden}
        .vld-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-bottom:1px solid var(--border-soft)}
        .vld-title-row{display:flex;align-items:center;gap:9px;min-width:0}
        .vld-title{font-size:16px;font-weight:650;color:var(--text-primary);white-space:nowrap}
        .vld-live{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:var(--success-fg)}
        .vld-live::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
        .vld-live.reconnecting{color:var(--warn-fg)}
        .vld-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .vld-periods{display:flex;gap:3px;padding:3px;border:1px solid var(--border);border-radius:9px;background:var(--bg-hover)}
        .vld-period{border:0;background:transparent;border-radius:6px;padding:6px 10px;color:var(--text-muted);font:600 12px var(--ui-font);cursor:pointer}
        .vld-period.active{background:var(--bg-card);color:var(--brand);box-shadow:0 1px 3px rgba(15,23,42,.08)}
        .vld-export{display:flex;gap:6px}
        .vld-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--border-soft)}
        .vld-kpi{padding:14px 16px;border-right:1px solid var(--border-soft);min-width:0}
        .vld-kpi:last-child{border-right:0}
        .vld-kpi-label{display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:11.5px;margin-bottom:6px}
        .vld-kpi-value{font-size:20px;line-height:1.2;font-weight:680;color:var(--text-primary);letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .vld-kpi-meta{margin-top:4px;font-size:11.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .vld-kpi-change{color:var(--success-fg);font-weight:650}
        .vld-kpi-change.down{color:var(--danger-fg)}
        .vld-main{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(250px,.85fr);border-bottom:1px solid var(--border-soft)}
        .vld-panel{padding:14px 16px;min-width:0}
        .vld-panel+.vld-panel{border-left:1px solid var(--border-soft)}
        .vld-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
        .vld-panel-title{font-size:13.5px;font-weight:650;color:var(--text-primary)}
        .vld-panel-link{font-size:11.5px;color:var(--brand);text-decoration:none;font-weight:600}
        .vld-sales{display:grid;gap:2px;max-height:276px;overflow:auto}
        .vld-sale{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 6px;border-radius:8px;text-decoration:none;color:inherit}
        .vld-sale:hover{background:var(--bg-hover)}
        .vld-sale-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--green-light);color:var(--brand)}
        .vld-sale-main{min-width:0}
        .vld-sale-main strong{display:block;font-size:12.8px;font-weight:620;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .vld-sale-main span{display:block;margin-top:2px;font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .vld-sale-amount{text-align:right;white-space:nowrap}
        .vld-sale-amount strong{display:block;font-size:12.8px;color:var(--text-primary)}
        .vld-sale-amount span{display:block;margin-top:2px;font-size:10.5px;color:var(--text-muted)}
        .vld-empty{padding:30px 10px;text-align:center;color:var(--text-muted);font-size:12.5px}
        .vld-alerts{display:grid;gap:7px}
        .vld-alert{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border:1px solid var(--border-soft);border-radius:8px;text-decoration:none;color:var(--text-2);font-size:12px}
        .vld-alert:hover{border-color:var(--border);background:var(--bg-hover)}
        .vld-alert span{display:flex;align-items:center;gap:7px}
        .vld-alert strong{font-size:13px;color:var(--text-primary)}
        .vld-rankings{display:grid;grid-template-columns:1fr 1fr}
        .vld-ranking{padding:14px 16px;min-width:0}
        .vld-ranking+.vld-ranking{border-left:1px solid var(--border-soft)}
        .vld-table{display:grid;gap:2px;margin-top:8px}
        .vld-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:14px;padding:8px 6px;border-radius:8px;border:0;background:transparent;text-align:left;font:inherit;cursor:pointer;text-decoration:none;color:inherit}
        .vld-row:hover{background:var(--bg-hover)}
        .vld-row-main{display:flex;align-items:center;gap:9px;min-width:0}
        .vld-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--green-light);color:var(--brand);font-size:10.5px;font-weight:700;flex:0 0 auto}
        .vld-row-main div{min-width:0}.vld-row-main strong{display:block;font-size:12.5px;font-weight:620;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vld-row-main span{display:block;font-size:10.5px;color:var(--text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .vld-row-number{text-align:right}.vld-row-number strong{display:block;font-size:12px;color:var(--text-primary)}.vld-row-number span{display:block;font-size:10px;color:var(--text-muted);margin-top:1px}
        .vld-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 16px;background:var(--bg-hover);font-size:11px;color:var(--text-muted)}
        .vld-footer-actions{display:flex;gap:9px;align-items:center}.vld-footer a{color:var(--brand);font-weight:650;text-decoration:none}
        .vld-agent-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
        .vld-agent-stat{padding:11px;border:1px solid var(--border);border-radius:8px;background:var(--bg-hover)}
        .vld-agent-stat span{display:block;font-size:10.5px;color:var(--text-muted);margin-bottom:3px}.vld-agent-stat strong{font-size:14px;color:var(--text-primary)}
        @media(max-width:980px){.vld-kpis{grid-template-columns:1fr 1fr}.vld-kpi:nth-child(2){border-right:0}.vld-kpi:nth-child(-n+2){border-bottom:1px solid var(--border-soft)}.vld-main{grid-template-columns:1fr}.vld-panel+.vld-panel{border-left:0;border-top:1px solid var(--border-soft)}}
        @media(max-width:720px){.vld-head{align-items:flex-start;flex-direction:column}.vld-controls{width:100%;justify-content:space-between}.vld-export{display:none}.vld-rankings{grid-template-columns:1fr}.vld-ranking+.vld-ranking{border-left:0;border-top:1px solid var(--border-soft)}.vld-agent-grid{grid-template-columns:1fr 1fr}.vld-sale{grid-template-columns:34px minmax(0,1fr) auto}.vld-footer{align-items:flex-start;flex-direction:column}}
        @media(max-width:460px){.voucher-live-dashboard{margin:12px 0}.vld-shell{border-radius:10px}.vld-head,.vld-panel,.vld-ranking{padding:12px}.vld-title{font-size:15px}.vld-period{padding:6px 8px}.vld-kpi{padding:12px}.vld-kpi-value{font-size:17px}.vld-row{grid-template-columns:minmax(0,1fr) auto}.vld-row-number:last-child{display:none}.vld-agent-grid{grid-template-columns:1fr}.vld-footer{padding:10px 12px}}
      `}</style>

      <div className="vld-shell">
        <header className="vld-head">
          <div className="vld-title-row">
            <span className="vld-title">Voucher Sales & Stock</span>
            <span className={`vld-live ${streamState === 'reconnecting' ? 'reconnecting' : ''}`}>
              {streamState === 'live' ? 'Live' : 'Reconnecting'}
            </span>
          </div>
          <div className="vld-controls">
            <div className="vld-periods" aria-label="Voucher report period">
              {periods.map((item) => (
                <button type="button" key={item.key} className={`vld-period ${period === item.key ? 'active' : ''}`} onClick={() => setPeriod(item.key)}>{item.label}</button>
              ))}
            </div>
            <div className="vld-export">
              <a href={exportExcel} className="btn btn-ghost btn-sm"><Download size={13} /> Excel</a>
              <a href={exportPdf} className="btn btn-ghost btn-sm"><Download size={13} /> PDF</a>
            </div>
          </div>
        </header>

        <div className="vld-kpis">
          <Kpi icon={<Ticket size={14} />} label="Voucher sales" value={formatCurrency(summary?.grossSalesUgx ?? 0)} meta={`${summary?.sales ?? 0} redeemed`} change={summary?.changePercent} />
          <Kpi icon={<Users size={14} />} label="Agent sales" value={formatCurrency(summary?.agentSalesUgx ?? 0)} meta={`${summary?.agentSales ?? 0} redeemed · ${summary?.agentsTracked ?? 0} agents`} />
          <Kpi icon={<Clock3 size={14} />} label="Cash due" value={formatCurrency(summary?.cashDueUgx ?? 0)} meta="Unsettled agent accountability" />
          <Kpi icon={<PackageOpen size={14} />} label="Available stock" value={(summary?.stock ?? 0).toLocaleString()} meta={formatCurrency(summary?.stockValueUgx ?? 0)} />
        </div>

        <div className="vld-main">
          <section className="vld-panel">
            <div className="vld-panel-head"><span className="vld-panel-title">Live voucher sales</span><a className="vld-panel-link" href={fullReport}>Full report</a></div>
            <div className="vld-sales">
              {loading && !data && <div className="vld-empty">Loading sales…</div>}
              {!loading && (data?.recentSales.length ?? 0) === 0 && <div className="vld-empty">No voucher sales in this period.</div>}
              {data?.recentSales.map((sale) => (
                <a href={`/agents/reports?${query}${sale.agentId ? `&agentId=${encodeURIComponent(sale.agentId)}` : ''}`} className="vld-sale" key={sale.id}>
                  <span className="vld-sale-icon"><Ticket size={15} /></span>
                  <span className="vld-sale-main"><strong>{sale.agentName} · {sale.location}</strong><span>{sale.packageName} · {sale.voucherCode ?? sale.batchNumber ?? 'Voucher'}</span></span>
                  <span className="vld-sale-amount"><strong>{formatCurrency(sale.amountUgx)}</strong><span>{relativeTime(sale.createdAt)}</span></span>
                </a>
              ))}
            </div>
          </section>

          <section className="vld-panel">
            <div className="vld-panel-head"><span className="vld-panel-title">Stock attention</span><CircleAlert size={15} color="var(--warn-fg)" /></div>
            <div className="vld-alerts">
              <Alert href={`${fullReport}&status=EXPIRING`} label="Expiring within 7 days" value={alerts?.expiringSoon ?? 0} />
              <Alert href={`${fullReport}&status=EXPIRED`} label="Expired vouchers" value={alerts?.expired ?? 0} />
              <Alert href={`${fullReport}&status=VOIDED`} label="Void / lost vouchers" value={alerts?.voided ?? 0} />
              <Alert href={fullReport} label="Agents low on stock" value={alerts?.lowStockAgents ?? 0} />
              <Alert href={fullReport} label="Stock with no sales" value={alerts?.dormantAgents ?? 0} />
              <Alert href={fullReport} label="Overdue settlements" value={alerts?.overdueSettlements ?? 0} />
            </div>
          </section>
        </div>

        <div className="vld-rankings">
          <section className="vld-ranking">
            <div className="vld-panel-head"><span className="vld-panel-title">Top agents</span><Users size={15} color="var(--text-muted)" /></div>
            <div className="vld-table">
              {data?.agents.slice(0, 5).map((agent) => (
                <button type="button" className="vld-row" key={agent.agentId} onClick={() => setSelectedAgent(agent)}>
                  <span className="vld-row-main"><span className="vld-avatar">{initials(agent.name)}</span><span><strong>{agent.name}</strong><span>{agent.territory} · {agent.stock} stock</span></span></span>
                  <span className="vld-row-number"><strong>{formatCurrency(agent.grossSalesUgx)}</strong><span>{agent.sales} sales</span></span>
                  <span className="vld-row-number"><strong>{formatCurrency(agent.cashDueUgx)}</strong><span>cash due</span></span>
                </button>
              ))}
              {!loading && (data?.agents.length ?? 0) === 0 && <div className="vld-empty">No agent activity.</div>}
            </div>
          </section>

          <section className="vld-ranking">
            <div className="vld-panel-head"><span className="vld-panel-title">Top locations</span><MapPin size={15} color="var(--text-muted)" /></div>
            <div className="vld-table">
              {data?.locations.slice(0, 5).map((location) => (
                <a className="vld-row" key={location.location} href={`/agents/reports?${query}&territory=${encodeURIComponent(location.location)}`}>
                  <span className="vld-row-main"><span className="vld-avatar"><MapPin size={13} /></span><span><strong>{location.location}</strong><span>{location.agents} agents · {location.stock} stock</span></span></span>
                  <span className="vld-row-number"><strong>{formatCurrency(location.grossSalesUgx)}</strong><span>{location.sales} sales</span></span>
                  <span className="vld-row-number"><strong>{formatCurrency(location.cashDueUgx)}</strong><span>cash due</span></span>
                </a>
              ))}
              {!loading && (data?.locations.length ?? 0) === 0 && <div className="vld-empty">No location activity.</div>}
            </div>
          </section>
        </div>

        <footer className="vld-footer">
          <span>Updated {data ? relativeTime(data.generatedAt) : '—'} · Sales appear after successful redemption.</span>
          <span className="vld-footer-actions"><a href={exportExcel}>Excel</a><a href={exportPdf}>PDF</a><a href={fullReport}>View full report <ArrowUpRight size={12} style={{ verticalAlign: -2 }} /></a></span>
        </footer>
      </div>

      <Modal open={Boolean(selectedAgent)} title={selectedAgent?.name ?? 'Agent'} onClose={() => setSelectedAgent(null)} width={620}>
        {selectedAgent && <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>{selectedAgent.code} · {selectedAgent.territory}</div>
          <div className="vld-agent-grid">
            <AgentStat label="Gross sales" value={formatCurrency(selectedAgent.grossSalesUgx)} />
            <AgentStat label="Commission" value={formatCurrency(selectedAgent.commissionUgx)} />
            <AgentStat label="Cash due" value={formatCurrency(selectedAgent.cashDueUgx)} />
            <AgentStat label="Available stock" value={selectedAgent.stock.toLocaleString()} />
            <AgentStat label="Stock value" value={formatCurrency(selectedAgent.stockValueUgx)} />
            <AgentStat label="Redeemed sales" value={selectedAgent.sales.toLocaleString()} />
            <AgentStat label="Expiring soon" value={selectedAgent.expiringSoon.toLocaleString()} />
            <AgentStat label="Expired / voided" value={`${selectedAgent.expired} / ${selectedAgent.voided}`} />
            <AgentStat label="Last sale" value={selectedAgent.lastSaleAt ? relativeTime(selectedAgent.lastSaleAt) : 'No sale'} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><a className="btn btn-primary" href={`/agents/reports?${query}&agentId=${encodeURIComponent(selectedAgent.agentId)}`}>Open agent report</a></div>
        </div>}
      </Modal>
    </section>
  )
}

function Kpi({ icon, label, value, meta, change }: { icon: React.ReactNode; label: string; value: string; meta: string; change?: number }) {
  return <div className="vld-kpi"><div className="vld-kpi-label">{icon}{label}</div><div className="vld-kpi-value">{value}</div><div className="vld-kpi-meta">{change !== undefined && <span className={`vld-kpi-change ${change < 0 ? 'down' : ''}`}>{change > 0 ? '+' : ''}{change}% · </span>}{meta}</div></div>
}

function Alert({ href, label, value }: { href: string; label: string; value: number }) {
  return <a className="vld-alert" href={href}><span><CircleAlert size={13} />{label}</span><strong>{value}</strong></a>
}

function AgentStat({ label, value }: { label: string; value: string }) {
  return <div className="vld-agent-stat"><span>{label}</span><strong>{value}</strong></div>
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'AG'
}

function periodRange(period: PeriodKey) {
  const to = new Date()
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  if (period === '7d') from.setDate(from.getDate() - 6)
  if (period === '30d') from.setDate(from.getDate() - 29)
  return { from, to }
}

function relativeTime(value: string) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 'recently'
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000))
  if (seconds < 10) return 'now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
