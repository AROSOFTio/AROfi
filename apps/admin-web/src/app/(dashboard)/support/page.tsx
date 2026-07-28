'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AdminSessionResponse, SupportTicketResponse } from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { Modal } from '@/components/Modal'
import { PhoneNumberField } from '@/components/PhoneNumberField'
import { clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatDate, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'

type Ticket = SupportTicketResponse['items'][number]

const categories = ['Router setup', 'Payment issue', 'Customer connection', 'Voucher issue', 'Wallet withdrawal', 'Other']
const priorities = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']
const statuses = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']
const statusFilters = ['ALL', 'OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const
const documentationSections = [
  {
    title: 'Add another router',
    steps: [
      'Open Network, then Routers.',
      'Click Add Router and enter the router name, public IP or host, API port, username, and password.',
      'Save it, then check the router status. Healthy means AROFi can reach it.',
      'If it does not connect, confirm the router has internet, API service is enabled, firewall allows the server IP, and credentials are correct.',
    ],
  },
  {
    title: 'Sell internet to a customer',
    steps: [
      'Open Sell Internet, then Internet Plans to create the package.',
      'Use Vouchers when you want printed or prepaid access codes.',
      'Use Customers to check who bought, what they used, and when access expires.',
      'If a customer paid but is not online, open Support and submit a Customer connection ticket with the phone number and time of payment.',
    ],
  },
  {
    title: 'Fix payment or voucher errors',
    steps: [
      'Open Money, then Transactions to confirm whether the payment is completed, pending, or failed.',
      'Open Sales to confirm the sale reached the ledger.',
      'For vouchers, open Sell Internet, then Vouchers and search the voucher code.',
      'If money was deducted but no access was given, submit a Payment issue ticket with the customer phone number, amount, and time.',
    ],
  },
  {
    title: 'Withdraw money',
    steps: [
      'Open Money, then Wallet.',
      'Confirm your available balance and payout number.',
      'Click Withdraw Money and enter the amount and secret PIN.',
      'If the payout number is wrong, submit a support ticket before withdrawing. Some changes must be verified first.',
    ],
  },
  {
    title: 'Check live users and router health',
    steps: [
      'Open Network, then Online Users to see active customer sessions.',
      'Open Network, then Routers to see whether each router is healthy.',
      'Use Remote Access only when you need to enter the router remotely.',
      'If users are offline but the router is healthy, check the package expiry, payment status, and voucher status first.',
    ],
  },
  {
    title: 'Get help from AROFi support',
    steps: [
      'Open Support, then Tickets.',
      'Click Submit Ticket.',
      'Choose the closest category and include phone number, voucher code, router name, amount, and exact time where possible.',
      'Keep replies inside the ticket so support can see the full history.',
    ],
  },
]

export default function SupportPage() {
  const searchParams = useSearchParams()
  const [session, setSession] = useState<AdminSessionResponse | null>(null)
  const [data, setData] = useState<SupportTicketResponse | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submittingAction, setSubmittingAction] = useState<'create' | 'reply' | 'status' | ''>('')
  const [processText, setProcessText] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const isVendor = isVendorWorkspace(session?.user)
  const allTickets = data?.items ?? []
  const feedbackOnly = searchParams.get('view') === 'feedback'
  const documentationOnly = searchParams.get('view') === 'documentation'
  const tickets = useMemo(
    () => allTickets.filter((ticket) => (!feedbackOnly || ticket.category.startsWith('Product feedback')) && (statusFilter === 'ALL' || ticket.status === statusFilter)),
    [allTickets, feedbackOnly, statusFilter],
  )
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
        channel: 'INTERNAL',
        phoneNumber: form.get('phoneNumber') || undefined,
        email: form.get('email') || session?.user.email,
        openedBy: session?.user.displayName ?? session?.user.email,
      })
      const body = String(form.get('body') ?? '').trim()
      if (body) {
        setProcessText('Adding the first ticket message.')
        await clientPostApi(`/system/support-tickets/${ticket.id}/messages`, {
          authorName: session?.user.displayName ?? session?.user.email ?? 'Business',
          authorRole: isVendor ? 'Business' : 'Developer Admin',
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
        authorRole: isVendor ? 'Business' : 'Developer Admin',
        body: form.get('body'),
        isInternal: !isVendor && form.get('isInternal') === 'on',
      })
      setMessage(isVendor ? 'Reply sent to support.' : 'Reply added to ticket.')
      event.currentTarget.reset()
      await loadData(selectedTicket.id)
      setReplyOpen(false)
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
      setStatusOpen(false)
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
          <h1 className="page-title">{documentationOnly ? 'Documentation' : isVendor ? 'Support Tickets' : feedbackOnly ? 'Feedback' : 'Developer Support Queue'}</h1>
          <p className="page-subtitle">
            {documentationOnly
              ? 'Simple operating guide for routers, sales, payments, withdrawals, and support.'
              : isVendor
              ? 'Submit router, payment, wallet, voucher, and customer connection issues for developer admin support.'
              : feedbackOnly
                ? 'Review product suggestions, improvement recommendations, ratings, and user comments.'
                : 'Attend business tickets, assign ownership, update status, and reply with clear next steps.'}
          </p>
        </div>
        {isVendor && !documentationOnly && <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>Submit Ticket</button>}
      </div>

      {documentationOnly && (
        <div className="support-docs-grid">
          {documentationSections.map((section) => (
            <section className="card support-doc-card" key={section.title}>
              <div className="card-header">
                <span className="card-title">{section.title}</span>
              </div>
              <ol>
                {section.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </section>
          ))}
        </div>
      )}

      {documentationOnly && (
        <div className="card support-doc-card">
          <div className="card-header"><span className="card-title">When to submit a ticket</span></div>
          <p>Submit a ticket when a payment was deducted but access did not activate, a router is unreachable, a voucher cannot be redeemed, a withdrawal is stuck, or you need verified support contact changes.</p>
        </div>
      )}

      {(message || error) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: 14 }}>
            {message && <p style={{ color: 'var(--success-fg)', fontSize: 13 }}>{message}</p>}
            {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}
          </div>
        </div>
      )}

      {!documentationOnly && <div className="stats-grid" style={{ marginBottom: 20 }}>
        <Stat label="Total" value={`${data?.summary.totalTickets ?? 0}`} color="blue" />
        <Stat label="Open" value={`${data?.summary.open ?? 0}`} color="amber" />
        <Stat label="In Progress" value={`${data?.summary.inProgress ?? 0}`} color="purple" />
        <Stat label="Critical" value={`${data?.summary.critical ?? 0}`} color="green" />
      </div>}

      {!documentationOnly && <div className="support-layout">
        <div className="card" style={{ margin: 0 }}>
          <div className="card-header">
            <span className="card-title">{isVendor ? 'My Tickets' : 'Ticket Queue'}</span>
          </div>
          <div className="support-filter-bar">
            {statusFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`support-filter-chip ${statusFilter === filter ? 'active' : ''}`}
                onClick={() => setStatusFilter(filter)}
              >
                {filter === 'ALL' ? 'All' : filter.toLowerCase().replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="support-ticket-list">
            {loading && <div className="empty-state"><p>Loading tickets...</p></div>}
            {!loading && tickets.length === 0 && <div className="empty-state"><p>No tickets match this filter.</p></div>}
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className={`support-ticket-row ${selectedTicket?.id === ticket.id ? 'active' : ''}`}
                onClick={() => setSelectedTicketId(ticket.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <strong style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.3 }}>{ticket.subject}</strong>
                  <span className={getStatusBadgeClass(ticket.priority)} style={{ flexShrink: 0 }}>{ticket.priority.toLowerCase()}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{ticket.reference}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{ticket.category}</div>
                {!isVendor && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{ticket.tenant?.name ?? 'N/A'}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span className={getStatusBadgeClass(ticket.status)}>{ticket.status.toLowerCase().replace('_', ' ')}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(ticket.latestResponseAt ?? ticket.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedTicket ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <span className="card-title">{selectedTicket.reference} - {selectedTicket.subject}</span>
                <span className={getStatusBadgeClass(selectedTicket.status)}>{selectedTicket.status.toLowerCase().replace('_', ' ')}</span>
              </div>
              <div style={{ padding: 20, display: 'grid', gap: 12, maxHeight: 420, overflowY: 'auto' }}>
                {selectedTicket.messages.length === 0 && <div className="empty-state"><p>No replies yet.</p></div>}
                {selectedTicket.messages
                  .filter((item) => isVendor ? !item.isInternal : true)
                  .map((item) => (
                    <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: item.isInternal ? 'var(--bg-app)' : 'var(--bg-card)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{item.authorName}</strong>
                        <span className={getStatusBadgeClass(item.isInternal ? 'WARNING' : 'INFO')}>{item.isInternal ? 'internal' : item.authorRole}</span>
                      </div>
                      <p style={{ marginTop: 8, color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{item.body}</p>
                      <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(item.createdAt)}</div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <span className="card-title">{isVendor ? 'Next Action' : 'Support Actions'}</span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {!isVendor && <button type="button" className="btn btn-ghost" onClick={() => setStatusOpen(true)}>Update Status</button>}
                  <button type="button" className="btn btn-primary" onClick={() => setReplyOpen(true)}>{isVendor ? 'Reply to Support' : 'Send Reply'}</button>
                </div>
              </div>
              <div style={{ padding: 20, color: 'var(--text-secondary)' }}>
                Replies and ticket changes open in focused popups so the conversation stays clean and easy to read.
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ margin: 0 }}>
            <div className="empty-state">
              <p>Select a ticket from the list to see its conversation.</p>
            </div>
          </div>
        )}
      </div>}

      {selectedTicket && (
        <Modal open={replyOpen} onClose={() => !submitting && setReplyOpen(false)} closeDisabled={submitting} kicker="Support reply" title={isVendor ? 'Reply to Support' : 'Send Support Reply'}>
          <form onSubmit={updateTicket} style={{ marginTop: 20, display: 'grid', gap: 12 }}>
            <Field label="Reply"><textarea name="body" className="form-input" rows={5} required maxLength={4000} /></Field>
            {!isVendor && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                <input name="isInternal" type="checkbox" /> Internal developer note
              </label>
            )}
            <FormProcessStatus busy={submittingAction === 'reply'} error={submittingAction === 'reply' ? formError : null} text={processText || 'Sending reply and saving it in the ticket history.'} />
            <button className="btn btn-primary btn-block" disabled={submitting}>{submitting && submittingAction === 'reply' ? 'Sending reply...' : 'Send Reply'}</button>
          </form>
        </Modal>
      )}

      {selectedTicket && !isVendor && (
        <Modal open={statusOpen} onClose={() => !submitting && setStatusOpen(false)} closeDisabled={submitting} kicker="Ticket control" title="Update Ticket Status">
          <form onSubmit={updateTicketStatus} style={{ marginTop: 20, display: 'grid', gap: 12 }}>
            <Field label="Status">
              <select name="status" className="form-input" defaultValue={selectedTicket.status}>
                {statuses.map((status) => <option key={status} value={status}>{status.toLowerCase().replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" className="form-input" defaultValue={selectedTicket.priority}>
                {priorities.map((priority) => <option key={priority} value={priority}>{priority.toLowerCase()}</option>)}
              </select>
            </Field>
            <Field label="Assigned to"><input name="assignedTo" className="form-input" defaultValue={selectedTicket.assignedTo ?? session?.user.displayName ?? ''} /></Field>
            <FormProcessStatus busy={submittingAction === 'status'} error={submittingAction === 'status' ? formError : null} text={processText || 'Updating ticket status and saving an internal note.'} />
            <button className="btn btn-primary btn-block" disabled={submitting}>{submitting && submittingAction === 'status' ? 'Updating...' : 'Update Status'}</button>
          </form>
        </Modal>
      )}

      {isVendor && (
        <Modal open={createOpen} onClose={() => !submitting && setCreateOpen(false)} closeDisabled={submitting} kicker="Business support" title="Submit Ticket">
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
              <Field label="Phone number"><PhoneNumberField name="phoneNumber" /></Field>
              <Field label="Email"><input name="email" type="email" className="form-input" placeholder={session?.user.email ?? 'support contact email'} /></Field>
              <Field label="What happened?"><textarea name="body" className="form-input" rows={5} required maxLength={4000} /></Field>
              <FormProcessStatus busy={submittingAction === 'create'} error={submittingAction === 'create' ? formError : null} text={processText || 'Submitting ticket. The modal closes after the ticket is saved.'} />
              <button className="btn btn-primary btn-block" disabled={submitting}>{submitting ? 'Submitting ticket...' : 'Submit Ticket'}</button>
            </form>
        </Modal>
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
