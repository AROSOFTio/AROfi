'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AgentItem, PackageCatalogResponse, VoucherTemplatesResponse, VouchersOverviewResponse } from '@/lib/admin-types'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'
import FormProcessStatus from '@/components/FormProcessStatus'

type FormState = {
  packageId: string
  templateId: string
  codeFormat: 'NUMBERS' | 'MIXED' | 'UPPERCASE_TEXT' | 'LOWERCASE_TEXT'
  codeLength: string
  quantity: string
  faceValueUgx: string
  expiresAt: string
  notes: string
}

const initialForm: FormState = {
  packageId: '',
  templateId: '',
  codeFormat: 'MIXED',
  codeLength: '10',
  quantity: '100',
  faceValueUgx: '',
  expiresAt: '',
  notes: '',
}

const voucherCodeFormats = [
  { value: 'MIXED', label: 'Mixed numbers and text' },
  { value: 'NUMBERS', label: 'Numbers only' },
  { value: 'UPPERCASE_TEXT', label: 'Uppercase text only' },
  { value: 'LOWERCASE_TEXT', label: 'Lowercase text only' },
] as const

function parseOptionalInt(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildBatchFileUrl(batchId: string, templateId = 'agent') {
  const params = new URLSearchParams()
  params.set('template', templateId)
  return `/api/vouchers/batches/${batchId}/print.pdf?${params.toString()}`
}

export default function GenerateAgentVouchersPanel({ agent }: { agent: AgentItem }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(initialForm)
  const [packages, setPackages] = useState<PackageCatalogResponse['items']>([])
  const [templates, setTemplates] = useState<VoucherTemplatesResponse['items']>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [processText, setProcessText] = useState('')

  useEffect(() => {
    if (!open) return
    void loadOptions()
  }, [open])

  const tenantPackages = useMemo(
    () => packages.filter((pkg) => pkg.tenant.id === agent.tenant.id),
    [packages, agent.tenant.id],
  )

  const tenantTemplates = useMemo(
    () => templates.filter((template) => template.tenantId === agent.tenant.id && template.isActive),
    [templates, agent.tenant.id],
  )

  async function loadOptions() {
    setLoading(true)
    setError(null)
    try {
      const [packageData, templateData] = await Promise.all([
        clientFetchApi<PackageCatalogResponse>('/packages'),
        clientFetchApi<VoucherTemplatesResponse>('/vouchers/templates'),
      ])
      setPackages(packageData.items)
      setTemplates(templateData.items)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load voucher options')
    } finally {
      setLoading(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.packageId) {
      setError('Select a package before generating vouchers')
      return
    }

    setSubmitting(true)
    setProcessText(`Generating vouchers for ${agent.name}.`)
    try {
      const batch = await clientPostApi<VouchersOverviewResponse['batches'][number]>('/vouchers/batches', {
        tenantId: agent.tenant.id,
        agentId: agent.id,
        packageId: form.packageId,
        templateId: form.templateId || undefined,
        codeFormat: form.codeFormat,
        codeLength: parseOptionalInt(form.codeLength),
        quantity: parseOptionalInt(form.quantity),
        faceValueUgx: parseOptionalInt(form.faceValueUgx),
        expiresAt: form.expiresAt || undefined,
        notes: form.notes.trim() || `Printed vouchers for ${agent.name}`,
      })

      setProcessText('Opening voucher print sheet.')
      setSuccess('Agent vouchers generated. Print download started.')
      const anchor = document.createElement('a')
      anchor.href = buildBatchFileUrl(batch.id)
      anchor.rel = 'noopener'
      anchor.download = `${agent.code}-vouchers.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setOpen(false)
      setForm(initialForm)
      window.setTimeout(() => window.location.reload(), 1200)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not generate agent vouchers')
    } finally {
      setSubmitting(false)
      setProcessText('')
    }
  }

  return (
    <>
      <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)}>
        Generate Vouchers
      </button>

      {open && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submitting && setOpen(false)}>
          <div className="modal-card wide" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setOpen(false)} disabled={submitting}>Close</button>
            <div className="modal-kicker">Agent voucher stock</div>
            <h2 className="modal-title">Generate Vouchers for {agent.name}</h2>
            <form onSubmit={submit} style={{ marginTop: 18 }}>
              <div className="stats-grid" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Package</label>
                  <select className="form-input" value={form.packageId} onChange={(event) => setForm((previous) => ({ ...previous, packageId: event.target.value }))} required disabled={loading}>
                    <option value="">Select package</option>
                    {tenantPackages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.code}) - {formatCurrency(pkg.activePriceUgx)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Template</label>
                  <select className="form-input" value={form.templateId} onChange={(event) => setForm((previous) => ({ ...previous, templateId: event.target.value }))} disabled={loading}>
                    <option value="">No template</option>
                    {tenantTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Voucher Code Type</label>
                  <select className="form-input" value={form.codeFormat} onChange={(event) => setForm((previous) => ({ ...previous, codeFormat: event.target.value as FormState['codeFormat'] }))}>
                    {voucherCodeFormats.map((format) => (
                      <option key={format.value} value={format.value}>{format.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Voucher Code Length</label>
                  <input className="form-input" type="number" min={6} max={24} value={form.codeLength} onChange={(event) => setForm((previous) => ({ ...previous, codeLength: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Number of Vouchers</label>
                  <input className="form-input" type="number" min={1} value={form.quantity} onChange={(event) => setForm((previous) => ({ ...previous, quantity: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Face Value UGX</label>
                  <input className="form-input" type="number" min={1} value={form.faceValueUgx} onChange={(event) => setForm((previous) => ({ ...previous, faceValueUgx: event.target.value }))} placeholder="Use package price" />
                </div>
                <div className="form-group">
                  <label className="form-label">Expires At</label>
                  <input className="form-input" type="date" value={form.expiresAt} onChange={(event) => setForm((previous) => ({ ...previous, expiresAt: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="form-input" value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder={`Printed vouchers for ${agent.name}`} />
                </div>
              </div>
              <FormProcessStatus busy={submitting || loading} error={error} success={success} text={processText || 'Generate vouchers attached to this agent, then print the current voucher sheet.'} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button className="secondary-button" type="button" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
                <button className="primary-button" type="submit" disabled={submitting || loading}>{submitting ? 'Generating...' : 'Generate and Print'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
