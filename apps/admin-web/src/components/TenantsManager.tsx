'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { TenantOverviewResponse } from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientDeleteApi, clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'
import { PhoneNumberField } from '@/components/PhoneNumberField'

type TenantItem = TenantOverviewResponse['items'][number]

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
  const [deleteTarget, setDeleteTarget] = useState<TenantItem | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setSuccess(null)
      setData(await clientFetchApi<TenantOverviewResponse>('/tenants'))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load businesses')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFormError(null)
    setProcessText('Creating business workspace and default wallet.')
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
      setProcessText('Refreshing business list.')
      setFormState(initialTenantForm)
      setIsCreateModalOpen(false)
      await loadData()
    } catch (requestError) {
      const failure = requestError instanceof Error ? requestError.message : 'Unable to create business'
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
      setError(requestError instanceof Error ? requestError.message : 'Unable to update business controls')
    } finally {
      setBusyTenantId(null)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || deleteConfirmName !== deleteTarget.name) return
    setIsDeleting(true)
    setError(null)
    try {
      await clientDeleteApi(`/tenants/${deleteTarget.id}`)
      setSuccess(`Business "${deleteTarget.name}" and all associated data have been permanently deleted.`)
      setDeleteTarget(null)
      setDeleteConfirmName('')
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete business')
    } finally {
      setIsDeleting(false)
    }
  }

  const items = data?.items ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Businesses</h1>
          <p className="page-subtitle">Manage business workspaces and their default operations wallets.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { setFormError(null); setProcessText(''); setIsCreateModalOpen(true) }}>+ Add Business</button>
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
            <div className="modal-kicker">Platform Business</div>
            <h2 className="modal-title">Add Business</h2>
            <form onSubmit={handleSubmit}>
              <div className="stats-grid" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Business Name</label>
                  <input className="form-input" value={formState.name} onChange={(event) => setFormState((previous) => ({ ...previous, name: event.target.value }))} placeholder="Kampala Downtown WiFi" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Domain (optional)</label>
                  <input className="form-input" value={formState.domain} onChange={(event) => setFormState((previous) => ({ ...previous, domain: event.target.value }))} placeholder="business.example.com" />
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
                    <option value="classic">Classic</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Support Phone (optional)</label>
                  <PhoneNumberField value={formState.supportPhone} onChange={(value) => setFormState((previous) => ({ ...previous, supportPhone: value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Support Email (optional)</label>
                  <input className="form-input" value={formState.supportEmail} onChange={(event) => setFormState((previous) => ({ ...previous, supportEmail: event.target.value }))} placeholder="support@business.com" />
                </div>
              </div>
              <FormProcessStatus busy={submitting} error={formError} text={processText || 'Creating business. This window closes after the business is saved.'} />
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Creating business...' : 'Create Business'}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <button type="button" className="modal-close" onClick={() => { setDeleteTarget(null); setDeleteConfirmName('') }} disabled={isDeleting}>Close</button>
            <div className="modal-kicker" style={{ color: 'var(--danger-fg)' }}>Destructive Action</div>
            <h2 className="modal-title">Delete Business</h2>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
              This will permanently delete <strong>{deleteTarget.name}</strong> and ALL associated data including
              hotspots, routers, vouchers, packages, payments, agents, wallets, and sessions.
              <strong style={{ color: 'var(--danger-fg)' }}> This cannot be undone.</strong>
            </p>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ color: 'var(--danger-fg)' }}>
                Type <strong>{deleteTarget.name}</strong> to confirm
              </label>
              <input
                className="form-input"
                style={{ borderColor: deleteConfirmName && deleteConfirmName !== deleteTarget.name ? 'var(--danger-fg)' : undefined }}
                value={deleteConfirmName}
                onChange={(event) => setDeleteConfirmName(event.target.value)}
                placeholder={deleteTarget.name}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--danger-fg)', color: '#fff', flex: 1, opacity: deleteConfirmName !== deleteTarget.name || isDeleting ? 0.5 : 1 }}
                disabled={deleteConfirmName !== deleteTarget.name || isDeleting}
                onClick={() => void handleDeleteConfirm()}
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete Business'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setDeleteTarget(null); setDeleteConfirmName('') }} disabled={isDeleting}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading businesses...</div>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No businesses registered yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))' }}>
          {items.map((tenant) => (
            <TenantCard
              key={tenant.id}
              tenant={tenant}
              busy={busyTenantId === tenant.id}
              onActivate={() => updateTenantControl(tenant.id, { accountActive: true, fraudHold: false }, 'Business account activated.')}
              onSuspend={() => updateTenantControl(tenant.id, { accountActive: false }, 'Business account suspended.')}
              onFraudHold={() => updateTenantControl(tenant.id, { fraudHold: true }, 'Business placed on fraud hold.')}
              onReleaseHold={() => updateTenantControl(tenant.id, { fraudHold: false }, 'Fraud hold released.')}
              onDelete={() => { setDeleteTarget(tenant); setDeleteConfirmName('') }}
            />
          ))}
        </div>
      )}
    </>
  )
}

type TenantCardProps = {
  tenant: TenantItem
  busy: boolean
  onActivate: () => void
  onSuspend: () => void
  onFraudHold: () => void
  onReleaseHold: () => void
  onDelete: () => void
}

function TenantCard({ tenant, busy, onActivate, onSuspend, onFraudHold, onReleaseHold, onDelete }: TenantCardProps) {
  const isActive = tenant.status?.accountActive !== false
  const isFraudHold = Boolean(tenant.status?.fraudHold)

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {tenant.logoUrl ? (
          <img src={tenant.logoUrl} alt={tenant.name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', border: '1px solid var(--border)' }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-hover)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, color: 'var(--text-2)' }}>
            {tenant.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tenant.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{tenant.domain ?? 'No domain'}</div>
        </div>
        <span className={getStatusBadgeClass(isActive === false ? 'FAILED' : isFraudHold ? 'WARNING' : 'SUCCESS')} style={{ flexShrink: 0 }}>
          {isActive === false ? 'Suspended' : isFraudHold ? 'Fraud Hold' : 'Active'}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {[
          { label: 'Packages', value: tenant.counts.packages },
          { label: 'Hotspots', value: tenant.counts.hotspots },
          { label: 'Routers', value: tenant.counts.routers },
          { label: 'Users', value: tenant.counts.users },
        ].map(({ label, value }) => (
          <div key={label} style={{ padding: '10px 14px', textAlign: 'center', borderRight: '1px solid var(--border)' }} className="last:border-r-0">
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Financials */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Wallet Balance</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginTop: 2 }}>{formatCurrency(tenant.wallet?.balanceUgx ?? 0)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Net Earnings</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--success-fg)', marginTop: 2 }}>{formatCurrency(tenant.earnings?.netEarningsUgx ?? 0)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gross Sales</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{formatCurrency(tenant.earnings?.grossSalesUgx ?? 0)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pending Withdrawal</div>
          <div style={{ fontSize: 13, color: 'var(--warn-fg)', marginTop: 2 }}>{formatCurrency(tenant.earnings?.pendingWithdrawalUgx ?? 0)}</div>
        </div>
      </div>

      {/* Contact details */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <ContactLine label="Support phone" value={tenant.supportPhone} href={tenant.supportPhone ? `tel:${tenant.supportPhone.replace(/\s+/g, '')}` : undefined} />
        <ContactLine label="Support email" value={tenant.supportEmail} href={tenant.supportEmail ? `mailto:${tenant.supportEmail}` : undefined} />
      </div>

      {/* Payout numbers */}
      {(tenant.payoutNumbers ?? []).length > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Payout / telephone numbers</div>
          {(tenant.payoutNumbers ?? []).slice(0, 5).map((number) => (
            <div key={number.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <a href={`tel:${number.normalizedPhone}`} style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600, textDecoration: 'none' }}>
                {number.network} {number.normalizedPhone}
              </a>
              {number.ownerName && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{number.ownerName}</span>}
              {number.isPrimary && <span className="badge badge-info">primary</span>}
              <span className={getStatusBadgeClass(number.status)}>{number.status.toLowerCase().replace(/_/g, ' ')}</span>
            </div>
          ))}
          {(tenant.payoutNumberChangeRequests ?? []).filter((item) => item.status.includes('PENDING')).length > 0 && (
            <div style={{ color: 'var(--warn-fg)', fontSize: 12, marginTop: 4 }}>Change request pending</div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
        <span>Portal: <strong>{tenant.portalTemplate ?? 'classic'}</strong></span>
        <span>Created: {formatDate(tenant.createdAt)}</span>
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isActive === false ? (
          <button className="btn btn-primary" style={actionBtnStyle} disabled={busy} onClick={onActivate}>Activate</button>
        ) : (
          <button className="btn btn-ghost" style={actionBtnStyle} disabled={busy} onClick={onSuspend}>Suspend</button>
        )}
        {isFraudHold ? (
          <button className="btn btn-ghost" style={actionBtnStyle} disabled={busy} onClick={onReleaseHold}>Release Hold</button>
        ) : (
          <button className="btn btn-ghost" style={actionBtnStyle} disabled={busy} onClick={onFraudHold}>Fraud Hold</button>
        )}
        <a className="btn btn-ghost" style={actionBtnStyle} href={`/routers?tenantId=${tenant.id}`}>Routers</a>
        <a className="btn btn-ghost" style={actionBtnStyle} href={`/settings?tenantId=${tenant.id}`}>Settings</a>
        <button className="btn" style={{ ...actionBtnStyle, background: 'var(--danger-bg)', color: 'var(--danger-fg)', border: '1px solid var(--danger-fg)', marginLeft: 'auto' }} disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}

const actionBtnStyle: React.CSSProperties = { padding: '6px 10px', fontSize: 12 }

function ContactLine({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      {value ? (
        <a href={href} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textDecoration: 'none' }} title={value}>
          {value}
        </a>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Not set</span>
      )}
    </div>
  )
}
