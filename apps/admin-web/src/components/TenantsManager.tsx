'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { TenantOverviewResponse } from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'

type TenantFormState = {
  name: string
  domain: string
  logoUrl: string
  brandColor: string
  portalTemplate: string
  supportPhone: string
  supportEmail: string
}

const initialTenantForm: TenantFormState = {
  name: '',
  domain: '',
  logoUrl: '',
  brandColor: '',
  portalTemplate: 'classic',
  supportPhone: '',
  supportEmail: '',
}

export default function TenantsManager() {
  const [data, setData] = useState<TenantOverviewResponse | null>(null)
  const [formState, setFormState] = useState<TenantFormState>(initialTenantForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [processText, setProcessText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setSuccess(null)
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
    setFormError(null)
    setProcessText('Creating tenant workspace and default wallet.')
    setSubmitting(true)

    try {
      await clientPostApi('/tenants', {
        name: formState.name.trim(),
        domain: formState.domain.trim() || undefined,
        logoUrl: formState.logoUrl.trim() || undefined,
        brandColor: formState.brandColor.trim() || undefined,
        portalTemplate: formState.portalTemplate,
        supportPhone: formState.supportPhone.trim() || undefined,
        supportEmail: formState.supportEmail.trim() || undefined,
      })
      setProcessText('Refreshing tenant list.')
      setFormState(initialTenantForm)
      setIsCreateModalOpen(false)
      await loadData()
    } catch (requestError) {
      const failure = requestError instanceof Error ? requestError.message : 'Unable to create tenant'
      setError(failure)
      setFormError(failure)
    } finally {
      setSubmitting(false)
      setProcessText('')
    }
  }

  async function updateTenantControl(tenantId: string, payload: Record<string, unknown>, successMessage: string) {
    setBusyTenantId(tenantId)
    setError(null)
    setSuccess(null)
    try {
      await clientPatchApi(`/system/tenant-settings?tenantId=${tenantId}`, payload)
      setSuccess(successMessage)
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update vendor control')
    } finally {
      setBusyTenantId(null)
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
        <button type="button" className="btn btn-primary" onClick={() => { setFormError(null); setProcessText(''); setIsCreateModalOpen(true) }}>+ Add Tenant</button>
      </div>

      {(success || error) && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          {success && <p style={{ color: 'var(--success-fg)', fontSize: 13 }}>{success}</p>}
          {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}
        </div>
      )}

      {isCreateModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <button type="button" className="modal-close" onClick={() => setIsCreateModalOpen(false)} disabled={submitting}>Close</button>
            <div className="modal-kicker">Platform Tenant</div>
            <h2 className="modal-title">Add Tenant</h2>
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
                  <label className="form-label">Portal Template</label>
                  <select className="form-input" value={formState.portalTemplate} onChange={(event) => setFormState((previous) => ({ ...previous, portalTemplate: event.target.value }))}>
                    <option value="classic">Classic Card</option>
                    <option value="fresh">Fresh Green</option>
                    <option value="midnight">Midnight Premium</option>
                    <option value="sunrise">Sunrise Promo</option>
                    <option value="minimal">Minimal White</option>
                  </select>
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
              <FormProcessStatus busy={submitting} error={formError} text={processText || 'Creating tenant. This modal closes after the tenant is saved.'} />
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Creating tenant...' : 'Create Tenant'}
              </button>
            </form>
          </div>
        </div>
      )}

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
                <th>Portal</th>
                <th>Balance (UGX)</th>
                <th>Earnings</th>
                <th>Account</th>
                <th>Payout</th>
                <th>Support</th>
                <th>Created</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={13}>
                    <div className="empty-state">
                      <p>Loading tenants...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={13}>
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
                  <td>{tenant.portalTemplate ?? 'classic'}</td>
                  <td>{formatCurrency(tenant.wallet?.balanceUgx ?? 0)}</td>
                  <td>
                    <strong>{formatCurrency(tenant.earnings?.netEarningsUgx ?? 0)}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Gross {formatCurrency(tenant.earnings?.grossSalesUgx ?? 0)} · Fees {formatCurrency(tenant.earnings?.platformFeesUgx ?? 0)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Paid out {formatCurrency(tenant.earnings?.completedWithdrawalUgx ?? 0)} · Pending {formatCurrency(tenant.earnings?.pendingWithdrawalUgx ?? 0)}
                    </div>
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(tenant.status?.accountActive === false ? 'FAILED' : tenant.status?.fraudHold ? 'WARNING' : 'SUCCESS')}>
                      {tenant.status?.accountActive === false ? 'suspended' : tenant.status?.fraudHold ? 'fraud hold' : 'active'}
                    </span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                      KYC {tenant.status?.kycCompleted === false ? 'needed' : 'complete'}
                    </div>
                  </td>
                  <td>
                    {(tenant.payoutNumbers ?? []).slice(0, 2).map((number) => (
                      <div key={number.id} style={{ fontSize: 12, marginBottom: 4 }}>
                        {number.network} {maskPhone(number.normalizedPhone)} <span className={getStatusBadgeClass(number.status)}>{number.status.toLowerCase().replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                    {(tenant.payoutNumbers ?? []).length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No payout number</span>}
                    {(tenant.payoutNumberChangeRequests ?? []).filter((item) => item.status.includes('PENDING')).length > 0 && (
                      <div style={{ color: 'var(--warning-fg)', fontSize: 12, marginTop: 4 }}>Change pending</div>
                    )}
                  </td>
                  <td>{tenant.supportPhone ?? tenant.supportEmail ?? 'N/A'}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(tenant.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {tenant.status?.accountActive === false ? (
                        <button className="btn btn-primary" style={controlButtonStyle} disabled={busyTenantId === tenant.id} onClick={() => updateTenantControl(tenant.id, { accountActive: true, fraudHold: false }, 'Vendor account activated.')}>Activate</button>
                      ) : (
                        <button className="btn btn-ghost" style={controlButtonStyle} disabled={busyTenantId === tenant.id} onClick={() => updateTenantControl(tenant.id, { accountActive: false }, 'Vendor account suspended.')}>Suspend</button>
                      )}
                      {tenant.status?.fraudHold ? (
                        <button className="btn btn-ghost" style={controlButtonStyle} disabled={busyTenantId === tenant.id} onClick={() => updateTenantControl(tenant.id, { fraudHold: false }, 'Fraud hold released.')}>Release Hold</button>
                      ) : (
                        <button className="btn btn-ghost" style={controlButtonStyle} disabled={busyTenantId === tenant.id} onClick={() => updateTenantControl(tenant.id, { fraudHold: true }, 'Vendor placed on fraud hold.')}>Fraud Hold</button>
                      )}
                      <a className="btn btn-ghost" style={controlButtonStyle} href={`/routers?tenantId=${tenant.id}`}>Routers</a>
                      <a className="btn btn-ghost" style={controlButtonStyle} href={`/settings?tenantId=${tenant.id}`}>Settings</a>
                    </div>
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

const controlButtonStyle = { padding: '7px 10px', fontSize: 12 }

function maskPhone(value: string) {
  if (value.length <= 6) return value
  return `${value.slice(0, 4)}xxxx${value.slice(-3)}`
}
