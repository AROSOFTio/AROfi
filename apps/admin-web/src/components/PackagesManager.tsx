'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { PackageCatalogResponse, TenantOverviewResponse } from '@/lib/admin-types'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, formatDuration, getStatusBadgeClass } from '@/lib/format'

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
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const items = catalog?.items ?? []

  const summary = useMemo(
    () =>
      catalog?.summary ?? {
        totalPackages: 0,
        activePackages: 0,
        featuredPackages: 0,
        averagePriceUgx: 0,
      },
    [catalog],
  )

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
    setSuccess(null)

    if (!formState.tenantId) {
      setError('Select a tenant before creating a package')
      return
    }

    setSubmitting(true)

    try {
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

      setSuccess('Package created successfully')
      setFormState({
        ...initialFormState,
        tenantId: formState.tenantId,
      })
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create package')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Packages</h1>
          <p className="page-subtitle">Create and maintain tenant package catalog, pricing, and voucher-ready plans.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Create Package</span>
        </div>
        <div className="content" style={{ paddingTop: 16 }}>
          <form onSubmit={handleSubmit}>
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Tenant</label>
                <select
                  className="form-input"
                  value={formState.tenantId}
                  onChange={(event) => setFormState((previous) => ({ ...previous, tenantId: event.target.value }))}
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
                <label className="form-label">Package Name</label>
                <input className="form-input" value={formState.name} onChange={(event) => setFormState((previous) => ({ ...previous, name: event.target.value }))} placeholder="Starter 2 Hours" required />
              </div>
              <div className="form-group">
                <label className="form-label">Code</label>
                <input className="form-input" value={formState.code} onChange={(event) => setFormState((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))} placeholder="STARTER-2H" required />
              </div>
              <div className="form-group">
                <label className="form-label">Duration (minutes)</label>
                <input className="form-input" type="number" min={1} value={formState.durationMinutes} onChange={(event) => setFormState((previous) => ({ ...previous, durationMinutes: event.target.value }))} required />
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
                <label className="form-label">Device Limit (optional)</label>
                <input className="form-input" type="number" min={1} value={formState.deviceLimit} onChange={(event) => setFormState((previous) => ({ ...previous, deviceLimit: event.target.value }))} />
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
                {submitting ? 'Creating...' : 'Create Package'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setFormState((previous) => ({ ...initialFormState, tenantId: previous.tenantId }))}>
                Reset
              </button>
            </div>
            {error && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
            {success && <p style={{ color: 'var(--success-fg)', marginTop: 10, fontSize: 13 }}>{success}</p>}
          </form>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Packages', value: `${summary.totalPackages}`, color: 'blue' },
          { label: 'Active Packages', value: `${summary.activePackages}`, color: 'green' },
          { label: 'Featured Offers', value: `${summary.featuredPackages}`, color: 'amber' },
          { label: 'Avg Price', value: formatCurrency(summary.averagePriceUgx), color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Package Catalog</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Package</th>
                <th>Tenant</th>
                <th>Duration</th>
                <th>Price</th>
                <th>Speed</th>
                <th>Voucher Batches</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>Loading package catalog...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>No packages found yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.code}</div>
                  </td>
                  <td>{item.tenant.name}</td>
                  <td>{formatDuration(item.durationMinutes)}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(item.activePriceUgx)}</td>
                  <td>
                    {item.downloadSpeedKbps && item.uploadSpeedKbps
                      ? `${item.downloadSpeedKbps / 1024}M / ${item.uploadSpeedKbps / 1024}M`
                      : 'Unspecified'}
                  </td>
                  <td>{item.voucherBatchCount}</td>
                  <td>
                    <span className={getStatusBadgeClass(item.status)}>{item.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
