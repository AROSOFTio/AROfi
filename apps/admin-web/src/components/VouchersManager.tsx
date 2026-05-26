'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  PackageCatalogResponse,
  TenantOverviewResponse,
  VoucherTemplatesResponse,
  VouchersOverviewResponse,
} from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, formatDuration, getStatusBadgeClass } from '@/lib/format'

type TemplateFormState = {
  tenantId: string
  packageId: string
  name: string
  code: string
  defaultQuantity: string
  faceValueUgx: string
  expiresAfterDays: string
  isDefault: boolean
  isActive: boolean
  notes: string
}

type BatchFormState = {
  tenantId: string
  packageId: string
  templateId: string
  codeFormat: 'NUMBERS' | 'MIXED' | 'UPPERCASE_TEXT' | 'LOWERCASE_TEXT'
  codeLength: string
  quantity: string
  faceValueUgx: string
  expiresAt: string
  notes: string
}

const initialTemplateForm: TemplateFormState = {
  tenantId: '',
  packageId: '',
  name: '',
  code: '',
  defaultQuantity: '100',
  faceValueUgx: '',
  expiresAfterDays: '',
  isDefault: false,
  isActive: true,
  notes: '',
}

const initialBatchForm: BatchFormState = {
  tenantId: '',
  packageId: '',
  templateId: '',
  codeFormat: 'MIXED',
  codeLength: '10',
  quantity: '100',
  faceValueUgx: '',
  expiresAt: '',
  notes: '',
}

const printTemplates = [
  {
    id: 'signal',
    name: 'Signal Card',
    description: 'Original AROFi card with signal bar, bold code block, and scan-first layout.',
    color: '#10B981',
    dark: '#047857',
    bg: '#F0FDF4',
    ink: '#0F172A',
    muted: '#64748B',
  },
  {
    id: 'wave',
    name: 'Wave Ticket',
    description: 'Flowing ticket style for premium hotspot batches and front-desk sales.',
    color: '#38BDF8',
    dark: '#075985',
    bg: '#EFF6FF',
    ink: '#020617',
    muted: '#475569',
  },
  {
    id: 'receipt',
    name: 'Clean Receipt',
    description: 'Receipt-like print with clear amount, duration, help contact, and QR code.',
    color: '#2563EB',
    dark: '#1E3A8A',
    bg: '#EEF2FF',
    ink: '#0F172A',
    muted: '#64748B',
  },
  {
    id: 'agent',
    name: 'Agent Strip',
    description: 'Field-agent strip with quick tear visual cues and compact support details.',
    color: '#F59E0B',
    dark: '#92400E',
    bg: '#FFFBEB',
    ink: '#1C1917',
    muted: '#78716C',
  },
  {
    id: 'thermal',
    name: 'Mini Thermal',
    description: 'Low-ink mini ticket for thermal-style counter printing.',
    color: '#111827',
    dark: '#030712',
    bg: '#F8FAFC',
    ink: '#0F172A',
    muted: '#64748B',
  },
]

const voucherCodeFormats = [
  {
    value: 'MIXED',
    label: 'Mixed numbers and text',
    hint: 'Random uppercase letters and numbers, best for most vendors.',
  },
  {
    value: 'NUMBERS',
    label: 'Numbers only',
    hint: 'Digits only, easier to type on phones.',
  },
  {
    value: 'UPPERCASE_TEXT',
    label: 'Uppercase text only',
    hint: 'Random capital letters only.',
  },
  {
    value: 'LOWERCASE_TEXT',
    label: 'Lowercase text only',
    hint: 'Random lowercase letters only.',
  },
] as const

type PrintTemplate = (typeof printTemplates)[number]

function parseOptionalInt(value: string) {
  if (!value.trim()) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getVoucherPortalOrigin() {
  const origin = typeof window === 'undefined' ? 'https://arofi.arosoft.io' : window.location.origin
  return origin.replace(/\/$/, '')
}

function getVoucherPortalHost() {
  try {
    return new URL(getVoucherPortalOrigin()).host
  } catch {
    return getVoucherPortalOrigin().replace(/^https?:\/\//, '')
  }
}

function getVoucherQrPortalUrl(code: string) {
  const configuredBase = process.env.NEXT_PUBLIC_VOUCHER_QR_BASE_URL ?? `${getVoucherPortalOrigin()}/portal`
  const withProtocol = configuredBase.startsWith('http://') || configuredBase.startsWith('https://')
    ? configuredBase
    : `http://${configuredBase}`
  const normalized = withProtocol.replace(/\/$/, '')
  const baseUrl = normalized.endsWith('/portal') ? normalized : `${normalized}/portal`
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}voucher=${encodeURIComponent(code)}`
}

function formatVoucherSupport(phone?: string | null, email?: string | null) {
  return [phone, email].filter((value): value is string => Boolean(value?.trim())).join(' - ') || 'Contact venue staff'
}

export default function VouchersManager() {
  const [overview, setOverview] = useState<VouchersOverviewResponse | null>(null)
  const [templates, setTemplates] = useState<VoucherTemplatesResponse | null>(null)
  const [packages, setPackages] = useState<PackageCatalogResponse['items']>([])
  const [tenants, setTenants] = useState<TenantOverviewResponse['items']>([])
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(initialTemplateForm)
  const [batchForm, setBatchForm] = useState<BatchFormState>(initialBatchForm)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submittingTemplate, setSubmittingTemplate] = useState(false)
  const [submittingBatch, setSubmittingBatch] = useState(false)
  const [templateProcessText, setTemplateProcessText] = useState('')
  const [batchProcessText, setBatchProcessText] = useState('')
  const [templateFormError, setTemplateFormError] = useState<string | null>(null)
  const [batchFormError, setBatchFormError] = useState<string | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [printBatch, setPrintBatch] = useState<VouchersOverviewResponse['batches'][number] | null>(null)
  const [selectedPrintTemplateId, setSelectedPrintTemplateId] = useState(printTemplates[0].id)

  useEffect(() => {
    void loadData()
  }, [])

  const tenantPackages = useMemo(
    () => packages.filter((pkg) => pkg.tenant.id === batchForm.tenantId),
    [packages, batchForm.tenantId],
  )

  const templatePackages = useMemo(
    () => packages.filter((pkg) => pkg.tenant.id === templateForm.tenantId),
    [packages, templateForm.tenantId],
  )

  const tenantTemplates = useMemo(
    () => (templates?.items ?? []).filter((template) => template.tenantId === batchForm.tenantId && template.isActive),
    [templates, batchForm.tenantId],
  )

  async function loadData() {
    try {
      setLoading(true)
      const [overviewData, templateData, packageData, tenantData] = await Promise.all([
        clientFetchApi<VouchersOverviewResponse>('/vouchers/overview'),
        clientFetchApi<VoucherTemplatesResponse>('/vouchers/templates'),
        clientFetchApi<PackageCatalogResponse>('/packages'),
        clientFetchApi<TenantOverviewResponse>('/tenants'),
      ])

      setOverview(overviewData)
      setTemplates(templateData)
      setPackages(packageData.items)
      setTenants(tenantData.items)

      const defaultTenantId = tenantData.items[0]?.id ?? ''
      if (!templateForm.tenantId && defaultTenantId) {
        setTemplateForm((previous) => ({ ...previous, tenantId: defaultTenantId }))
      }
      if (!batchForm.tenantId && defaultTenantId) {
        setBatchForm((previous) => ({ ...previous, tenantId: defaultTenantId }))
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load voucher data')
    } finally {
      setLoading(false)
    }
  }

  async function handleTemplateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setTemplateFormError(null)
    setSuccess(null)

    if (!templateForm.tenantId) {
      const failure = 'Select a tenant before creating a voucher template'
      setError(failure)
      setTemplateFormError(failure)
      return
    }

    setSubmittingTemplate(true)
    setTemplateProcessText('Creating voucher template for this tenant.')

    try {
      await clientPostApi('/vouchers/templates', {
        tenantId: templateForm.tenantId,
        packageId: templateForm.packageId || undefined,
        name: templateForm.name.trim(),
        code: templateForm.code.trim().toUpperCase(),
        defaultQuantity: parseOptionalInt(templateForm.defaultQuantity),
        faceValueUgx: parseOptionalInt(templateForm.faceValueUgx),
        expiresAfterDays: parseOptionalInt(templateForm.expiresAfterDays),
        isDefault: templateForm.isDefault,
        isActive: templateForm.isActive,
        notes: templateForm.notes.trim() || undefined,
      })

      setTemplateProcessText('Refreshing voucher templates.')
      setSuccess('Voucher template created successfully')
      setTemplateForm((previous) => ({
        ...initialTemplateForm,
        tenantId: previous.tenantId,
      }))
      await loadData()
      setTemplateModalOpen(false)
    } catch (requestError) {
      const failure = requestError instanceof Error ? requestError.message : 'Unable to create template'
      setError(failure)
      setTemplateFormError(failure)
    } finally {
      setSubmittingTemplate(false)
      setTemplateProcessText('')
    }
  }

  async function handleBatchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBatchFormError(null)
    setSuccess(null)

    if (!batchForm.tenantId || !batchForm.packageId) {
      const failure = 'Select tenant and package before generating vouchers'
      setError(failure)
      setBatchFormError(failure)
      return
    }

    setSubmittingBatch(true)
    setBatchProcessText('Generating voucher codes and reserving the batch.')

    try {
      await clientPostApi('/vouchers/batches', {
        tenantId: batchForm.tenantId,
        packageId: batchForm.packageId,
        templateId: batchForm.templateId || undefined,
        codeFormat: batchForm.codeFormat,
        codeLength: parseOptionalInt(batchForm.codeLength),
        quantity: parseOptionalInt(batchForm.quantity),
        faceValueUgx: parseOptionalInt(batchForm.faceValueUgx),
        expiresAt: batchForm.expiresAt || undefined,
        notes: batchForm.notes.trim() || undefined,
      })

      setBatchProcessText('Refreshing voucher batch list.')
      setSuccess('Voucher batch generated successfully')
      setBatchForm((previous) => ({
        ...initialBatchForm,
        tenantId: previous.tenantId,
      }))
      await loadData()
      setBatchModalOpen(false)
    } catch (requestError) {
      const failure = requestError instanceof Error ? requestError.message : 'Unable to generate voucher batch'
      setError(failure)
      setBatchFormError(failure)
    } finally {
      setSubmittingBatch(false)
      setBatchProcessText('')
    }
  }

  async function downloadBatchFile(batchId: string, type: 'print.pdf' | 'export.csv', templateId?: string) {
    setError(null)
    setSuccess(null)
    const anchor = document.createElement('a')
    anchor.href = buildBatchFileUrl(batchId, type, templateId)
    anchor.rel = 'noopener'
    anchor.download = type.endsWith('pdf') ? 'vouchers.pdf' : 'vouchers.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setSuccess(`${type.endsWith('pdf') ? 'PDF' : 'CSV'} download started.`)
    window.setTimeout(() => void loadData(), 1200)
  }

  function buildBatchFileUrl(batchId: string, type: 'print.pdf' | 'export.csv', templateId?: string, inline = false) {
    const params = new URLSearchParams()
    if (type === 'print.pdf' && templateId) {
      params.set('template', templateId)
    }
    if (type === 'print.pdf' && inline) {
      params.set('disposition', 'inline')
    }
    const query = params.toString()
    return `/api/vouchers/batches/${batchId}/${type}${query ? `?${query}` : ''}`
  }

  const summary = overview?.summary ?? {
    totalGenerated: 0,
    activeUnused: 0,
    redeemed: 0,
    totalVoucherSalesUgx: 0,
  }

  const voucherBatches = overview?.batches ?? []
  const recentRedemptions = overview?.recentRedemptions ?? []
  const templateItems = templates?.items ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Vouchers</h1>
          <p className="page-subtitle">Create voucher templates, generate voucher stock, and monitor redemption activity.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => { setTemplateFormError(null); setTemplateProcessText(''); setTemplateModalOpen(true) }}>
            Create Template
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { setBatchFormError(null); setBatchProcessText(''); setBatchModalOpen(true) }}>
            Generate Vouchers
          </button>
        </div>
      </div>

      {templateModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submittingTemplate && setTemplateModalOpen(false)}>
          <div className="modal-card" style={{ width: 'min(980px, 100%)' }} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setTemplateModalOpen(false)} disabled={submittingTemplate}>Close</button>
            <div className="modal-kicker">Voucher template</div>
            <h2 className="modal-title">Create Voucher Template</h2>
            <form onSubmit={handleTemplateSubmit} style={{ marginTop: 18 }}>
            <div className="stats-grid" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">Tenant</label>
                <select
                  className="form-input"
                  value={templateForm.tenantId}
                  onChange={(event) =>
                    setTemplateForm((previous) => ({
                      ...previous,
                      tenantId: event.target.value,
                      packageId: '',
                    }))
                  }
                  required
                >
                  <option value="">Select tenant</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Package (optional)</label>
                <select className="form-input" value={templateForm.packageId} onChange={(event) => setTemplateForm((previous) => ({ ...previous, packageId: event.target.value }))}>
                  <option value="">Any package</option>
                  {templatePackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({pkg.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Template Name</label>
                <input className="form-input" value={templateForm.name} onChange={(event) => setTemplateForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="Daily Scratch Card" required />
              </div>
              <div className="form-group">
                <label className="form-label">Template Code</label>
                <input className="form-input" value={templateForm.code} onChange={(event) => setTemplateForm((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))} placeholder="DAILY-SCRATCH" required />
              </div>
              <div className="form-group">
                <label className="form-label">Default Quantity</label>
                <input className="form-input" type="number" min={1} value={templateForm.defaultQuantity} onChange={(event) => setTemplateForm((previous) => ({ ...previous, defaultQuantity: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Face Value UGX (optional)</label>
                <input className="form-input" type="number" min={1} value={templateForm.faceValueUgx} onChange={(event) => setTemplateForm((previous) => ({ ...previous, faceValueUgx: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Expiry Days (optional)</label>
                <input className="form-input" type="number" min={1} value={templateForm.expiresAfterDays} onChange={(event) => setTemplateForm((previous) => ({ ...previous, expiresAfterDays: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-input" value={templateForm.notes} onChange={(event) => setTemplateForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Urban kiosks template" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={templateForm.isDefault} onChange={(event) => setTemplateForm((previous) => ({ ...previous, isDefault: event.target.checked }))} />
                Set as tenant default template
              </label>
              <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={templateForm.isActive} onChange={(event) => setTemplateForm((previous) => ({ ...previous, isActive: event.target.checked }))} />
                Active
              </label>
              <button type="submit" className="btn btn-primary" disabled={submittingTemplate}>
                {submittingTemplate ? 'Creating template...' : 'Create Template'}
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <FormProcessStatus busy={submittingTemplate} error={templateFormError} success={success?.includes('template') ? success : null} text={templateProcessText || 'Creating template. Template list refreshes after AROFi saves it.'} />
            </div>
          </form>
          </div>
        </div>
      )}

      {batchModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submittingBatch && setBatchModalOpen(false)}>
          <div className="modal-card" style={{ width: 'min(980px, 100%)' }} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setBatchModalOpen(false)} disabled={submittingBatch}>Close</button>
            <div className="modal-kicker">Voucher batch</div>
            <h2 className="modal-title">Generate Voucher Batch</h2>
            <form onSubmit={handleBatchSubmit} style={{ marginTop: 18 }}>
            <div className="stats-grid" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">Tenant</label>
                <select
                  className="form-input"
                  value={batchForm.tenantId}
                  onChange={(event) =>
                    setBatchForm((previous) => ({
                      ...previous,
                      tenantId: event.target.value,
                      packageId: '',
                      templateId: '',
                    }))
                  }
                  required
                >
                  <option value="">Select tenant</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Package</label>
                <select className="form-input" value={batchForm.packageId} onChange={(event) => setBatchForm((previous) => ({ ...previous, packageId: event.target.value }))} required>
                  <option value="">Select package</option>
                  {tenantPackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({pkg.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Template (optional)</label>
                <select className="form-input" value={batchForm.templateId} onChange={(event) => setBatchForm((previous) => ({ ...previous, templateId: event.target.value }))}>
                  <option value="">No template (manual fields)</option>
                  {tenantTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Voucher Code Type</label>
                <select
                  className="form-input"
                  value={batchForm.codeFormat}
                  onChange={(event) => setBatchForm((previous) => ({ ...previous, codeFormat: event.target.value as BatchFormState['codeFormat'] }))}
                >
                  {voucherCodeFormats.map((format) => (
                    <option key={format.value} value={format.value}>{format.label}</option>
                  ))}
                </select>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  {voucherCodeFormats.find((format) => format.value === batchForm.codeFormat)?.hint}
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Voucher Code Length</label>
                <input className="form-input" type="number" min={6} max={24} value={batchForm.codeLength} onChange={(event) => setBatchForm((previous) => ({ ...previous, codeLength: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input className="form-input" type="number" min={1} value={batchForm.quantity} onChange={(event) => setBatchForm((previous) => ({ ...previous, quantity: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Face Value UGX (optional override)</label>
                <input className="form-input" type="number" min={1} value={batchForm.faceValueUgx} onChange={(event) => setBatchForm((previous) => ({ ...previous, faceValueUgx: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Expires At (optional)</label>
                <input className="form-input" type="date" value={batchForm.expiresAt} onChange={(event) => setBatchForm((previous) => ({ ...previous, expiresAt: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-input" value={batchForm.notes} onChange={(event) => setBatchForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Batch for city center outlets" />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <FormProcessStatus busy={submittingBatch} error={batchFormError} success={success?.includes('batch') ? success : null} text={batchProcessText || 'Generating vouchers. The batch list refreshes after AROFi saves it.'} />
              <button type="submit" className="btn btn-primary" disabled={submittingBatch}>
                {submittingBatch ? 'Generating vouchers...' : 'Generate Vouchers'}
              </button>
            </div>
            </form>
          {error && !templateFormError && !batchFormError && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
          {success && !success.includes('template') && !success.includes('batch') && <p style={{ color: 'var(--success-fg)', marginTop: 10, fontSize: 13 }}>{success}</p>}
          </div>
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Generated', value: `${summary.totalGenerated}`, color: 'blue' },
          { label: 'Active / Unused', value: `${summary.activeUnused}`, color: 'green' },
          { label: 'Redeemed', value: `${summary.redeemed}`, color: 'amber' },
          { label: 'Voucher Sales', value: formatCurrency(summary.totalVoucherSalesUgx), color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Voucher Templates</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Template</th>
                <th>Tenant</th>
                <th>Package</th>
                <th>Default Qty</th>
                <th>Face Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>Loading templates...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && templateItems.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No voucher templates created yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {templateItems.map((template) => (
                <tr key={template.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{template.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{template.code}</div>
                  </td>
                  <td>{template.tenant.name}</td>
                  <td>{template.package?.name ?? 'Any package'}</td>
                  <td>{template.defaultQuantity}</td>
                  <td>{formatCurrency(template.faceValueUgx ?? 0)}</td>
                  <td>
                    <span className={getStatusBadgeClass(template.isActive ? 'ACTIVE' : 'DISABLED')}>
                      {template.isActive ? (template.isDefault ? 'default' : 'active') : 'disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Voucher Batches</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Tenant</th>
                <th>Package</th>
                <th>Qty</th>
                <th>Face Value</th>
                <th>Remaining</th>
                <th>Redeemed</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && voucherBatches.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      <p>No voucher batches generated yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {voucherBatches.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{batch.batchNumber}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Random {batch.prefix.toLowerCase()} codes</div>
                  </td>
                  <td>{batch.tenant.name}</td>
                  <td>{batch.package.name}</td>
                  <td>{batch.quantity}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(batch.faceValueUgx)}</td>
                  <td>{batch.remainingCount}</td>
                  <td>{batch.redeemedCount}</td>
                  <td>
                    <span className={getStatusBadgeClass(batch.status)}>{batch.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(batch.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setSelectedPrintTemplateId(printTemplates[0].id)
                          setPrintBatch(batch)
                        }}
                      >
                        Print PDF
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => void downloadBatchFile(batch.id, 'export.csv')}>CSV</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Redemptions</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Package</th>
                <th>Hotspot</th>
                <th>Customer</th>
                <th>Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {recentRedemptions.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p>No voucher redemptions recorded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {recentRedemptions.map((redemption) => (
                <tr key={redemption.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{redemption.voucher.code}</td>
                  <td>{redemption.package.name}</td>
                  <td>{redemption.hotspot?.name ?? 'Portal'}</td>
                  <td>{redemption.customerReference ?? 'Anonymous'}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(redemption.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {printBatch && (
        <div className="modal-overlay" role="dialog" aria-modal="true" style={{ background: 'rgba(15, 23, 42, 0.52)' }}>
          <div
            className="modal-card"
            style={{
              width: 'min(1220px, calc(100vw - 32px))',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#fffffb',
              boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)',
            }}
          >
            <button type="button" className="modal-close" onClick={() => setPrintBatch(null)}>Close</button>
            <div className="modal-kicker">Voucher Print Sheet</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <h2 className="modal-title">Preview AROFi PDF Template</h2>
                <p className="page-subtitle" style={{ marginBottom: 0 }}>
                  {printBatch.batchNumber} uses real voucher codes from this batch. Scan QR to open the portal with the voucher ready.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void downloadBatchFile(printBatch.id, 'print.pdf', selectedPrintTemplateId)}
              >
                Download PDF
              </button>
            </div>
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>
                Showing all {printBatch.previewVouchers.length} generated vouchers in this batch. Download PDF prints this same voucher sheet.
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  overflowX: 'auto',
                  paddingBottom: 4,
                }}
              >
                {printTemplates.map((template) => {
                  const selected = selectedPrintTemplateId === template.id
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className="card"
                      style={{
                        cursor: 'pointer',
                        padding: 14,
                        minWidth: 210,
                        textAlign: 'left',
                        borderColor: selected ? template.color : 'var(--border)',
                        borderLeft: `5px solid ${template.color}`,
                        borderTop: '1px solid var(--border)',
                        background: selected ? '#f8fffb' : '#fffffb',
                        boxShadow: selected ? '0 10px 24px rgba(15, 23, 42, 0.08)' : undefined,
                      }}
                      onClick={() => setSelectedPrintTemplateId(template.id)}
                    >
                      <div style={{ color: 'var(--text-1)', fontWeight: 800, marginBottom: 6 }}>
                        {template.name}
                      </div>
                      <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
                        {template.description}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="voucher-preview-sheet">
                {printBatch.previewVouchers.map((voucher) => (
                  <VoucherSampleCard
                    key={voucher.id}
                    compact
                    tenantName={printBatch.tenant.name}
                    code={voucher.code}
                    packageName={printBatch.package.name}
                    duration={formatDuration(printBatch.package.durationMinutes)}
                    amount={formatCurrency(printBatch.faceValueUgx)}
                    support={formatVoucherSupport(printBatch.tenant.supportPhone, printBatch.tenant.supportEmail)}
                    portalHost={getVoucherPortalHost()}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function VoucherSampleCard({
  tenantName,
  code,
  packageName,
  duration,
  amount,
  support,
  portalHost,
  compact = false,
}: {
  tenantName: string
  code: string
  packageName: string
  duration: string
  amount: string
  support: string
  portalHost: string
  compact?: boolean
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  useEffect(() => {
    let active = true
    const portalUrl = getVoucherQrPortalUrl(code)

    void QRCode.toDataURL(portalUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 160,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    }).then((nextUrl) => {
      if (active) {
        setQrDataUrl(nextUrl)
      }
    })

    return () => {
      active = false
    }
  }, [code])

  return (
    <div className={`voucher-sample${compact ? ' voucher-sample--sheet' : ''}`}>
      <div className="voucher-sample-rail">
        {Array.from({ length: 5 }).map((_, index) => <span key={index} />)}
      </div>
      <div className="voucher-sample-body">
        <div className="voucher-sample-tenant">{tenantName}</div>
        <div className="voucher-sample-code-row">
          <span className="voucher-sample-user" aria-hidden="true"><span /></span>
          <strong>{code}</strong>
        </div>
        <div className="voucher-sample-rule" />
        <div className="voucher-sample-grid">
          <div><span>PACKAGE</span>{packageName}</div>
          <div><span>PRICE</span>{amount}</div>
          <div><span>DURATION</span>{duration}</div>
          <div><span>HELP</span>{portalHost}</div>
        </div>
        <div className="voucher-sample-help">Help: {support} | {portalHost}</div>
      </div>
      <div className="voucher-sample-qr">
        {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for voucher ${code}`} /> : null}
      </div>
    </div>
  )
}
