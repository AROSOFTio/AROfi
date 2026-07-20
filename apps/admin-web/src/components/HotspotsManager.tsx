'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AdminSessionResponse,
  HotspotOverviewResponse,
  TenantOverviewResponse,
} from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatDate, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'

type HotspotFormState = {
  tenantId: string
  name: string
  nasIpAddress: string
  secret: string
}

const initialHotspotForm: HotspotFormState = {
  tenantId: '',
  name: '',
  nasIpAddress: '',
  secret: '',
}

export default function HotspotsManager() {
  const [overview, setOverview] = useState<HotspotOverviewResponse | null>(null)
  const [tenants, setTenants] = useState<TenantOverviewResponse['items']>([])
  const [session, setSession] = useState<AdminSessionResponse | null>(null)
  const [formState, setFormState] = useState<HotspotFormState>(initialHotspotForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [processText, setProcessText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const items = overview?.items ?? []
  const summary = overview?.summary ?? {
    totalHotspots: 0,
    configuredNas: 0,
    linkedRouters: 0,
    activeSessions: 0,
    activeActivations: 0,
    voucherRedemptions: 0,
  }

  const tenantWorkspace = isVendorWorkspace(session?.user) ? session?.user.tenantId ?? null : null
  const showTenantSelector = !tenantWorkspace && tenants.length > 1

  const launchNotes = useMemo(
    () => [
      'A connected MikroTik is detected automatically and appears here as an access point.',
      'Use Add External Access Point only for a separate access zone that is not represented by its own router.',
      'AROFi links the NAS identity automatically so sessions and activations appear without manual setup.',
    ],
    [],
  )

  useEffect(() => {
    void loadData()
    const refreshId = window.setInterval(() => {
      void clientFetchApi<HotspotOverviewResponse>('/hotspots/overview')
        .then(setOverview)
        .catch(() => {})
    }, 5000)

    return () => window.clearInterval(refreshId)
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [overviewData, tenantData, sessionData] = await Promise.all([
        clientFetchApi<HotspotOverviewResponse>('/hotspots/overview'),
        clientFetchApi<TenantOverviewResponse>('/tenants'),
        clientFetchApi<AdminSessionResponse>('/auth/me'),
      ])

      setOverview(overviewData)
      setTenants(tenantData.items)
      setSession(sessionData)

      const defaultTenantId = isVendorWorkspace(sessionData.user) ? sessionData.user.tenantId ?? '' : tenantData.items[0]?.id ?? ''
      setFormState((previous) =>
        previous.tenantId
          ? previous
          : {
              ...previous,
              tenantId: defaultTenantId,
            },
      )
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load access point data')
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
      const failure = 'Select a business before adding an access point'
      setError(failure)
      setFormError(failure)
      return
    }

    setSubmitting(true)
    setProcessText('Adding the external access point and preparing its NAS mapping.')

    try {
      await clientPostApi('/hotspots', {
        tenantId: formState.tenantId,
        name: formState.name.trim(),
        nasIpAddress: formState.nasIpAddress.trim() || undefined,
        secret: formState.secret.trim() || undefined,
      })

      setProcessText('Refreshing access point inventory.')
      setSuccess('Access point added successfully')
      setFormState((previous) => ({
        ...initialHotspotForm,
        tenantId: previous.tenantId,
      }))
      await loadData()
      setCreateOpen(false)
    } catch (requestError) {
      const failure = requestError instanceof Error ? requestError.message : 'Unable to add access point'
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
          <h1 className="page-title">Access Points</h1>
          <p className="page-subtitle">
            Connected MikroTik access points are detected automatically. Add a separate external access point only when needed.
          </p>
        </div>
        {tenantWorkspace && (
          <span className="badge badge-info" style={{ padding: '8px 12px' }}>
            {session?.user.tenantName ?? 'Business workspace'}
          </span>
        )}
        <button type="button" className="btn btn-primary" onClick={() => { setFormError(null); setProcessText(''); setCreateOpen(true) }}>
          Add External Access Point
        </button>
      </div>

      <div className="charts-grid">
        {createOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submitting && setCreateOpen(false)}>
            <div className="modal-card wide" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="modal-close" onClick={() => setCreateOpen(false)} disabled={submitting}>Close</button>
              <div className="modal-kicker">External access point</div>
              <h2 className="modal-title">Add External Access Point</h2>
              <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
              <div className="stats-grid" style={{ marginBottom: 12 }}>
                {showTenantSelector && (
                  <div className="form-group">
                    <label className="form-label">Business</label>
                    <select
                      className="form-input"
                      value={formState.tenantId}
                      onChange={(event) =>
                        setFormState((previous) => ({
                          ...previous,
                          tenantId: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select business</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <Field
                  label="Access Point Name"
                  value={formState.name}
                  placeholder="Main Street Portal"
                  onChange={(value) =>
                    setFormState((previous) => ({
                      ...previous,
                      name: value,
                    }))
                  }
                  required
                />
                <Field
                  label="NAS IP Address"
                  value={formState.nasIpAddress}
                  placeholder="10.10.10.1"
                  onChange={(value) =>
                    setFormState((previous) => ({
                      ...previous,
                      nasIpAddress: value,
                    }))
                  }
                />
                <Field
                  label="RADIUS Secret"
                  value={formState.secret}
                  placeholder="Auto-generated when left blank"
                  onChange={(value) =>
                    setFormState((previous) => ({
                      ...previous,
                      secret: value,
                    }))
                  }
                />
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Adding access point...' : 'Add Access Point'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    setFormState((previous) => ({
                      ...initialHotspotForm,
                      tenantId: previous.tenantId,
                    }))
                  }
                >
                  Reset
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <FormProcessStatus busy={submitting} error={formError} success={success} text={processText || 'Adding the access point. The inventory refreshes after AROFi saves it.'} />
              </div>
              {error && !formError && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
              </form>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <span className="card-title">Site Deployment Notes</span>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 12 }}>
            {launchNotes.map((note, index) => (
              <div
                key={note}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr',
                  gap: 12,
                  alignItems: 'start',
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-hover)',
                }}
              >
                <span className="badge badge-info" style={{ minWidth: 28, justifyContent: 'center' }}>
                  {index + 1}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Access Points', value: `${summary.totalHotspots}`, color: 'blue' },
          { label: 'NAS Configured', value: `${summary.configuredNas}`, color: 'green' },
          { label: 'Linked Routers', value: `${summary.linkedRouters}`, color: 'amber' },
          { label: 'Live Sessions', value: `${summary.activeSessions}`, color: 'purple' },
          { label: 'Active Plans', value: `${summary.activeActivations}`, color: 'blue' },
          { label: 'Voucher Redemptions', value: `${summary.voucherRedemptions}`, color: 'green' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Access Point Inventory</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {loading ? 'Loading...' : `${items.length} site${items.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Access Point</th>
                <th>Business</th>
                <th>NAS & Secret</th>
                <th>Routers</th>
                <th>Sessions</th>
                <th>Active Plans</th>
                <th>Redemptions</th>
                <th>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>Loading access points...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>No access points detected yet. Connect and provision a MikroTik router, or add an external access point.</p>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((hotspot) => (
                <tr key={hotspot.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{hotspot.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Added {formatDate(hotspot.createdAt)}
                    </div>
                  </td>
                  <td>{hotspot.tenant.name}</td>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {hotspot.nasIpAddress ?? 'Pending NAS IP'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      Secret {hotspot.secretHint ?? 'auto-generated'}
                    </div>
                  </td>
                  <td>
                    {hotspot.routers.length === 0 && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No routers linked</span>
                    )}
                    {hotspot.routers.slice(0, 2).map((router) => (
                      <div key={router.id} style={{ marginBottom: 6 }}>
                        <span className={getStatusBadgeClass(router.status)}>{router.status.toLowerCase()}</span>
                        <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>{router.name}</span>
                      </div>
                    ))}
                    {hotspot.routers.length > 2 && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        +{hotspot.routers.length - 2} more router links
                      </div>
                    )}
                  </td>
                  <td>{hotspot.activeSessions}</td>
                  <td>{hotspot.activeActivations}</td>
                  <td>{hotspot.voucherRedemptions}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(hotspot.lastActivityAt ?? hotspot.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  required?: boolean
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}
