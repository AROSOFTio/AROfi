'use client'

import { FormEvent, useEffect, useState } from 'react'
import { PackageCatalogResponse, TenantOverviewResponse } from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { DurationInput } from '@/components/DurationInput'
import { clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDuration } from '@/lib/format'

type PackageFormState = {
  tenantId: string
  name: string
  code: string
  description: string
  durationMinutes: string
  dataLimitMb: string
  deviceLimit: string
  downloadSpeedKbps: string
  uploadSpeedKbps: string
  initialPriceUgx: string
  isFeatured: boolean
}

const initialFormState: PackageFormState = {
  tenantId: '',
  name: '',
  code: '',
  description: '',
  durationMinutes: '60',
  dataLimitMb: '',
  deviceLimit: '1',
  downloadSpeedKbps: '',
  uploadSpeedKbps: '',
  initialPriceUgx: '1000',
  isFeatured: false,
}

function parseOptionalInt(value: string) {
  if (!value.trim()) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export default function PackagesManager() {
  const [catalog, setCatalog] = useState<PackageCatalogResponse | null>(null)
  const [tenants, setTenants] = useState<TenantOverviewResponse['items']>([])
  const [formState, setFormState] = useState<PackageFormState>(initialFormState)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [processText, setProcessText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function startEdit(item: PackageCatalogResponse['items'][number]) {
    setError(null)
    setFormError(null)
    setSuccess(null)
    setProcessText('')
    setEditingId(item.id)
    setFormState({
      tenantId: item.tenant.id,
      name: item.name,
      code: item.code,
      description: item.description ?? '',
      durationMinutes: String(item.durationMinutes),
      dataLimitMb: item.dataLimitMb != null ? String(item.dataLimitMb) : '',
      deviceLimit: item.deviceLimit != null ? String(item.deviceLimit) : '',
      downloadSpeedKbps: item.downloadSpeedKbps != null ? String(item.downloadSpeedKbps) : '',
      uploadSpeedKbps: item.uploadSpeedKbps != null ? String(item.uploadSpeedKbps) : '',
      initialPriceUgx: String(item.activePriceUgx),
      isFeatured: item.isFeatured,
    })
    setCreateOpen(true)
  }

  function startCreate() {
    setEditingId(null)
    setFormError(null)
    setProcessText('')
    setFormState((previous) => ({ ...initialFormState, tenantId: previous.tenantId }))
    setCreateOpen(true)
  }

  const items = catalog?.items ?? []

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [catalogData, tenantData] = await Promise.all([
        clientFetchApi<PackageCatalogResponse>('/packages'),
        clientFetchApi<TenantOverviewResponse>('/tenants'),
      ])

      setCatalog(catalogData)
      setTenants(tenantData.items)
      if (!formState.tenantId && tenantData.items[0]) {
        setFormState((previous) => ({ ...previous, tenantId: tenantData.items[0].id }))
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load package data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFormError(null)
    setSuccess(null)

    if (!formState.tenantId) {
      const failure = 'Select a tenant before creating a package'
      setError(failure)
      setFormError(failure)
      return
    }

    setSubmitting(true)
    setProcessText(editingId ? 'Saving package changes.' : 'Creating package with server-side pricing and limits.')

    try {
      if (editingId) {
        await clientPatchApi(`/packages/${editingId}`, {
          name: formState.name.trim(),
          description: formState.description.trim() || undefined,
          durationMinutes: Number.parseInt(formState.durationMinutes, 10),
          dataLimitMb: parseOptionalInt(formState.dataLimitMb),
          deviceLimit: parseOptionalInt(formState.deviceLimit),
          downloadSpeedKbps: parseOptionalInt(formState.downloadSpeedKbps),
          uploadSpeedKbps: parseOptionalInt(formState.uploadSpeedKbps),
          priceUgx: Number.parseInt(formState.initialPriceUgx, 10),
          isFeatured: formState.isFeatured,
        })
      } else {
        await clientPostApi('/packages', {
          tenantId: formState.tenantId,
          name: formState.name.trim(),
          code: formState.code.trim().toUpperCase(),
          description: formState.description.trim() || undefined,
          durationMinutes: Number.parseInt(formState.durationMinutes, 10),
          dataLimitMb: parseOptionalInt(formState.dataLimitMb),
          deviceLimit: parseOptionalInt(formState.deviceLimit),
          downloadSpeedKbps: parseOptionalInt(formState.downloadSpeedKbps),
          uploadSpeedKbps: parseOptionalInt(formState.uploadSpeedKbps),
          initialPriceUgx: Number.parseInt(formState.initialPriceUgx, 10),
          isFeatured: formState.isFeatured,
          status: 'ACTIVE',
        })
      }

      setProcessText('Refreshing package catalog.')
      setSuccess(editingId ? 'Package updated successfully' : 'Package created successfully')
      setEditingId(null)
      setFormState({
        ...initialFormState,
        tenantId: formState.tenantId,
      })
      await loadData()
      setCreateOpen(false)
    } catch (requestError) {
      const failure = requestError instanceof Error ? requestError.message : editingId ? 'Unable to update package' : 'Unable to create package'
      setError(failure)
      setFormError(failure)
    } finally {
      setSubmitting(false)
      setProcessText('')
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manage Packages</h1>
          <p className="page-subtitle">Create and manage your Hotspot packages and PPPoE subscription plans.</p>
        </div>
      </div>

      {createOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submitting && setCreateOpen(false)}>
          <div className="modal-card" style={{ width: 'min(980px, 100%)' }} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setCreateOpen(false)} disabled={submitting}>Close</button>
            <div className="modal-kicker">Package catalog</div>
            <h2 className="modal-title">{editingId ? 'Edit Package' : 'Create Package'}</h2>
            <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Tenant</label>
                <select
                  className="form-input"
                  value={formState.tenantId}
                  onChange={(event) => setFormState((previous) => ({ ...previous, tenantId: event.target.value }))}
                  required
                  disabled={Boolean(editingId)}
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
                <label className="form-label">Package Name</label>
                <input className="form-input" value={formState.name} onChange={(event) => setFormState((previous) => ({ ...previous, name: event.target.value }))} placeholder="Starter 2 Hours" required />
              </div>
              <div className="form-group">
                <label className="form-label">Code</label>
                <input className="form-input" value={formState.code} onChange={(event) => setFormState((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))} placeholder="STARTER-2H" required disabled={Boolean(editingId)} />
              </div>
              <div className="form-group">
                <label className="form-label">Duration</label>
                <DurationInput
                  key={editingId ?? 'create'}
                  valueMinutes={formState.durationMinutes}
                  onChangeMinutes={(minutes) => setFormState((previous) => ({ ...previous, durationMinutes: minutes }))}
                  inputClassName="form-input"
                  selectClassName="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Initial Price (UGX)</label>
                <input className="form-input" type="number" min={1} value={formState.initialPriceUgx} onChange={(event) => setFormState((previous) => ({ ...previous, initialPriceUgx: event.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Data Limit MB (optional)</label>
                <input className="form-input" type="number" min={1} value={formState.dataLimitMb} onChange={(event) => setFormState((previous) => ({ ...previous, dataLimitMb: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Max devices per session</label>
                <select
                  className="form-input"
                  value={formState.deviceLimit}
                  onChange={(event) => setFormState((previous) => ({ ...previous, deviceLimit: event.target.value }))}
                >
                  <option value="1">1 device — no sharing (default)</option>
                  <option value="2">2 devices — couple / family</option>
                  <option value="3">3 devices</option>
                  <option value="4">4 devices</option>
                  <option value="5">5 devices — max allowed</option>
                </select>
                {Number(formState.deviceLimit) > 1 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Only the device that pays or redeems connects automatically. The other {Number(formState.deviceLimit) - 1} device{Number(formState.deviceLimit) > 2 ? 's' : ''} get a short-lived bonus voucher code to share — each works on one device only.
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Download Kbps (optional)</label>
                <input className="form-input" type="number" min={1} value={formState.downloadSpeedKbps} onChange={(event) => setFormState((previous) => ({ ...previous, downloadSpeedKbps: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Upload Kbps (optional)</label>
                <input className="form-input" type="number" min={1} value={formState.uploadSpeedKbps} onChange={(event) => setFormState((previous) => ({ ...previous, uploadSpeedKbps: event.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={formState.description} onChange={(event) => setFormState((previous) => ({ ...previous, description: event.target.value }))} placeholder="Fast daily hotspot access for commuters." />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
              <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={formState.isFeatured} onChange={(event) => setFormState((previous) => ({ ...previous, isFeatured: event.target.checked }))} />
                Mark as featured
              </label>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Create Package'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setFormState((previous) => ({ ...initialFormState, tenantId: previous.tenantId }))}>
                Reset
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <FormProcessStatus busy={submitting} error={formError} success={success} text={processText || 'Creating package. The catalog refreshes after AROFi saves it.'} />
            </div>
            {error && !formError && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
            </form>
          </div>
        </div>
      )}

      <div className="table-toolbar">
        <input className="form-input" placeholder="Filter packages..." style={{ width: 244 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            + Create Package
          </button>
          <button type="button" className="btn btn-ghost">Columns v</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 58 }}><input type="checkbox" aria-label="Select all packages" /></th>
                <th>Package Name</th>
                <th>Price</th>
                <th>Duration</th>
                <th>Agent Commission</th>
                <th>Speed Limit</th>
                <th>Data Limit</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <p>Loading package catalog...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <p>No packages found yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td><input type="checkbox" aria-label={`Select ${item.name}`} /></td>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.name}</div>
                  </td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(item.activePriceUgx)}</td>
                  <td>{formatDuration(item.durationMinutes).replace('hr', 'H').replace('day', 'D')}</td>
                  <td>UGX 0</td>
                  <td>
                    {item.downloadSpeedKbps && item.uploadSpeedKbps
                      ? `${item.downloadSpeedKbps / 1024}M / ${item.uploadSpeedKbps / 1024}M`
                      : 'Unlimited'}
                  </td>
                  <td>{item.dataLimitMb ? `${item.dataLimitMb} MB` : 'Unlimited'}</td>
                  <td>
                    <span className={`switch-pill ${item.status === 'ACTIVE' ? 'on' : ''}`} aria-label={item.status} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
