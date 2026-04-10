'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  PackageCatalogResponse,
  TenantOverviewResponse,
  VoucherTemplatesResponse,
  VouchersOverviewResponse,
} from '@/lib/admin-types'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'

type TemplateFormState = {
  tenantId: string
  packageId: string
  name: string
  code: string
  prefix: string
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
  prefix: string
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
  prefix: '',
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
  prefix: '',
  quantity: '100',
  faceValueUgx: '',
  expiresAt: '',
  notes: '',
}

function parseOptionalInt(value: string) {
  if (!value.trim()) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
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
    setSuccess(null)

    if (!templateForm.tenantId) {
      setError('Select a tenant before creating a voucher template')
      return
    }

    setSubmittingTemplate(true)

    try {
      await clientPostApi('/vouchers/templates', {
        tenantId: templateForm.tenantId,
        packageId: templateForm.packageId || undefined,
        name: templateForm.name.trim(),
        code: templateForm.code.trim().toUpperCase(),
        prefix: templateForm.prefix.trim().toUpperCase(),
        defaultQuantity: parseOptionalInt(templateForm.defaultQuantity),
        faceValueUgx: parseOptionalInt(templateForm.faceValueUgx),
        expiresAfterDays: parseOptionalInt(templateForm.expiresAfterDays),
        isDefault: templateForm.isDefault,
        isActive: templateForm.isActive,
        notes: templateForm.notes.trim() || undefined,
      })

      setSuccess('Voucher template created successfully')
      setTemplateForm((previous) => ({
        ...initialTemplateForm,
        tenantId: previous.tenantId,
      }))
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create template')
    } finally {
      setSubmittingTemplate(false)
    }
  }

  async function handleBatchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!batchForm.tenantId || !batchForm.packageId) {
      setError('Select tenant and package before generating vouchers')
      return
    }

    setSubmittingBatch(true)

    try {
      await clientPostApi('/vouchers/batches', {
        tenantId: batchForm.tenantId,
        packageId: batchForm.packageId,
        templateId: batchForm.templateId || undefined,
        prefix: batchForm.prefix.trim() || undefined,
        quantity: parseOptionalInt(batchForm.quantity),
        faceValueUgx: parseOptionalInt(batchForm.faceValueUgx),
        expiresAt: batchForm.expiresAt || undefined,
        notes: batchForm.notes.trim() || undefined,
      })

      setSuccess('Voucher batch generated successfully')
      setBatchForm((previous) => ({
        ...initialBatchForm,
        tenantId: previous.tenantId,
      }))
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to generate voucher batch')
    } finally {
      setSubmittingBatch(false)
    }
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
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Create Voucher Template</span>
        </div>
        <div className="content" style={{ paddingTop: 16 }}>
          <form onSubmit={handleTemplateSubmit}>
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
                <label className="form-label">Voucher Prefix</label>
                <input className="form-input" value={templateForm.prefix} onChange={(event) => setTemplateForm((previous) => ({ ...previous, prefix: event.target.value.toUpperCase() }))} placeholder="DAY" required />
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
                {submittingTemplate ? 'Saving...' : 'Create Template'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Generate Voucher Batch</span>
        </div>
        <div className="content" style={{ paddingTop: 16 }}>
          <form onSubmit={handleBatchSubmit}>
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
                      {template.name} ({template.prefix})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Prefix</label>
                <input className="form-input" value={batchForm.prefix} onChange={(event) => setBatchForm((previous) => ({ ...previous, prefix: event.target.value.toUpperCase() }))} placeholder="AUTO when template is set" />
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
            <button type="submit" className="btn btn-primary" disabled={submittingBatch}>
              {submittingBatch ? 'Generating...' : 'Generate Vouchers'}
            </button>
          </form>
          {error && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
          {success && <p style={{ color: 'var(--success-fg)', marginTop: 10, fontSize: 13 }}>{success}</p>}
        </div>
      </div>

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
                <th>Prefix</th>
                <th>Default Qty</th>
                <th>Face Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>Loading templates...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && templateItems.length === 0 && (
                <tr>
                  <td colSpan={7}>
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
                  <td>{template.prefix}</td>
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
              </tr>
            </thead>
            <tbody>
              {!loading && voucherBatches.length === 0 && (
                <tr>
                  <td colSpan={9}>
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
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{batch.prefix}</div>
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
    </>
  )
}
