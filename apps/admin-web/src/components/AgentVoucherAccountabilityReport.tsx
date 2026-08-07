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
      setError(requestError instanceof Error ? requestError.message : 'Unable to load voucher accountability report')
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
      setError(requestError instanceof Error ? requestError.message : 'Unable to apply report filters')
    } finally {
      setLoading(false)
    }
  }

  const territories = useMemo(
    () => Array.from(new Set(agents.map((agent) => agent.territory).filter((value): value is string => Boolean(value)))).sort(),
    [agents],
  )

  const rows = useMemo(() => {
    const output: Array<{ key: string; owner: string; code: string; name: string; territory: string; metric: Metric }> = []
    if (report?.main) output.push({ key: 'MAIN', owner: 'Main', code: report.main.code, name: report.main.name, territory: report.main.territory, metric: report.main })
    for (const item of report?.items ?? []) output.push({ key: item.agentId, owner: 'Agent', code: item.agent.code, name: item.agent.name, territory: item.agent.territory ?? 'Unassigned', metric: item })
    return output
  }, [report])

  const exportUrl = `/api/agents/voucher-metrics/export.csv?${buildQuery(filters)}`
  const summary = report?.summary

  return (
    <section className="card voucher-report-launcher">
      <style>{`
        .voucher-report-launcher{padding:22px}
        .voucher-report-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
        .voucher-report-head h2{font-size:20px;margin:0 0 6px;color:var(--text-primary)}
        .voucher-report-head p{margin:0;color:var(--text-2);font-size:13px;line-height:1.5;max-width:690px}
        .voucher-report-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}
        .voucher-report-summary div{padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2)}
        .voucher-report-summary span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:4px}
        .voucher-report-summary strong{font-size:16px;color:var(--text-primary)}
        .voucher-report-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin-bottom:16px}
        .voucher-report-table{max-height:46vh;overflow:auto;border:1px solid var(--border);border-radius:12px}
        .voucher-report-table table{min-width:1120px;margin:0}
        @media(max-width:780px){.voucher-report-head{display:block}.voucher-report-head .btn{width:100%;margin-top:14px}.voucher-report-summary{grid-template-columns:1fr 1fr}.voucher-report-filters{grid-template-columns:1fr}}
      `}</style>

      <div className="voucher-report-head">
        <div>
          <h2>Voucher sales accountability</h2>
          <p>See confirmed redemptions, unsold stock, platform fees, owner sales, and agent sales without keeping a full report open on the page.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Open full report</button>
      </div>

      <div className="voucher-report-summary">
        <div><span>Confirmed sales</span><strong>{summary?.recordedSales ?? 0}</strong></div>
        <div><span>Gross sales</span><strong>{formatCurrency(summary?.recordedSalesUgx ?? 0)}</strong></div>
        <div><span>Unsold vouchers</span><strong>{summary?.unsold ?? 0}</strong></div>
        <div><span>Unsold value</span><strong>{formatCurrency(summary?.unsoldValueUgx ?? 0)}</strong></div>
      </div>
      {error && <p style={{ color: 'var(--danger-fg)', margin: '12px 0 0' }}>{error}</p>}

      <Modal open={open} title="Voucher sales accountability" onClose={() => setOpen(false)} width={1180}>
        <form onSubmit={submit}>
          <div className="voucher-report-filters">
            <div className="form-group">
              <label className="form-label">Sales owner</label>
              <select className="form-input" value={filters.ownerType} onChange={(event) => setFilters((current) => ({ ...current, ownerType: event.target.value as Filters['ownerType'], agentId: event.target.value === 'MAIN' ? '' : current.agentId }))}>
                <option value="ALL">Main + all agents</option><option value="AGENT">Agents only</option><option value="MAIN">Main / owner only</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Specific agent</label>
              <select className="form-input" value={filters.agentId} onChange={(event) => setFilters((current) => ({ ...current, agentId: event.target.value, ownerType: event.target.value ? 'AGENT' : current.ownerType }))} disabled={filters.ownerType === 'MAIN'}>
                <option value="">All agents</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.code} — {agent.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Location / territory</label>
              <select className="form-input" value={filters.territory} onChange={(event) => setFilters((current) => ({ ...current, territory: event.target.value }))}>
                <option value="">All locations</option>{territories.map((territory) => <option key={territory} value={territory}>{territory}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Package</label>
              <select className="form-input" value={filters.packageId} onChange={(event) => setFilters((current) => ({ ...current, packageId: event.target.value }))}>
                <option value="">All packages</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Sales from</label><input className="form-input" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Sales to</label><input className="form-input" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 17 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Loading…' : 'Apply filters'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setFilters(initialFilters); void loadReport(initialFilters) }}>Clear</button>
            <a className="btn btn-ghost" href={exportUrl}>Export CSV</a>
          </div>
        </form>

        <div className="voucher-report-summary" style={{ marginBottom: 16 }}>
          <div><span>Gross sales</span><strong>{formatCurrency(summary?.recordedSalesUgx ?? 0)}</strong></div>
          <div><span>Agent sales</span><strong>{formatCurrency(summary?.agentSalesUgx ?? 0)}</strong></div>
          <div><span>Main sales</span><strong>{formatCurrency(summary?.mainSalesUgx ?? 0)}</strong></div>
          <div><span>Platform fees</span><strong>{formatCurrency(summary?.recordedFeesUgx ?? 0)}</strong></div>
        </div>

        <div className="voucher-report-table">
          <table>
            <thead><tr><th>Owner</th><th>Code / name</th><th>Location</th><th>Assigned</th><th>Unsold</th><th>Redeemed / sales</th><th>Gross</th><th>Fees</th><th>Net</th><th>Exceptions</th></tr></thead>
            <tbody>
              {!loading && rows.length === 0 && <tr><td colSpan={10}>No voucher stock or sales match these filters.</td></tr>}
              {rows.map((row) => (
                <tr key={row.key}>
                  <td><span className={row.owner === 'Agent' ? 'badge badge-success' : 'badge badge-ghost'}>{row.owner}</span></td>
                  <td><strong>{row.name}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.code}</div></td>
                  <td>{row.territory}</td>
                  <td><strong>{row.metric.totalAssigned}</strong><div style={{ fontSize: 11 }}>{formatCurrency(row.metric.assignedValueUgx)}</div></td>
                  <td><strong>{row.metric.unsold}</strong><div style={{ fontSize: 11 }}>{formatCurrency(row.metric.unsoldValueUgx)}</div></td>
                  <td><strong>{row.metric.redeemed}</strong><div style={{ fontSize: 11 }}>{row.metric.recordedSales} confirmed</div></td>
                  <td>{formatCurrency(row.metric.recordedSalesUgx)}</td><td>{formatCurrency(row.metric.recordedFeesUgx)}</td><td>{formatCurrency(row.metric.recordedNetUgx)}</td>
                  <td>{row.metric.expired > 0 || row.metric.voided > 0 ? <span className="badge badge-warning">{row.metric.expired} expired · {row.metric.voided} voided</span> : <span className="badge badge-success">Clear</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </section>
  )
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
