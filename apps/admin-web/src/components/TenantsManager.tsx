'use client'

import { FormEvent, useEffect, useState } from 'react'
import { TenantOverviewResponse } from '@/lib/admin-types'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate } from '@/lib/format'

type TenantFormState = {
  name: string
  domain: string
  logoUrl: string
  brandColor: string
  supportPhone: string
  supportEmail: string
}

const initialTenantForm: TenantFormState = {
  name: '',
  domain: '',
  logoUrl: '',
  brandColor: '',
  supportPhone: '',
  supportEmail: '',
}

export default function TenantsManager() {
  const [data, setData] = useState<TenantOverviewResponse | null>(null)
  const [formState, setFormState] = useState<TenantFormState>(initialTenantForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setData(await clientFetchApi<TenantOverviewResponse>('/tenants'))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load tenants')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    try {
      await clientPostApi('/tenants', {
        name: formState.name.trim(),
        domain: formState.domain.trim() || undefined,
        logoUrl: formState.logoUrl.trim() || undefined,
        brandColor: formState.brandColor.trim() || undefined,
        supportPhone: formState.supportPhone.trim() || undefined,
        supportEmail: formState.supportEmail.trim() || undefined,
      })
      setSuccess('Tenant created successfully')
      setFormState(initialTenantForm)
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create tenant')
    } finally {
      setSubmitting(false)
    }
  }

  const items = data?.items ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tenants</h1>
          <p className="page-subtitle">Manage vendor tenants and their default operations wallet.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Add Tenant</span>
        </div>
        <div className="content" style={{ paddingTop: 16 }}>
          <form onSubmit={handleSubmit}>
            <div className="stats-grid" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">Tenant Name</label>
                <input className="form-input" value={formState.name} onChange={(event) => setFormState((previous) => ({ ...previous, name: event.target.value }))} placeholder="Kampala Downtown WiFi" required />
              </div>
              <div className="form-group">
                <label className="form-label">Domain (optional)</label>
                <input className="form-input" value={formState.domain} onChange={(event) => setFormState((previous) => ({ ...previous, domain: event.target.value }))} placeholder="tenant.example.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Logo URL (optional)</label>
                <input className="form-input" value={formState.logoUrl} onChange={(event) => setFormState((previous) => ({ ...previous, logoUrl: event.target.value }))} placeholder="https://cdn.example.com/logo.png" />
              </div>
              <div className="form-group">
                <label className="form-label">Brand Color (optional)</label>
                <input className="form-input" value={formState.brandColor} onChange={(event) => setFormState((previous) => ({ ...previous, brandColor: event.target.value }))} placeholder="#0EA5E9" />
              </div>
              <div className="form-group">
                <label className="form-label">Support Phone (optional)</label>
                <input className="form-input" value={formState.supportPhone} onChange={(event) => setFormState((previous) => ({ ...previous, supportPhone: event.target.value }))} placeholder="+256 700 000000" />
              </div>
              <div className="form-group">
                <label className="form-label">Support Email (optional)</label>
                <input className="form-input" value={formState.supportEmail} onChange={(event) => setFormState((previous) => ({ ...previous, supportEmail: event.target.value }))} placeholder="support@tenant.com" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Tenant'}
            </button>
            {error && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
            {success && <p style={{ color: 'var(--success-fg)', marginTop: 10, fontSize: 13 }}>{success}</p>}
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">All Tenants</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tenant Name</th>
                <th>Domain</th>
                <th>Packages</th>
                <th>Hotspots</th>
                <th>Routers</th>
                <th>Balance (UGX)</th>
                <th>Support</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>Loading tenants...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>No tenants registered yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((tenant) => (
                <tr key={tenant.id}>
                  <td>{tenant.name}</td>
                  <td>{tenant.domain ?? 'N/A'}</td>
                  <td>{tenant.counts.packages}</td>
                  <td>{tenant.counts.hotspots}</td>
                  <td>{tenant.counts.routers}</td>
                  <td>{formatCurrency(tenant.wallet?.balanceUgx ?? 0)}</td>
                  <td>{tenant.supportPhone ?? tenant.supportEmail ?? 'N/A'}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(tenant.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
