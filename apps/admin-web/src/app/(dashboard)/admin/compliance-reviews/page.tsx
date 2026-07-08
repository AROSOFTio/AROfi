'use client'

import { useCallback, useEffect, useState } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatDate, getStatusBadgeClass } from '@/lib/format'

type ComplianceRow = {
  id: string
  businessName: string
  ownerName: string
  phoneNumber: string
  email: string
  country: string
  district: string
  hotspotLocation: string
  businessType: string
  ispName: string
  ispPackage?: string | null
  routerCount: number
  expectedUsers?: number | null
  payoutPhoneNumber?: string | null
  notes?: string | null
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO'
  reviewedBy?: string | null
  reviewNotes?: string | null
  updatedAt: string
  tenant: { name: string; domain?: string | null }
}

const STATUS_FILTERS = ['ALL', 'PENDING_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED'] as const

export default function ComplianceReviewsPage() {
  const [rows, setRows] = useState<ComplianceRow[]>([])
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('PENDING_REVIEW')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (status: (typeof STATUS_FILTERS)[number]) => {
    setLoading(true)
    setError('')
    try {
      const query = status === 'ALL' ? '' : `?status=${status}`
      setRows(await clientFetchApi<ComplianceRow[]>(`/compliance/requests${query}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load compliance submissions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filter)
  }, [filter, load])

  async function review(id: string, verdict: 'APPROVED' | 'REJECTED' | 'NEEDS_INFO') {
    const note =
      verdict === 'APPROVED'
        ? window.prompt('Optional note to the business (leave blank to skip):') ?? undefined
        : window.prompt(`Note to the business explaining "${verdict.replace('_', ' ').toLowerCase()}":`) ?? undefined
    if (verdict !== 'APPROVED' && note === undefined) return
    setBusyId(id)
    setError('')
    try {
      await clientPostApi(`/compliance/requests/${id}/review`, { verdict, note: note || undefined })
      await load(filter)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review failed.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Compliance Reviews</h1>
          <p className="page-subtitle">Business verification submissions from operators. Approve, reject, or request more information.</p>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Submissions</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                className={`btn btn-sm ${filter === status ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilter(status)}
              >
                {status === 'ALL' ? 'All' : status.replace('_', ' ').toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Owner / Contact</th>
                <th>Location</th>
                <th>ISP</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state" style={{ padding: 24 }}>
                      <p>No submissions in this state.</p>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <>
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.businessName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.businessType} · {row.tenant.name}</div>
                    </td>
                    <td>
                      <div>{row.ownerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.phoneNumber} · {row.email}</div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{row.district}, {row.country}</td>
                    <td style={{ fontSize: 12.5 }}>{row.ispName} · {row.routerCount} router{row.routerCount === 1 ? '' : 's'}</td>
                    <td><span className={getStatusBadgeClass(row.status)}>{row.status.replace('_', ' ').toLowerCase()}</span></td>
                    <td style={{ fontSize: 12 }}>{formatDate(row.updatedAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}>
                          {expandedId === row.id ? 'Hide' : 'Details'}
                        </button>
                        {row.status !== 'APPROVED' && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => void review(row.id, 'APPROVED')} disabled={busyId === row.id}>
                            Approve
                          </button>
                        )}
                        {row.status === 'PENDING_REVIEW' && (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void review(row.id, 'NEEDS_INFO')} disabled={busyId === row.id}>
                              Needs Info
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-fg)' }} onClick={() => void review(row.id, 'REJECTED')} disabled={busyId === row.id}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr key={`${row.id}-details`}>
                      <td colSpan={7} style={{ background: 'var(--bg-app)', fontSize: 13 }}>
                        <div style={{ display: 'grid', gap: 6, padding: '12px 6px' }}>
                          <span><strong>Hotspot location:</strong> {row.hotspotLocation}</span>
                          {row.ispPackage && <span><strong>Internet package:</strong> {row.ispPackage}</span>}
                          {row.expectedUsers && <span><strong>Expected users:</strong> {row.expectedUsers}</span>}
                          {row.payoutPhoneNumber && <span><strong>Payout phone:</strong> {row.payoutPhoneNumber}</span>}
                          {row.notes && <span><strong>Notes from business:</strong> {row.notes}</span>}
                          {row.reviewNotes && <span><strong>Last reviewer note:</strong> {row.reviewNotes} ({row.reviewedBy})</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
