'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AdminSessionResponse, SupportTicketResponse } from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatDate, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'

type Ticket = SupportTicketResponse['items'][number]

const categories = ['Router setup', 'Payment issue', 'Customer connection', 'Voucher issue', 'Wallet withdrawal', 'Other']
const priorities = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']
const statuses = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']

export default function SupportPage() {
  const [session, setSession] = useState<AdminSessionResponse | null>(null)
  const [data, setData] = useState<SupportTicketResponse | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submittingAction, setSubmittingAction] = useState<'create' | 'reply' | 'status' | ''>('')
  const [processText, setProcessText] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const isVendor = isVendorWorkspace(session?.user)
  const tickets = data?.items ?? []
  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null,
    [selectedTicketId, tickets],
  )

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData(preferredTicketId?: string) {
    setLoading(true)
    setError('')
    try {
      const [sessionData, supportData] = await Promise.all([
        clientFetchApi<AdminSessionResponse>('/auth/me'),
        clientFetchApi<SupportTicketResponse>('/system/support-tickets'),
      ])
      setSession(sessionData)
      setData(supportData)
      setSelectedTicketId(preferredTicketId ?? selectedTicketId ?? supportData.items[0]?.id ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load support tickets')
    } finally {
      setLoading(false)
    }
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setSubmittingAction('create')
    setProcessText('Creating support ticket and sending it to the developer admin queue.')
    setFormError('')
    setError('')
    setMessage('')
    try {
      const ticket = await clientPostApi<Ticket>('/system/support-tickets', {
        subject: form.get('subject'),
        category: form.get('category'),
        priority: form.get('priority'),
        channel: 'DASHBOARD',
        phoneNumber: form.get('phoneNumber') || undefined,
        email: form.get('email') || session?.user.email,
        openedBy: session?.user.displayName ?? session?.user.email,
      })
      const body = String(form.get('body') ?? '').trim()
      if (body) {
        setProcessText('Adding the first ticket message.')
        await clientPostApi(`/system/support-tickets/${ticket.id}/messages`, {
          authorName: session?.user.displayName ?? session?.user.email ?? 'Vendor',
          authorRole: isVendor ? 'Vendor' : 'Developer Admin',
          body,
          isInternal: false,
        })
      }
      setProcessText('Refreshing ticket queue.')
      setMessage('Ticket submitted. A developer admin can now attend to it.')
      event.currentTarget.reset()
      await loadData(ticket.id)
      return true
    } catch (caught) {
      const failure = caught instanceof Error ? caught.message : 'Unable to submit support ticket'
      setError(failure)
      setFormError(failure)
      return false
    } finally {
      setSubmitting(false)
      setProcessText('')
    }
  }

  async function updateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTicket) return
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setSubmittingAction('reply')
    setProcessText('Sending reply and refreshing the conversation.')
    setFormError('')
    setError('')
    setMessage('')
    try {
      await clientPostApi(`/system/support-tickets/${selectedTicket.id}/messages`, {
        authorName: session?.user.displayName ?? session?.user.email ?? 'Support',
        authorRole: isVendor ? 'Vendor' : 'Developer Admin',
        body: form.get('body'),
        isInternal: !isVendor && form.get('isInternal') === 'on',
      })
      setMessage(isVendor ? 'Reply sent to support.' : 'Reply added to ticket.')
      event.currentTarget.reset()
      await loadData(selectedTicket.id)
    } catch (caught) {
      const failure = caught instanceof Error ? caught.message : 'Unable to add reply'
      setError(failure)
      setFormError(failure)
    } finally {
      setSubmitting(false)
      setProcessText('')
    }
  }

  async function updateTicketStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTicket || isVendor) return
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setSubmittingAction('status')
    setProcessText('Updating ticket status and notifying the support timeline.')
    setFormError('')
    setError('')
    setMessage('')
    try {
      await clientPostApi(`/system/support-tickets/${selectedTicket.id}/messages`, {
        authorName: session?.user.displayName ?? session?.user.email ?? 'Developer Admin',
        authorRole: 'Developer Admin',
        body: `Ticket updated: status ${form.get('status')}, assigned to ${form.get('assignedTo') || 'unassigned'}.`,
        isInternal: true,
      })
      await clientPatchApi(`/system/support-tickets/${selectedTicket.id}`, {
        status: form.get('status'),
        priority: form.get('priority'),
        assignedTo: form.get('assignedTo') || undefined,
      })
      setMessage('Ticket status updated.')
      await loadData(selectedTicket.id)
    } catch (caught) {
      const failure = caught instanceof Error ? caught.message : 'Unable to update ticket'
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
          <h1 className="page-title">{isVendor ? 'Support Tickets' : 'Developer Support Queue'}</h1>
          <p className="page-subtitle">
            {isVendor
              ? 'Submit router, payment, wallet, voucher, and customer connection issues for developer admin support.'
              : 'Attend vendor tickets, assign ownership, update status, and reply with clear next steps.'}
          </p>
        </div>
        {isVendor && <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>Submit Ticket</button>}
      </div>

      {(message || error) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: 14 }}>
            {message && <p style={{ color: 'var(--success-fg)', fontSize: 13 }}>{message}</p>}
            {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}
          </div>
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <Stat label="Total" value={`${data?.summary.totalTickets ?? 0}`} color="blue" />
        <Stat label="Open" value={`${data?.summary.open ?? 0}`} color="amber" />
        <Stat label="In Progress" value={`${data?.summary.inProgress ?? 0}`} color="purple" />
        <Stat label="Critical" value={`${data?.summary.critical ?? 0}`} color="green" />
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header"><span className="card-title">{isVendor ? 'My Tickets' : 'Ticket Queue'}</span></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  {!isVendor && <th>Vendor</th>}
                  <th>Subject</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Latest</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={isVendor ? 5 : 6}><div className="empty-state"><p>Loading tickets...</p></div></td></tr>}
                {!loading && tickets.length === 0 && <tr><td colSpan={isVendor ? 5 : 6}><div className="empty-state"><p>No support tickets yet.</p></div></td></tr>}
                {tickets.map((ticket) => (
                  <tr key={ticket.id} onClick={() => setSelectedTicketId(ticket.id)} style={{ cursor: 'pointer', background: selectedTicket?.id === ticket.id ? 'var(--bg-hover)' : undefined }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ticket.reference}</td>
                    {!isVendor && <td>{ticket.tenant?.name ?? 'N/A'}</td>}
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ticket.subject}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ticket.category}</div>
                    </td>
                    <td><span className={getStatusBadgeClass(ticket.priority)}>{ticket.priority.toLowerCase()}</span></td>
                    <td><span className={getStatusBadgeClass(ticket.status)}>{ticket.status.toLowerCase()}</span></td>
                    <td style={{ fontSize: 12 }}>{formatDate(ticket.latestResponseAt ?? ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedTicket && (
        <div className="charts-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">{selectedTicket.reference} Conversation</span>
              <span className={getStatusBadgeClass(selectedTicket.status)}>{selectedTicket.status.toLowerCase()}</span>
            </div>
            <div style={{ padding: 20, display: 'grid', gap: 12 }}>
              {selectedTicket.messages.length === 0 && <div className="empty-state"><p>No replies yet.</p></div>}
              {selectedTicket.messages
                .filter((item) => isVendor ? !item.isInternal : true)
                .map((item) => (
                  <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: item.isInternal ? 'var(--bg-app)' : 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{item.authorName}</strong>
                      <span className={getStatusBadgeClass(item.isInternal ? 'WARNING' : 'INFO')}>{item.isInternal ? 'internal' : item.authorRole}</span>
                    </div>
                    <p style={{ marginTop: 8, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{item.body}</p>
                    <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(item.createdAt)}</div>
                  </div>
                ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">{isVendor ? 'Reply to Support' : 'Attend Ticket'}</span></div>
            {!isVendor && (
              <form onSubmit={updateTicketStatus} style={{ padding: 20, display: 'grid', gap: 12, borderBottom: '1px solid var(--border)' }}>
                <Field label="Status">
                  <select name="status" className="form-input" defaultValue={selectedTicket.status}>
                    {statuses.map((status) => <option key={status} value={status}>{status.toLowerCase()}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select name="priority" className="form-input" defaultValue={selectedTicket.priority}>
                    {priorities.map((priority) => <option key={priority} value={priority}>{priority.toLowerCase()}</option>)}
                  </select>
                </Field>
                <Field label="Assigned to"><input name="assignedTo" className="form-input" defaultValue={selectedTicket.assignedTo ?? session?.user.displayName ?? ''} /></Field>
                <FormProcessStatus busy={submittingAction === 'status'} error={submittingAction === 'status' ? formError : null} text={processText || 'Updating this ticket.'} />
                <button className="btn btn-ghost" disabled={submitting}>{submitting ? 'Updating status...' : 'Update Status'}</button>
              </form>
            )}
            <form onSubmit={updateTicket} style={{ padding: 20, display: 'grid', gap: 12 }}>
              <Field label="Reply"><textarea name="body" className="form-input" rows={5} required maxLength={4000} /></Field>
              {!isVendor && (
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  <input name="isInternal" type="checkbox" /> Internal developer note
                </label>
              )}
              <FormProcessStatus busy={submittingAction === 'reply'} error={submittingAction === 'reply' ? formError : null} text={processText || 'Sending reply.'} />
              <button className="btn btn-primary" disabled={submitting}>{submitting ? 'Sending reply...' : 'Send Reply'}</button>
            </form>
          </div>
        </div>
      )}

      {isVendor && createOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submitting && setCreateOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setCreateOpen(false)} disabled={submitting}>Close</button>
            <div className="modal-kicker">Vendor support</div>
            <h2 className="modal-title">Submit Ticket</h2>
            <form onSubmit={async (event) => { if (await createTicket(event)) setCreateOpen(false) }} style={{ marginTop: 20, display: 'grid', gap: 12 }}>
              <Field label="Subject"><input name="subject" className="form-input" required maxLength={180} /></Field>
              <Field label="Category">
                <select name="category" className="form-input" required>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select name="priority" className="form-input" required>
                  {priorities.map((priority) => <option key={priority} value={priority}>{priority.toLowerCase()}</option>)}
                </select>
              </Field>
              <Field label="Phone number"><input name="phoneNumber" className="form-input" placeholder="+256..." /></Field>
              <Field label="Email"><input name="email" type="email" className="form-input" placeholder={session?.user.email ?? 'support contact email'} /></Field>
              <Field label="What happened?"><textarea name="body" className="form-input" rows={5} required maxLength={4000} /></Field>
              <FormProcessStatus busy={submittingAction === 'create'} error={submittingAction === 'create' ? formError : null} text={processText || 'Submitting ticket. The modal closes after the ticket is saved.'} />
              <button className="btn btn-primary btn-block" disabled={submitting}>{submitting ? 'Submitting ticket...' : 'Submit Ticket'}</button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="form-group" style={{ marginBottom: 0 }}>
      <span className="form-label">{label}</span>
      {children}
    </label>
  )
}
