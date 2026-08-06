'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'

type Tenant = {
  id: string
  name: string
}

type PackageItem = {
  id: string
  name: string
  code: string
  tenant: { id: string; name: string }
  prices?: Array<{ amountUgx: number; isDefault?: boolean }>
}

type Agent = {
  id: string
  tenant: { id: string; name: string }
  code: string
  name: string
  phoneNumber: string
  territory?: string | null
  commissionRateBps: number
  status: string
}

type AgentsOverview = {
  agents: Agent[]
}

type TenantOverview = {
  items: Tenant[]
}

type PackageOverview = {
  items: PackageItem[]
}

type StockOwnerType = 'MAIN' | 'AGENT'

export default function AgentVoucherIssuancePanel() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [packages, setPackages] = useState<PackageItem[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [stockOwnerType, setStockOwnerType] = useState<StockOwnerType>('MAIN')
  const [tenantId, setTenantId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [quantity, setQuantity] = useState('100')
  const [faceValueUgx, setFaceValueUgx] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    void loadOptions()
  }, [])

  async function loadOptions() {
    try {
      setLoading(true)
      const [tenantData, packageData, agentData] = await Promise.all([
        clientFetchApi<TenantOverview>('/tenants'),
        clientFetchApi<PackageOverview>('/packages'),
        clientFetchApi<AgentsOverview>('/agents/overview'),
      ])

      setTenants(tenantData.items ?? [])
      setPackages(packageData.items ?? [])
      setAgents(agentData.agents ?? [])

      const defaultTenantId = tenantData.items?.[0]?.id ?? agentData.agents?.[0]?.tenant.id ?? ''
      setTenantId((current) => current || defaultTenantId)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load agents and voucher options')
    } finally {
      setLoading(false)
    }
  }

  const availablePackages = useMemo(
    () => packages.filter((item) => item.tenant.id === tenantId),
    [packages, tenantId],
  )

  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.tenant.id === tenantId && agent.status === 'ACTIVE'),
    [agents, tenantId],
  )

  const selectedAgent = availableAgents.find((agent) => agent.id === agentId)
  const selectedPackage = availablePackages.find((item) => item.id === packageId)
  const resolvedFaceValue = Number.parseInt(faceValueUgx || '', 10) || selectedPackage?.prices?.find((price) => price.isDefault)?.amountUgx || selectedPackage?.prices?.[0]?.amountUgx || 0
  const resolvedQuantity = Number.parseInt(quantity, 10) || 0
  const stockValue = resolvedFaceValue * resolvedQuantity
  const expectedCommission = selectedAgent
    ? Math.round((stockValue * selectedAgent.commissionRateBps) / 10000)
    : 0

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!tenantId || !packageId || resolvedQuantity <= 0) {
      setError('Select a business and package, then enter a valid voucher quantity.')
      return
    }

    if (stockOwnerType === 'AGENT' && !agentId) {
      setError('Select the agent who will be accountable for this voucher stock.')
      return
    }

    try {
      setSubmitting(true)
      await clientPostApi('/vouchers/batches', {
        tenantId,
        packageId,
        agentId: stockOwnerType === 'AGENT' ? agentId : undefined,
        quantity: resolvedQuantity,
        faceValueUgx: resolvedFaceValue || undefined,
        expiresAt: expiresAt || undefined,
        notes: [
          stockOwnerType === 'AGENT'
            ? `AGENT STOCK: ${selectedAgent?.code ?? agentId}${selectedAgent?.territory ? ` | ${selectedAgent.territory}` : ''}`
            : 'MAIN / OWNER STOCK',
          notes.trim(),
        ].filter(Boolean).join(' | '),
      })

      setSuccess(
        stockOwnerType === 'AGENT'
          ? `${resolvedQuantity} vouchers assigned to ${selectedAgent?.name ?? 'the selected agent'}. Sales will be recorded only when each voucher is redeemed.`
          : `${resolvedQuantity} vouchers generated as main owner stock. Sales will be recorded only when redeemed.`,
      )
      setQuantity('100')
      setFaceValueUgx('')
      setExpiresAt('')
      setNotes('')
      setAgentId('')
      window.setTimeout(() => window.location.reload(), 900)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to generate accountable voucher stock')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <div className="card-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="card-title">Accountable Voucher Issuance</div>
          <p className="page-subtitle" style={{ margin: '5px 0 0' }}>
            Tag every batch as main stock or assign it to one agent. A voucher becomes a sale only after successful redemption.
          </p>
        </div>
        <span className="badge badge-success">Redemption = Sale</span>
      </div>

      <form onSubmit={submit}>
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Stock Owner</label>
            <select
              className="form-input"
              value={stockOwnerType}
              onChange={(event) => {
                const next = event.target.value as StockOwnerType
                setStockOwnerType(next)
                if (next === 'MAIN') setAgentId('')
              }}
            >
              <option value="MAIN">Main / Owner Stock</option>
              <option value="AGENT">Assign to Agent</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Business</label>
            <select
              className="form-input"
              value={tenantId}
              onChange={(event) => {
                setTenantId(event.target.value)
                setPackageId('')
                setAgentId('')
              }}
              required
              disabled={loading}
            >
              <option value="">Select business</option>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </div>

          {stockOwnerType === 'AGENT' && (
            <div className="form-group">
              <label className="form-label">Accountable Agent</label>
              <select className="form-input" value={agentId} onChange={(event) => setAgentId(event.target.value)} required>
                <option value="">Select agent</option>
                {availableAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.code} — {agent.name}{agent.territory ? ` (${agent.territory})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Package</label>
            <select className="form-input" value={packageId} onChange={(event) => setPackageId(event.target.value)} required>
              <option value="">Select package</option>
              {availablePackages.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Number of Vouchers</label>
            <input className="form-input" type="number" min={1} max={10000} value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label">Face Value UGX</label>
            <input className="form-input" type="number" min={1} value={faceValueUgx} onChange={(event) => setFaceValueUgx(event.target.value)} placeholder={resolvedFaceValue ? String(resolvedFaceValue) : 'Use package price'} />
          </div>

          <div className="form-group">
            <label className="form-label">Voucher Expiry</label>
            <input className="form-input" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Issue Notes</label>
            <input className="form-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bwaise kiosk issue, shift, receipt reference..." />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14, padding: 14, background: 'var(--surface-2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div><div className="stat-label">Tracking</div><strong>{stockOwnerType === 'AGENT' ? selectedAgent?.code ?? 'Select agent' : 'MAIN / OWNER'}</strong></div>
            <div><div className="stat-label">Location</div><strong>{stockOwnerType === 'AGENT' ? selectedAgent?.territory ?? 'Unassigned' : 'Owner direct'}</strong></div>
            <div><div className="stat-label">Stock Value</div><strong>{formatCurrency(stockValue)}</strong></div>
            <div><div className="stat-label">Expected Agent Commission</div><strong>{formatCurrency(expectedCommission)}</strong></div>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Stock value is not counted as revenue at issue or printing. Revenue, agent sale totals, commission and cash accountability start when the customer redeems the voucher.
          </p>
        </div>

        {error && <p style={{ color: 'var(--danger-fg)', margin: '0 0 10px' }}>{error}</p>}
        {success && <p style={{ color: 'var(--success-fg)', margin: '0 0 10px' }}>{success}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
          {submitting ? 'Generating accountable vouchers...' : stockOwnerType === 'AGENT' ? 'Generate & Assign to Agent' : 'Generate Main Stock'}
        </button>
      </form>
    </section>
  )
}
