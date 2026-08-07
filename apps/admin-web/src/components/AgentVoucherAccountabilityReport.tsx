'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { clientFetchApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'

type Agent = { id: string; code: string; name: string; territory?: string | null; tenant: { id: string; name: string } }
type PackageItem = { id: string; name: string; code: string; tenant: { id: string; name: string } }
type Metric = {
  totalAssigned: number
  unsold: number
  redeemed: number
  expired: number
  voided: number
  assignedValueUgx: number
  unsoldValueUgx: number
  recordedSales: number
  recordedSalesUgx: number
  recordedFeesUgx: number
  recordedNetUgx: number
}
type AgentMetric = Metric & { agentId: string; agent: { id: string; code: string; name: string; phoneNumber: string; territory?: string | null } }
type MainMetric = Metric & { ownerType: 'MAIN'; code: string; name: string; territory: string }
type Report = {
  summary: {
    totalAssigned: number
    unsold: number
    redeemed: number
    expired: number
    voided: number
    recordedSales: number
    recordedSalesUgx: number
    recordedFeesUgx: number
    recordedNetUgx: number
    mainSalesUgx: number
    agentSalesUgx: number
    unsoldValueUgx: number
  }
  main: MainMetric | null
  items: AgentMetric[]
}
type Filters = { ownerType: 'ALL' | 'AGENT' | 'MAIN'; agentId: string; territory: string; packageId: string; from: string; to: string }
type ReportRow = { key: string; owner: 'Main' | 'Agent'; code: string; name: string; territory: string; metric: Metric }

const initialFilters: Filters = { ownerType: 'ALL', agentId: '', territory: '', packageId: '', from: '', to: '' }

export default function AgentVoucherAccountabilityReport() {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [packages, setPackages] = useState<PackageItem[]>([])
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void loadInitial() }, [])

  async function loadInitial() {
    try {
      setLoading(true)
      const [agentData, packageData] = await Promise.all([
        clientFetchApi<{ agents: Agent[] }>('/agents/overview'),
        clientFetchApi<{ items: PackageItem[] }>('/packages'),
      ])
      setAgents(agentData.agents ?? [])
      setPackages(packageData.items ?? [])
      await loadReport(initialFilters)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load voucher report')
    } finally {
      setLoading(false)
    }
  }

  async function loadReport(nextFilters: Filters) {
    setError(null)
    const data = await clientFetchApi<Report>(`/agents/voucher-metrics?${buildQuery(nextFilters)}`)
    setReport(data)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setLoading(true)
      await loadReport(filters)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to apply filters')
    } finally {
      setLoading(false)
    }
  }

  async function clearFilters() {
    try {
      setLoading(true)
      setFilters(initialFilters)
      await loadReport(initialFilters)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to reset filters')
    } finally {
      setLoading(false)
    }
  }

  const territories = useMemo(
    () => Array.from(new Set(agents.map((agent) => agent.territory).filter((value): value is string => Boolean(value)))).sort(),
    [agents],
  )

  const rows = useMemo<ReportRow[]>(() => {
    const output: ReportRow[] = []
    if (report?.main) output.push({ key: 'MAIN', owner: 'Main', code: report.main.code, name: report.main.name, territory: report.main.territory, metric: report.main })
    for (const item of report?.items ?? []) output.push({ key: item.agentId, owner: 'Agent', code: item.agent.code, name: item.agent.name, territory: item.agent.territory ?? 'Unassigned', metric: item })
    return output
  }, [report])

  const exportUrl = `/api/agents/voucher-metrics/export.csv?${buildQuery(filters)}`
  const summary = report?.summary

  return (
    <section className="card voucher-report-panel">
      <style>{`
        .voucher-report-panel{padding:16px 18px}
        .voucher-report-head{display:flex;justify-content:space-between;align-items:center;gap:14px}
        .voucher-report-head h2{font-size:16px;font-weight:650;margin:0;color:var(--text-primary)}
        .voucher-report-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}
        .voucher-report-kpi{position:relative;padding:13px 14px;border:1px solid var(--border);border-radius:9px;background:var(--bg-card);overflow:hidden}
        .voucher-report-kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--brand)}
        .voucher-report-kpi span{display:block;font-size:11.5px;color:var(--text-muted);margin-bottom:4px}
        .voucher-report-kpi strong{font-size:17px;line-height:1.2;font-weight:650;color:var(--text-primary)}
        .voucher-report-error{margin:10px 0 0;color:var(--danger-fg);font-size:12.5px;font-weight:600}
        .voucher-report-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}
        .voucher-report-filters{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;flex:1}
        .voucher-report-actions{display:flex;gap:7px;flex-wrap:wrap;flex:0 0 auto}
        .voucher-report-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:13px}
        .voucher-report-summary div{padding:11px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-hover)}
        .voucher-report-summary span{display:block;font-size:10.5px;color:var(--text-muted);margin-bottom:3px}
        .voucher-report-summary strong{font-size:14px;font-weight:650;color:var(--text-primary)}
        .voucher-report-table-shell{max-height:48vh;overflow:auto;border:1px solid var(--border);border-radius:9px;background:var(--bg-card)}
        .voucher-report-table{width:100%;min-width:1060px;border-collapse:collapse}
        .voucher-report-table th{position:sticky;top:0;z-index:1;padding:10px 11px;background:var(--bg-hover);border-bottom:1px solid var(--border);font-size:11px;font-weight:650;color:var(--text-muted);text-align:left}
        .voucher-report-table td{padding:11px;border-bottom:1px solid var(--border-soft);font-size:12.5px;color:var(--text-2);vertical-align:middle}
        .voucher-report-table tr:last-child td{border-bottom:0}
        .voucher-report-owner{display:flex;align-items:center;gap:8px}
        .voucher-report-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--green-light);color:var(--brand);font-size:11px;font-weight:700;flex:0 0 auto}
        .voucher-report-owner strong{display:block;font-size:13px;color:var(--text-primary)}
        .voucher-report-owner small{display:block;color:var(--text-muted);font-size:10.5px;margin-top:1px}
        .voucher-report-number{font-weight:650;color:var(--text-primary)}
        .voucher-report-subvalue{display:block;margin-top:2px;font-size:10.5px;color:var(--text-muted)}
        .voucher-report-mobile{display:none}
        .voucher-report-mobile-card{border:1px solid var(--border);border-radius:9px;background:var(--bg-card);padding:13px}
        .voucher-report-mobile-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:11px}
        .voucher-report-mobile-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
        .voucher-report-mobile-grid span{display:block;font-size:10.5px;color:var(--text-muted)}
        .voucher-report-mobile-grid strong{display:block;margin-top:2px;font-size:13px;color:var(--text-primary)}
        @media(max-width:1040px){.voucher-report-toolbar{display:block}.voucher-report-actions{margin-top:10px}.voucher-report-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:760px){.voucher-report-panel{padding:14px}.voucher-report-head{align-items:center}.voucher-report-kpis,.voucher-report-summary{grid-template-columns:1fr 1fr}.voucher-report-filters{grid-template-columns:1fr}.voucher-report-actions{display:grid;grid-template-columns:1fr 1fr}.voucher-report-actions .btn{width:100%}.voucher-report-table-shell{display:none}.voucher-report-mobile{display:grid;gap:9px;max-height:48vh;overflow:auto}.voucher-report-kpi strong{font-size:15px}}
        @media(max-width:430px){.voucher-report-head{align-items:flex-start;flex-direction:column}.voucher-report-head .btn{width:100%}.voucher-report-kpis,.voucher-report-summary,.voucher-report-actions{grid-template-columns:1fr}.voucher-report-mobile-grid{grid-template-columns:1fr 1fr}}
      `}</style>

      <div className="voucher-report-head">
        <h2>Voucher sales report</h2>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>View report</button>
      </div>

      <div className="voucher-report-kpis">
        <div className="voucher-report-kpi"><span>Confirmed sales</span><strong>{summary?.recordedSales ?? 0}</strong></div>
        <div className="voucher-report-kpi"><span>Gross sales</span><strong>{formatCurrency(summary?.recordedSalesUgx ?? 0)}</strong></div>
        <div className="voucher-report-kpi"><span>Unsold stock</span><strong>{summary?.unsold ?? 0}</strong></div>
        <div className="voucher-report-kpi"><span>Stock value</span><strong>{formatCurrency(summary?.unsoldValueUgx ?? 0)}</strong></div>
      </div>
      {error && <div className="voucher-report-error">{error}</div>}

      <Modal open={open} title="Voucher sales report" onClose={() => setOpen(false)} width={1220}>
        <form onSubmit={submit} className="voucher-report-toolbar">
          <div className="voucher-report-filters">
            <div className="form-group">
              <label className="form-label">Owner</label>
              <select className="form-input" value={filters.ownerType} onChange={(event) => setFilters((current) => ({ ...current, ownerType: event.target.value as Filters['ownerType'], agentId: event.target.value === 'MAIN' ? '' : current.agentId }))}>
                <option value="ALL">Main + agents</option><option value="AGENT">Agents</option><option value="MAIN">Main / owner</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Agent</label>
              <select className="form-input" value={filters.agentId} onChange={(event) => setFilters((current) => ({ ...current, agentId: event.target.value, ownerType: event.target.value ? 'AGENT' : current.ownerType }))} disabled={filters.ownerType === 'MAIN'}>
                <option value="">All agents</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.code} — {agent.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <select className="form-input" value={filters.territory} onChange={(event) => setFilters((current) => ({ ...current, territory: event.target.value }))}>
                <option value="">All locations</option>{territories.map((territory) => <option key={territory} value={territory}>{territory}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Package</label>
              <select className="form-input" value={filters.packageId} onChange={(event) => setFilters((current) => ({ ...current, packageId: event.target.value }))}>
                <option value="">All packages</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">From</label><input className="form-input" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></div>
            <div className="form-group"><label className="form-label">To</label><input className="form-input" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></div>
          </div>
          <div className="voucher-report-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Loading…' : 'Apply'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => void clearFilters()}>Reset</button>
            <a className="btn btn-ghost" href={exportUrl}>Export CSV</a>
          </div>
        </form>

        <div className="voucher-report-summary">
          <div><span>Gross sales</span><strong>{formatCurrency(summary?.recordedSalesUgx ?? 0)}</strong></div>
          <div><span>Agent sales</span><strong>{formatCurrency(summary?.agentSalesUgx ?? 0)}</strong></div>
          <div><span>Main sales</span><strong>{formatCurrency(summary?.mainSalesUgx ?? 0)}</strong></div>
          <div><span>Platform fees</span><strong>{formatCurrency(summary?.recordedFeesUgx ?? 0)}</strong></div>
        </div>

        <div className="voucher-report-table-shell">
          <table className="voucher-report-table">
            <thead><tr><th>Stock owner</th><th>Location</th><th>Issued</th><th>Unsold</th><th>Redeemed</th><th>Gross</th><th>Fees</th><th>Net</th><th>Status</th></tr></thead>
            <tbody>
              {!loading && rows.length === 0 && <tr><td colSpan={9}>No records match these filters.</td></tr>}
              {rows.map((row) => (
                <tr key={row.key}>
                  <td><div className="voucher-report-owner"><div className="voucher-report-avatar">{initials(row.name)}</div><div><strong>{row.name}</strong><small>{row.owner} · {row.code}</small></div></div></td>
                  <td>{row.territory}</td>
                  <td><span className="voucher-report-number">{row.metric.totalAssigned}</span><span className="voucher-report-subvalue">{formatCurrency(row.metric.assignedValueUgx)}</span></td>
                  <td><span className="voucher-report-number">{row.metric.unsold}</span><span className="voucher-report-subvalue">{formatCurrency(row.metric.unsoldValueUgx)}</span></td>
                  <td><span className="voucher-report-number">{row.metric.redeemed}</span><span className="voucher-report-subvalue">{row.metric.recordedSales} sales</span></td>
                  <td>{formatCurrency(row.metric.recordedSalesUgx)}</td>
                  <td>{formatCurrency(row.metric.recordedFeesUgx)}</td>
                  <td><strong>{formatCurrency(row.metric.recordedNetUgx)}</strong></td>
                  <td>{row.metric.expired > 0 || row.metric.voided > 0 ? <span className="badge badge-warning">{row.metric.expired} expired · {row.metric.voided} voided</span> : <span className="badge badge-success">Clear</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="voucher-report-mobile">
          {!loading && rows.length === 0 && <div className="voucher-report-mobile-card">No records match these filters.</div>}
          {rows.map((row) => (
            <article className="voucher-report-mobile-card" key={row.key}>
              <div className="voucher-report-mobile-head">
                <div className="voucher-report-owner"><div className="voucher-report-avatar">{initials(row.name)}</div><div><strong>{row.name}</strong><small>{row.owner} · {row.code}</small></div></div>
                {row.metric.expired > 0 || row.metric.voided > 0 ? <span className="badge badge-warning">Review</span> : <span className="badge badge-success">Clear</span>}
              </div>
              <div className="voucher-report-mobile-grid">
                <div><span>Location</span><strong>{row.territory}</strong></div>
                <div><span>Issued</span><strong>{row.metric.totalAssigned}</strong></div>
                <div><span>Unsold</span><strong>{row.metric.unsold}</strong></div>
                <div><span>Redeemed</span><strong>{row.metric.redeemed}</strong></div>
                <div><span>Gross</span><strong>{formatCurrency(row.metric.recordedSalesUgx)}</strong></div>
                <div><span>Net</span><strong>{formatCurrency(row.metric.recordedNetUgx)}</strong></div>
              </div>
            </article>
          ))}
        </div>
      </Modal>
    </section>
  )
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'VO'
}

function buildQuery(filters: Filters) {
  const params = new URLSearchParams()
  params.set('ownerType', filters.ownerType)
  if (filters.agentId) params.set('agentId', filters.agentId)
  if (filters.territory) params.set('territory', filters.territory)
  if (filters.packageId) params.set('packageId', filters.packageId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  return params.toString()
}
