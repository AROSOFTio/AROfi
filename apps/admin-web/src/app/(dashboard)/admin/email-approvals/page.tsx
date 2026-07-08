'use client'

import { useCallback, useEffect, useState } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatDate, getStatusBadgeClass } from '@/lib/format'

type EmailChangeRequest = {
  id: string
  currentEmail: string
  requestedEmail: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewedBy?: string | null
  reviewNote?: string | null
  createdAt: string
  user: {
    email: string
    firstName?: string | null
    lastName?: string | null
    tenant?: { name: string } | null
  }
}

export default function EmailApprovalsPage() {
  const [requests, setRequests] = useState<EmailChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRequests(await clientFetchApi<EmailChangeRequest[]>('/auth/email-change-requests'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load email change requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function review(id: string, approve: boolean) {
    const note = approve ? undefined : window.prompt('Reason for rejecting (sent to the user):') ?? undefined
    if (!approve && note === undefined) return
    setBusyId(id)
    setError('')
    try {
      await clientPostApi(`/auth/email-change-requests/${id}/review`, { approve, note })
      await load()
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
          <h1 className="page-title">Email Change Approvals</h1>
          <p className="page-subtitle">Requests from users to change their sign-in email. Approving updates the account immediately and signs the user out everywhere.</p>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Requests</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Requested</th>
                <th>User</th>
                <th>Current Email</th>
                <th>New Email</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && requests.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state" style={{ padding: 24 }}>
                      <p>No email change requests yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {requests.map((request) => (
                <tr key={request.id}>
                  <td style={{ fontSize: 12 }}>{formatDate(request.createdAt)}</td>
                  <td>
                    <div>{[request.user.firstName, request.user.lastName].filter(Boolean).join(' ') || request.user.email}</div>
                    {request.user.tenant?.name && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{request.user.tenant.name}</div>
                    )}
                  </td>
                  <td>{request.currentEmail}</td>
                  <td style={{ fontWeight: 600 }}>{request.requestedEmail}</td>
                  <td style={{ maxWidth: 260, fontSize: 12.5 }}>{request.reason}</td>
                  <td>
                    <span className={getStatusBadgeClass(request.status)}>{request.status.toLowerCase()}</span>
                    {request.reviewedBy && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>by {request.reviewedBy}</div>
                    )}
                  </td>
                  <td>
                    {request.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void review(request.id, true)} disabled={busyId === request.id}>
                          Approve
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void review(request.id, false)} disabled={busyId === request.id}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{request.reviewNote || '—'}</span>
                    )}
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
