'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { clientFetchApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'

type Agent = {
  id: string
  code: string
  name: string
  territory?: string | null
  tenant: { id: string; name: string }
}

type PackageItem = {
  id: string
  name: string
  code: string
  tenant: { id: string; name: string }
}

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

type AgentMetric = Metric & {
  agentId: string
  agent: {
    id: string
    code: string
    name: string
    phoneNumber: string
    territory?: string | null
  }
}

type MainMetric = Metric & {
  ownerType: 'MAIN'
  code: string
  name: string
  territory: string
}

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

type AgentsOverview = { agents: Agent[] }
type PackagesOverview = { items: PackageItem[] }

type Filters = {
  ownerType: 'ALL' | 'AGENT' | 'MAIN'
  agentId: string
  territory: string
  packageId: string
  from: string
  to: string
}

const initialFilters: Filters = {
  ownerType: 'ALL',
  agentId: '',
  territory: '',
  packageId: '',
  from: '',
  to: '',
}

export default function AgentVoucherAccountabilityReport() {
  const [report, setReport] = useState<Report | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [packages, setPackages] = useState<PackageItem[]>([])
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadInitial()
  }, [])

  async function loadInitial() {
    try {
      setLoading(true)
      const [agentData, packageData] = await Promise.all([
        clientFetchApi<AgentsOverview>('/agents/overview'),
        clientFetchApi<PackagesOverview>('/packages'),
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
    const query = buildQuery(nextFilters)
    const data = await clientFetchApi<Report>(`/agents/voucher-metrics?${query}`)
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
    const output: Array<{
      key: string
      owner: string
      code: string
      name: string
      territory: string
      metric: Metric
    }> = []

    if (report?.main) {
      output.push({
        key: 'MAIN',
        owner: 'Main',
        code: report.main.code,
        name: report.main.name,
        territory: report.main.territory,
        metric: report.main,
      })
    }

    for (const item of report?.items ?? []) {
      output.push({
        key: item.agentId,
        owner: 'Agent',
        code: item.agent.code,
        name: item.agent.name,
        territory: item.agent.territory ?? 'Unassigned',
        metric: item,
      })
    }

    return output
  }, [report])

  const exportUrl = `/api/agents/voucher-metrics/export.csv?${buildQuery(filters)}`

  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <div className="card-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="card-title">Voucher Sales Accountability Report</div>
          <p className="page-subtitle" style={{ margin: '5px 0 0' }}>
            Compare agent stock, owner stock, successful redemptions, commission basis, fees and unsold exposure.
          </p>
        </div>
        <a className="btn btn-ghost" href={exportUrl}>Export CSV</a>
      </div>

      <form onSubmit={submit} style={{ marginBottom: 16 }}>
        <div className="stats-grid">
          <div className="form-group">
            <label className="form-label">Sales Owner</label>
            <select className="form-input" value={filters.ownerType} onChange={(event) => setFilters((current) => ({ ...current, ownerType: event.target.value as Filters['ownerType'], agentId: event.target.value === 'MAIN' ? '' : current.agentId }))}>
              <option value="ALL">Main + All Agents</option>
              <option value="AGENT">Agents Only</option>
              <option value="MAIN">Main / Owner Only</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Specific Agent</label>
            <select className="form-input" value={filters.agentId} onChange={(event) => setFilters((current) => ({ ...current, agentId: event.target.value, ownerType: event.target.value ? 'AGENT' : current.ownerType }))} disabled={filters.ownerType === 'MAIN'}>
              <option value="">All agents</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.code} — {agent.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Location / Territory</label>
            <select className="form-input" value={filters.territory} onChange={(event) => setFilters((current) => ({ ...current, territory: event.target.value }))}>
              <option value="">All locations</option>
              {territories.map((territory) => <option key={territory} value={territory}>{territory}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Package</label>
            <select className="form-input" value={filters.packageId} onChange={(event) => setFilters((current) => ({ ...current, packageId: event.target.value }))}>
              <option value="">All packages</option>
              {packages.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Sales From</label>
            <input className="form-input" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Sales To</label>
            <input className="form-input" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Loading report...' : 'Apply Filters'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setFilters(initialFilters); void loadReport(initialFilters) }}>Clear</button>
        </div>
      </form>

      {error && <p style={{ color: 'var(--danger-fg)', marginBottom: 12 }}>{error}</p>}

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        {[
          ['Confirmed Sales', String(report?.summary.recordedSales ?? 0)],
          ['Gross Sales', formatCurrency(report?.summary.recordedSalesUgx ?? 0)],
          ['Agent Sales', formatCurrency(report?.summary.agentSalesUgx ?? 0)],
          ['Main Sales', formatCurrency(report?.summary.mainSalesUgx ?? 0)],
          ['Unsold Stock', String(report?.summary.unsold ?? 0)],
          ['Unsold Value', formatCurrency(report?.summary.unsoldValueUgx ?? 0)],
          ['Redeemed', String(report?.summary.redeemed ?? 0)],
          ['Platform Fees', formatCurrency(report?.summary.recordedFeesUgx ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="stat-card blue">
            <div className="stat-label">{label}</div>
            <div className="stat-value blue">{value}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Owner</th>
              <th>Code / Name</th>
              <th>Location</th>
              <th>Assigned</th>
              <th>Unsold</th>
              <th>Redeemed / Sales</th>
              <th>Gross Sales</th>
              <th>Fees</th>
              <th>Net</th>
              <th>Exceptions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr><td colSpan={10}><div className="empty-state"><p>No voucher stock or sales match these filters.</p></div></td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.key}>
                <td><span className={row.owner === 'Agent' ? 'badge badge-success' : 'badge badge-ghost'}>{row.owner}</span></td>
                <td>
                  <div style={{ fontWeight: 700 }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.code}</div>
                </td>
                <td>{row.territory}</td>
                <td><strong>{row.metric.totalAssigned}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatCurrency(row.metric.assignedValueUgx)}</div></td>
                <td><strong>{row.metric.unsold}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatCurrency(row.metric.unsoldValueUgx)}</div></td>
                <td><strong>{row.metric.redeemed}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.metric.recordedSales} confirmed sales</div></td>
                <td>{formatCurrency(row.metric.recordedSalesUgx)}</td>
                <td>{formatCurrency(row.metric.recordedFeesUgx)}</td>
                <td>{formatCurrency(row.metric.recordedNetUgx)}</td>
                <td>
                  {row.metric.expired > 0 || row.metric.voided > 0 ? (
                    <span className="badge badge-warning">{row.metric.expired} expired · {row.metric.voided} voided</span>
                  ) : (
                    <span className="badge badge-success">Clear</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
