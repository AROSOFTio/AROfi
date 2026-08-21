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
  description?: string | null
  isTrialEnabled?: boolean
  activePriceUgx?: number
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
type CreatedBatch = {
  id: string
  batchNumber: string
  quantity: number
  faceValueUgx: number
  tenant: Tenant
  package: { id: string; name: string; code: string; durationMinutes: number }
  agent?: { id: string; code: string; name: string; phoneNumber: string; territory?: string | null } | null
  previewVouchers: Array<{ id: string; code: string; status: string }>
  qrUrl?: string | null
}
type AgentsOverview = { agents: Agent[] }
type TenantOverview = { items: Tenant[] }
type PackageOverview = { items: PackageItem[] }
type StockOwnerType = 'MAIN' | 'AGENT'
type VoucherCodeFormat = 'UPPERCASE_TEXT' | 'LOWERCASE_TEXT' | 'MIXED' | 'NUMBERS'
type PdfTemplate = 'signal' | 'wave' | 'receipt' | 'agent' | 'thermal'

const steps = ['Owner', 'Details', 'Expiry', 'Review'] as const
const codeFormats: Array<{ value: VoucherCodeFormat; label: string; example: string }> = [
  { value: 'UPPERCASE_TEXT', label: 'Uppercase', example: 'ABCDXY' },
  { value: 'LOWERCASE_TEXT', label: 'Lowercase', example: 'abcdxy' },
  { value: 'MIXED', label: 'Mixed', example: 'Ab7xQ2' },
  { value: 'NUMBERS', label: 'Numbers', example: '482915' },
]
const pdfTemplates: Array<{ value: PdfTemplate; label: string }> = [
  { value: 'signal', label: 'Signal card' },
  { value: 'wave', label: 'Wave ticket' },
  { value: 'receipt', label: 'Clean receipt' },
  { value: 'agent', label: 'Agent strip' },
  { value: 'thermal', label: 'Mini thermal' },
]

function isTrialPackage(item: PackageItem) {
  const haystack = `${item.name ?? ''} ${item.code ?? ''} ${item.description ?? ''}`.toLowerCase()
  const price = item.activePriceUgx ?? item.prices?.find((entry) => entry.isDefault)?.amountUgx ?? item.prices?.[0]?.amountUgx ?? 0
  return Boolean(item.isTrialEnabled) || price <= 0 || haystack.includes('trial')
}

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
  const [codeFormat, setCodeFormat] = useState<VoucherCodeFormat>('UPPERCASE_TEXT')
  const [codeLength, setCodeLength] = useState('8')
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>('signal')
  const [createdBatch, setCreatedBatch] = useState<CreatedBatch | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

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
    () => packages.filter((item) => item.tenant.id === tenantId && !isTrialPackage(item)),
    [packages, tenantId],
  )
  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.tenant.id === tenantId && agent.status === 'ACTIVE'),
    [agents, tenantId],
  )
  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId)
  const selectedAgent = availableAgents.find((agent) => agent.id === agentId)
  const selectedPackage = availablePackages.find((item) => item.id === packageId)
  const packagePrice = selectedPackage?.activePriceUgx
    ?? selectedPackage?.prices?.find((price) => price.isDefault)?.amountUgx
    ?? selectedPackage?.prices?.[0]?.amountUgx
    ?? 0
  const resolvedQuantity = Number.parseInt(quantity, 10) || 0
  const resolvedCodeLength = Number.parseInt(codeLength, 10) || 8
  const stockValue = packagePrice * resolvedQuantity
  const expectedCommission = selectedAgent
    ? Math.round((stockValue * selectedAgent.commissionRateBps) / 10000)
    : 0
  const selectedFormat = codeFormats.find((format) => format.value === codeFormat)
  const previewUrl = createdBatch
    ? `/api/vouchers/batches/${createdBatch.id}/print.pdf?template=${pdfTemplate}&disposition=inline&preview=true`
    : ''
  const downloadUrl = createdBatch
    ? `/api/vouchers/batches/${createdBatch.id}/print.pdf?template=${pdfTemplate}&disposition=attachment`
    : ''

  function resetFlow() {
    setStep(0)
    setStockOwnerType('MAIN')
    setPackageId('')
    setAgentId('')
    setQuantity('100')
    setCodeFormat('UPPERCASE_TEXT')
    setCodeLength('8')
    setExpiresAt('')
    setNotes('')
    setPdfTemplate('signal')
    setCreatedBatch(null)
    setResultMessage(null)
    setError(null)
  }

  function openFlow() {
    resetFlow()
    setOpen(true)
  }

  function closeFlow() {
    if (submitting || sharing) return
    const refreshStock = Boolean(createdBatch)
    setOpen(false)
    resetFlow()
    if (refreshStock) window.setTimeout(() => window.location.reload(), 80)
  }

  function validateCurrentStep() {
    setError(null)
    if (step === 0) {
      if (!tenantId) return 'Select a business.'
      if (stockOwnerType === 'AGENT' && !agentId) return 'Select an agent.'
    }
    if (step === 1) {
      if (!packageId) return 'Select a package.'
      if (packagePrice < 1) return 'The selected package has no active price.'
      if (resolvedQuantity < 1 || resolvedQuantity > 10000) return 'Enter between 1 and 10,000 vouchers.'
      if (resolvedCodeLength < 6 || resolvedCodeLength > 24) return 'Code length must be between 6 and 24.'
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
    if (!tenantId || !packageId || packagePrice < 1 || (stockOwnerType === 'AGENT' && !agentId)) {
      setError('Complete the required fields.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const batch = await clientPostApi<CreatedBatch>('/vouchers/batches', {
        tenantId,
        packageId,
        agentId: stockOwnerType === 'AGENT' ? agentId : undefined,
        quantity: resolvedQuantity,
        faceValueUgx: packagePrice,
        codeFormat,
        codeLength: resolvedCodeLength,
        expiresAt: expiresAt || undefined,
        notes: [
          stockOwnerType === 'AGENT'
            ? `AGENT STOCK: ${selectedAgent?.code ?? agentId}${selectedAgent?.territory ? ` | ${selectedAgent.territory}` : ''}`
            : 'MAIN / OWNER STOCK',
          notes.trim(),
        ].filter(Boolean).join(' | '),
      })
      setCreatedBatch(batch)
      setResultMessage('Batch created. Preview it before downloading or sharing.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to generate vouchers')
    } finally {
      setSubmitting(false)
    }
  }

  async function sharePdf() {
    if (!createdBatch || !downloadUrl) return
    try {
      setSharing(true)
      setResultMessage(null)
      const response = await fetch(downloadUrl, { credentials: 'include' })
      if (!response.ok) throw new Error('Unable to prepare the voucher PDF for sharing.')
      const blob = await response.blob()
      const filename = `${createdBatch.batchNumber}-${pdfTemplate}.pdf`
      const file = new File([blob], filename, { type: 'application/pdf' })
      const shareData: ShareData = {
        title: createdBatch.batchNumber,
        text: `${createdBatch.quantity} ${createdBatch.package.name} vouchers`,
        files: [file],
      }
      const canShareFile = typeof navigator !== 'undefined'
        && typeof navigator.share === 'function'
        && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }))

      if (canShareFile) {
        await navigator.share(shareData)
        setResultMessage('PDF shared successfully.')
        return
      }

      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      setResultMessage('This browser cannot attach files to the share sheet. The PDF was downloaded instead.')
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return
      setResultMessage(requestError instanceof Error ? requestError.message : 'Unable to share the PDF.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <section className="card voucher-issue-launcher">
      <style>{`
        .voucher-issue-launcher{padding:16px 18px;display:flex;justify-content:space-between;align-items:center;gap:14px}
        .voucher-issue-launcher h2{font-size:16px;line-height:1.3;font-weight:650;margin:0;color:var(--text-primary)}
        .voucher-wizard-progress{display:flex;align-items:center;gap:6px;margin-bottom:18px;overflow-x:auto;padding-bottom:2px}
        .voucher-wizard-step{display:flex;align-items:center;gap:6px;white-space:nowrap;color:var(--text-muted);font-size:12px;font-weight:600}
        .voucher-wizard-step:not(:last-child)::after{content:"";width:24px;height:1px;background:var(--border);margin-left:2px}
        .voucher-step-number{display:grid;place-items:center;width:22px;height:22px;border:1px solid var(--border);border-radius:50%;background:var(--bg-card);font-size:11px}
        .voucher-wizard-step.active{color:var(--brand)}
        .voucher-wizard-step.active .voucher-step-number{border-color:var(--brand);background:var(--brand);color:#fff}
        .voucher-wizard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        .voucher-wizard-full{grid-column:1/-1}
        .voucher-owner-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .voucher-owner-option{height:42px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text-2);font:600 13px var(--ui-font);cursor:pointer}
        .voucher-owner-option:hover{background:var(--bg-hover)}
        .voucher-owner-option.active{border-color:var(--brand);background:var(--green-light);color:var(--brand)}
        .voucher-price-field{min-height:40px;display:flex;align-items:center;padding:8px 11px;border:1px solid var(--border);border-radius:8px;background:var(--bg-hover);font-weight:650;color:var(--text-primary)}
        .voucher-format-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
        .voucher-format{min-height:54px;padding:7px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);cursor:pointer;text-align:left}
        .voucher-format.active{border-color:var(--brand);background:var(--green-light)}
        .voucher-format strong{display:block;font-size:12.5px;font-weight:600;color:var(--text-primary)}
        .voucher-format span{display:block;margin-top:2px;font:12px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--text-muted)}
        .voucher-review{border:1px solid var(--border);border-radius:9px;overflow:hidden}
        .voucher-review-row{display:grid;grid-template-columns:150px 1fr;gap:14px;padding:10px 12px;border-bottom:1px solid var(--border-soft)}
        .voucher-review-row:last-child{border-bottom:0}
        .voucher-review-row span{font-size:12.5px;color:var(--text-muted)}
        .voucher-review-row strong{font-size:13.5px;font-weight:600;color:var(--text-primary);overflow-wrap:anywhere}
        .voucher-wizard-actions{display:flex;justify-content:space-between;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid var(--border)}
        .voucher-error{margin:12px 0 0;color:var(--danger-fg);font-size:12.5px;font-weight:600}
        .voucher-result-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
        .voucher-result-title{font-size:14px;font-weight:650;color:var(--text-primary);overflow-wrap:anywhere}
        .voucher-result-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px;color:var(--text-muted);font-size:12px}
        .voucher-template-select{width:170px;flex:0 0 auto}
        .voucher-pdf-preview{width:100%;height:48vh;min-height:360px;border:1px solid var(--border);border-radius:9px;background:#eef1f5}
        .voucher-result-actions{display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap;margin-top:12px}
        .voucher-result-actions-main{display:flex;gap:8px;flex-wrap:wrap}
        .voucher-result-message{margin-top:9px;color:var(--text-2);font-size:12.5px}
        @media(max-width:700px){.voucher-issue-launcher{padding:14px;align-items:center}.voucher-wizard-grid{grid-template-columns:1fr}.voucher-wizard-full{grid-column:auto}.voucher-format-grid{grid-template-columns:1fr 1fr}.voucher-review-row{grid-template-columns:110px 1fr}.voucher-wizard-actions .btn{flex:1}.voucher-result-head{display:block}.voucher-template-select{width:100%;margin-top:10px}.voucher-pdf-preview{height:52vh;min-height:320px}.voucher-result-actions,.voucher-result-actions-main{display:grid;grid-template-columns:1fr;width:100%}.voucher-result-actions .btn{width:100%}}
        @media(max-width:420px){.voucher-issue-launcher{align-items:flex-start;flex-direction:column}.voucher-issue-launcher .btn{width:100%}.voucher-wizard-step span:last-child{display:none}.voucher-review-row{grid-template-columns:1fr;gap:2px}}
      `}</style>

      <h2>Issue voucher batch</h2>
      <button type="button" className="btn btn-primary" onClick={openFlow}>Issue vouchers</button>

      <Modal open={open} title={createdBatch ? 'Voucher batch ready' : 'Issue voucher batch'} onClose={closeFlow} width={createdBatch ? 960 : 720}>
        {createdBatch ? (
          <div>
            <div className="voucher-result-head">
              <div>
                <div className="voucher-result-title">{createdBatch.batchNumber}</div>
                <div className="voucher-result-meta">
                  <span>{createdBatch.quantity.toLocaleString()} vouchers</span>
                  <span>•</span>
                  <span>{createdBatch.package.name}</span>
                  <span>•</span>
                  <span>{createdBatch.agent ? `${createdBatch.agent.name}${createdBatch.agent.territory ? ` · ${createdBatch.agent.territory}` : ''}` : 'Main / Owner'}</span>
                </div>
              </div>
              <select className="form-input voucher-template-select" value={pdfTemplate} onChange={(event) => setPdfTemplate(event.target.value as PdfTemplate)} aria-label="Voucher PDF design">
                {pdfTemplates.map((template) => <option key={template.value} value={template.value}>{template.label}</option>)}
              </select>
            </div>

            <iframe key={`${createdBatch.id}-${pdfTemplate}`} className="voucher-pdf-preview" src={previewUrl} title={`Preview ${createdBatch.batchNumber}`} />

            <div className="voucher-result-actions">
              <button type="button" className="btn btn-ghost" onClick={closeFlow}>Done</button>
              <div className="voucher-result-actions-main">
                {createdBatch.qrUrl && <a className="btn btn-ghost" href={createdBatch.qrUrl} target="_blank" rel="noreferrer">Test first QR</a>}
                <a className="btn btn-ghost" href={downloadUrl}>Download PDF</a>
                <button type="button" className="btn btn-primary" onClick={() => void sharePdf()} disabled={sharing}>
                  {sharing ? 'Preparing…' : 'Share PDF · WhatsApp / email'}
                </button>
              </div>
            </div>
            {resultMessage && <div className="voucher-result-message">{resultMessage}</div>}
          </div>
        ) : (
          <>
            <div className="voucher-wizard-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
              {steps.map((label, index) => (
                <div key={label} className={`voucher-wizard-step ${index === step ? 'active' : ''}`}>
                  <span className="voucher-step-number">{index + 1}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <form onSubmit={submit}>
              {loading && <p>Loading…</p>}

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

                  <div className="form-group voucher-wizard-full">
                    <label className="form-label">Stock owner</label>
                    <div className="voucher-owner-options">
                      <button type="button" className={`voucher-owner-option ${stockOwnerType === 'MAIN' ? 'active' : ''}`} onClick={() => { setStockOwnerType('MAIN'); setAgentId('') }}>Main / Owner</button>
                      <button type="button" className={`voucher-owner-option ${stockOwnerType === 'AGENT' ? 'active' : ''}`} onClick={() => setStockOwnerType('AGENT')}>Assign to agent</button>
                    </div>
                  </div>

                  {stockOwnerType === 'AGENT' && (
                    <div className="form-group voucher-wizard-full">
                      <label className="form-label">Agent</label>
                      <select className="form-input" value={agentId} onChange={(event) => setAgentId(event.target.value)} required>
                        <option value="">Select agent</option>
                        {availableAgents.map((agent) => (
                          <option key={agent.id} value={agent.id}>{agent.code} — {agent.name}{agent.territory ? ` (${agent.territory})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {!loading && step === 1 && (
                <div className="voucher-wizard-grid">
                  <div className="form-group voucher-wizard-full">
                    <label className="form-label">Package</label>
                    <select className="form-input" value={packageId} onChange={(event) => setPackageId(event.target.value)} required>
                      <option value="">Select package</option>
                      {availablePackages.map((item) => {
                        const price = item.activePriceUgx ?? item.prices?.find((entry) => entry.isDefault)?.amountUgx ?? item.prices?.[0]?.amountUgx ?? 0
                        return <option key={item.id} value={item.id}>{item.name} · {formatCurrency(price)}</option>
                      })}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Number of vouchers</label>
                    <input className="form-input" type="number" min={1} max={10000} value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Package price</label>
                    <div className="voucher-price-field">{packageId ? formatCurrency(packagePrice) : 'Select package'}</div>
                  </div>

                  <div className="form-group voucher-wizard-full">
                    <label className="form-label">Code format</label>
                    <div className="voucher-format-grid">
                      {codeFormats.map((format) => (
                        <button type="button" key={format.value} className={`voucher-format ${codeFormat === format.value ? 'active' : ''}`} onClick={() => setCodeFormat(format.value)}>
                          <strong>{format.label}</strong>
                          <span>{format.example}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Code length</label>
                    <select className="form-input" value={codeLength} onChange={(event) => setCodeLength(event.target.value)}>
                      {[6, 8, 10, 12, 16, 20, 24].map((length) => <option key={length} value={length}>{length} characters</option>)}
                    </select>
                  </div>
                </div>
              )}

              {!loading && step === 2 && (
                <div className="voucher-wizard-grid">
                  <div className="form-group">
                    <label className="form-label">Expiry date</label>
                    <input className="form-input" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
                  </div>
                  <div className="form-group voucher-wizard-full">
                    <label className="form-label">Note</label>
                    <textarea className="form-input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
                  </div>
                </div>
              )}

              {!loading && step === 3 && (
                <div className="voucher-review">
                  <div className="voucher-review-row"><span>Business</span><strong>{selectedTenant?.name ?? '—'}</strong></div>
                  <div className="voucher-review-row"><span>Owner</span><strong>{stockOwnerType === 'AGENT' ? `${selectedAgent?.name ?? '—'}${selectedAgent?.territory ? ` · ${selectedAgent.territory}` : ''}` : 'Main / Owner'}</strong></div>
                  <div className="voucher-review-row"><span>Package</span><strong>{selectedPackage?.name ?? '—'} · {formatCurrency(packagePrice)}</strong></div>
                  <div className="voucher-review-row"><span>Vouchers</span><strong>{resolvedQuantity.toLocaleString()}</strong></div>
                  <div className="voucher-review-row"><span>Code</span><strong>{selectedFormat?.label} · {resolvedCodeLength} characters</strong></div>
                  <div className="voucher-review-row"><span>Stock value</span><strong>{formatCurrency(stockValue)}</strong></div>
                  {selectedAgent && <div className="voucher-review-row"><span>Commission</span><strong>{formatCurrency(expectedCommission)}</strong></div>}
                  <div className="voucher-review-row"><span>Expiry</span><strong>{expiresAt || 'No expiry'}</strong></div>
                </div>
              )}

              {error && <p className="voucher-error">{error}</p>}

              <div className="voucher-wizard-actions">
                <button type="button" className="btn btn-ghost" onClick={() => step === 0 ? closeFlow() : setStep((current) => current - 1)} disabled={submitting}>
                  {step === 0 ? 'Cancel' : 'Back'}
                </button>
                {step < steps.length - 1 ? (
                  <button type="button" className="btn btn-primary" onClick={nextStep} disabled={loading}>Continue</button>
                ) : (
                  <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
                    {submitting ? 'Creating…' : stockOwnerType === 'AGENT' ? 'Create & assign' : 'Create vouchers'}
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </Modal>
    </section>
  )
}
