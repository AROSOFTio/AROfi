'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'

type Tenant = { id: string; name: string }
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
type AgentsOverview = { agents: Agent[] }
type TenantOverview = { items: Tenant[] }
type PackageOverview = { items: PackageItem[] }
type StockOwnerType = 'MAIN' | 'AGENT'

const steps = ['Stock owner', 'Voucher details', 'Expiry & notes', 'Review'] as const

export default function AgentVoucherIssuancePanel() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
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
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (open && !loaded) void loadOptions()
  }, [open, loaded])

  async function loadOptions() {
    try {
      setLoading(true)
      setError(null)
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
      setLoaded(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load voucher options')
    } finally {
      setLoading(false)
    }
  }

  const availablePackages = useMemo(
    () => packages.filter((item) => item.tenant.id === tenantId && !/trial/i.test(`${item.name} ${item.code}`)),
    [packages, tenantId],
  )
  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.tenant.id === tenantId && agent.status === 'ACTIVE'),
    [agents, tenantId],
  )
  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId)
  const selectedAgent = availableAgents.find((agent) => agent.id === agentId)
  const selectedPackage = availablePackages.find((item) => item.id === packageId)
  const packagePrice = selectedPackage?.prices?.find((price) => price.isDefault)?.amountUgx
    ?? selectedPackage?.prices?.[0]?.amountUgx
    ?? 0
  const resolvedFaceValue = Number.parseInt(faceValueUgx || '', 10) || packagePrice
  const resolvedQuantity = Number.parseInt(quantity, 10) || 0
  const stockValue = resolvedFaceValue * resolvedQuantity
  const expectedCommission = selectedAgent
    ? Math.round((stockValue * selectedAgent.commissionRateBps) / 10000)
    : 0

  function resetFlow() {
    setStep(0)
    setStockOwnerType('MAIN')
    setPackageId('')
    setAgentId('')
    setQuantity('100')
    setFaceValueUgx('')
    setExpiresAt('')
    setNotes('')
    setError(null)
  }

  function closeFlow() {
    if (submitting) return
    setOpen(false)
    resetFlow()
  }

  function validateCurrentStep() {
    setError(null)
    if (step === 0) {
      if (!tenantId) return 'Select a business.'
      if (stockOwnerType === 'AGENT' && !agentId) return 'Select the accountable agent.'
    }
    if (step === 1) {
      if (!packageId) return 'Select the internet package.'
      if (resolvedQuantity < 1 || resolvedQuantity > 10000) return 'Enter between 1 and 10,000 vouchers.'
      if (resolvedFaceValue < 1) return 'Enter a valid voucher face value.'
    }
    return null
  }

  function nextStep() {
    const failure = validateCurrentStep()
    if (failure) {
      setError(failure)
      return
    }
    setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const failure = validateCurrentStep()
    if (failure) {
      setError(failure)
      return
    }
    if (!tenantId || !packageId || (stockOwnerType === 'AGENT' && !agentId)) {
      setError('Review the required selections before generating vouchers.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await clientPostApi('/vouchers/batches', {
        tenantId,
        packageId,
        agentId: stockOwnerType === 'AGENT' ? agentId : undefined,
        quantity: resolvedQuantity,
        faceValueUgx: resolvedFaceValue,
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
          ? `${resolvedQuantity} vouchers were assigned to ${selectedAgent?.name ?? 'the selected agent'}.`
          : `${resolvedQuantity} vouchers were generated as owner stock.`,
      )
      setOpen(false)
      resetFlow()
      window.setTimeout(() => window.location.reload(), 700)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to generate voucher stock')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="card voucher-issue-launcher">
      <style>{`
        .voucher-issue-launcher{padding:24px;display:flex;justify-content:space-between;align-items:center;gap:22px}
        .voucher-issue-launcher h2{font-size:20px;margin:0 0 6px;color:var(--text-primary)}
        .voucher-issue-launcher p{margin:0;max-width:670px;color:var(--text-2);font-size:13px;line-height:1.55}
        .voucher-wizard-progress{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:22px}
        .voucher-wizard-step{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:var(--surface-2);font-size:11px;color:var(--text-2);font-weight:800}
        .voucher-wizard-step.active{border-color:var(--brand);background:#eff6ff;color:#1d4ed8}
        .voucher-owner-options{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .voucher-owner-option{border:1px solid var(--border);border-radius:14px;padding:17px;text-align:left;background:var(--surface);cursor:pointer}
        .voucher-owner-option.active{border-color:var(--brand);box-shadow:0 0 0 2px rgba(37,99,235,.1)}
        .voucher-owner-option strong{display:block;font-size:15px;margin-bottom:5px;color:var(--text-primary)}
        .voucher-owner-option span{font-size:12px;line-height:1.45;color:var(--text-2)}
        .voucher-wizard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}
        .voucher-wizard-full{grid-column:1/-1}
        .voucher-review{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .voucher-review div{padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2)}
        .voucher-review span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:4px}
        .voucher-review strong{font-size:14px;color:var(--text-primary);overflow-wrap:anywhere}
        .voucher-wizard-actions{display:flex;justify-content:space-between;gap:10px;margin-top:22px;padding-top:16px;border-top:1px solid var(--border)}
        @media(max-width:700px){.voucher-issue-launcher{display:block}.voucher-issue-launcher .btn{width:100%;margin-top:16px}.voucher-owner-options,.voucher-wizard-grid,.voucher-review{grid-template-columns:1fr}.voucher-wizard-full{grid-column:auto}.voucher-wizard-progress{grid-template-columns:1fr 1fr}.voucher-wizard-actions{display:grid;grid-template-columns:1fr 1fr}.voucher-wizard-actions .btn{width:100%}}
      `}</style>

      <div>
        <h2>Issue a voucher batch</h2>
        <p>A four-step guided flow asks only what is needed. Nothing is counted as revenue until a customer successfully redeems a voucher.</p>
        {success && <p style={{ color: 'var(--success-fg)', fontWeight: 700, marginTop: 10 }}>{success}</p>}
      </div>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Start guided issue</button>

      <Modal open={open} title="Issue voucher batch" onClose={closeFlow} width={780}>
        <div className="voucher-wizard-progress">
          {steps.map((label, index) => (
            <div key={label} className={`voucher-wizard-step ${index === step ? 'active' : ''}`}>
              {index + 1}. {label}
            </div>
          ))}
        </div>

        <form onSubmit={submit}>
          {loading && <p>Loading businesses, packages, and agents…</p>}

          {!loading && step === 0 && (
            <div className="voucher-wizard-grid">
              <div className="form-group voucher-wizard-full">
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
                >
                  <option value="">Select business</option>
                  {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
                </select>
              </div>
              <div className="voucher-wizard-full">
                <label className="form-label">Who owns this stock?</label>
                <div className="voucher-owner-options">
                  <button type="button" className={`voucher-owner-option ${stockOwnerType === 'MAIN' ? 'active' : ''}`} onClick={() => { setStockOwnerType('MAIN'); setAgentId('') }}>
                    <strong>Main / Owner</strong>
                    <span>The business keeps and sells this stock directly.</span>
                  </button>
                  <button type="button" className={`voucher-owner-option ${stockOwnerType === 'AGENT' ? 'active' : ''}`} onClick={() => setStockOwnerType('AGENT')}>
                    <strong>Assign to Agent</strong>
                    <span>One agent becomes accountable for this batch.</span>
                  </button>
                </div>
              </div>
              {stockOwnerType === 'AGENT' && (
                <div className="form-group voucher-wizard-full">
                  <label className="form-label">Accountable agent</label>
                  <select className="form-input" value={agentId} onChange={(event) => setAgentId(event.target.value)} required>
                    <option value="">Select agent</option>
                    {availableAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.code} — {agent.name}{agent.territory ? ` (${agent.territory})` : ''}</option>
                    ))}
                  </select>
                  {availableAgents.length === 0 && <small>No active agents exist for this business.</small>}
                </div>
              )}
            </div>
          )}

          {!loading && step === 1 && (
            <div className="voucher-wizard-grid">
              <div className="form-group voucher-wizard-full">
                <label className="form-label">Internet package</label>
                <select className="form-input" value={packageId} onChange={(event) => { setPackageId(event.target.value); setFaceValueUgx('') }} required>
                  <option value="">Select package</option>
                  {availablePackages.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Number of vouchers</label>
                <input className="form-input" type="number" min={1} max={10000} value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Face value (UGX)</label>
                <input className="form-input" type="number" min={1} value={faceValueUgx} onChange={(event) => setFaceValueUgx(event.target.value)} placeholder={packagePrice ? String(packagePrice) : 'Enter amount'} />
                <small>{packagePrice ? `Package price: ${formatCurrency(packagePrice)}` : 'No default package price found.'}</small>
              </div>
            </div>
          )}

          {!loading && step === 2 && (
            <div className="voucher-wizard-grid">
              <div className="form-group">
                <label className="form-label">Voucher expiry (optional)</label>
                <input className="form-input" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
              </div>
              <div className="form-group voucher-wizard-full">
                <label className="form-label">Internal issue note (optional)</label>
                <textarea className="form-input" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Location, shift, receipt reference, or reason for issue…" />
              </div>
            </div>
          )}

          {!loading && step === 3 && (
            <div>
              <div className="voucher-review">
                <div><span>Business</span><strong>{selectedTenant?.name ?? 'Not selected'}</strong></div>
                <div><span>Stock owner</span><strong>{stockOwnerType === 'AGENT' ? selectedAgent?.name ?? 'Agent not selected' : 'Main / Owner'}</strong></div>
                <div><span>Package</span><strong>{selectedPackage?.name ?? 'Not selected'}</strong></div>
                <div><span>Quantity</span><strong>{resolvedQuantity.toLocaleString()} vouchers</strong></div>
                <div><span>Face value</span><strong>{formatCurrency(resolvedFaceValue)}</strong></div>
                <div><span>Total stock value</span><strong>{formatCurrency(stockValue)}</strong></div>
                <div><span>Expected agent commission</span><strong>{formatCurrency(expectedCommission)}</strong></div>
                <div><span>Expiry</span><strong>{expiresAt || 'No batch expiry'}</strong></div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '13px 0 0' }}>
                Issuing or printing does not create a sale. Revenue and commission are posted only after redemption.
              </p>
            </div>
          )}

          {error && <p style={{ color: 'var(--danger-fg)', margin: '14px 0 0', fontWeight: 700 }}>{error}</p>}

          <div className="voucher-wizard-actions">
            <button type="button" className="btn btn-ghost" onClick={() => step === 0 ? closeFlow() : setStep((current) => current - 1)} disabled={submitting}>
              {step === 0 ? 'Cancel' : 'Back'}
            </button>
            {step < steps.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={nextStep} disabled={loading}>Continue</button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
                {submitting ? 'Generating…' : stockOwnerType === 'AGENT' ? 'Generate & assign' : 'Generate owner stock'}
              </button>
            )}
          </div>
        </form>
      </Modal>
    </section>
  )
}
