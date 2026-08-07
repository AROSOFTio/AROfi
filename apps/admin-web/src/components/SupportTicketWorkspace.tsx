'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AdminSessionResponse, SupportTicketResponse } from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { Modal } from '@/components/Modal'
import { PhoneNumberField } from '@/components/PhoneNumberField'
import { clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatDate, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'

type Ticket = SupportTicketResponse['items'][number]
type TicketStatus = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
type TicketAction = 'create' | 'reply' | 'status' | ''

const ticketCategories = [
  { value: 'Router setup', label: 'Router', code: 'RT' },
  { value: 'Payment issue', label: 'Payment', code: 'PM' },
  { value: 'Customer connection', label: 'Connection', code: 'CN' },
  { value: 'Voucher issue', label: 'Voucher', code: 'VC' },
  { value: 'Wallet withdrawal', label: 'Withdrawal', code: 'WD' },
  { value: 'Other', label: 'Other', code: 'OT' },
] as const

const statusFilters: TicketStatus[] = ['ALL', 'OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']
const adminStatuses = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']
const adminPriorities = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']

function cleanLabel(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function priorityLabel(priority: string) {
  if (priority === 'CRITICAL') return 'Critical'
  if (priority === 'HIGH') return 'Urgent'
  if (priority === 'LOW') return 'Low'
  return 'Normal'
}

export default function SupportTicketWorkspace({ feedbackOnly = false }: { feedbackOnly?: boolean }) {
  const [session, setSession] = useState<AdminSessionResponse | null>(null)
  const [data, setData] = useState<SupportTicketResponse | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TicketStatus>('ALL')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [createCategory, setCreateCategory] = useState('')
  const [createUrgency, setCreateUrgency] = useState<'NORMAL' | 'HIGH'>('NORMAL')
  const [replyOpen, setReplyOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submittingAction, setSubmittingAction] = useState<TicketAction>('')
  const [processText, setProcessText] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const isVendor = isVendorWorkspace(session?.user)
  const allTickets = data?.items ?? []
  const visibleTickets = useMemo(() => {
    const query = search.trim().toLowerCase()
    return allTickets.filter((ticket) => {
      if (feedbackOnly && !ticket.category.startsWith('Product feedback')) return false
      if (statusFilter !== 'ALL' && ticket.status !== statusFilter) return false
      if (!query) return true
      return [
        ticket.reference,
        ticket.subject,
        ticket.category,
        ticket.status,
        ticket.priority,
        ticket.tenant?.name,
        ticket.phoneNumber,
        ticket.email,
      ].some((value) => value?.toLowerCase().includes(query))
    })
  }, [allTickets, feedbackOnly, search, statusFilter])

  const selectedTicket = useMemo(
    () => visibleTickets.find((ticket) => ticket.id === selectedTicketId) ?? visibleTickets[0] ?? null,
    [selectedTicketId, visibleTickets],
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
      setSelectedTicketId((current) => {
        const preferred = preferredTicketId ?? current
        return preferred && supportData.items.some((ticket) => ticket.id === preferred)
          ? preferred
          : supportData.items[0]?.id ?? null
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load tickets')
    } finally {
      setLoading(false)
    }
  }

  function openCreateTicket() {
    setCreateStep(1)
    setCreateCategory('')
    setCreateUrgency('NORMAL')
    setFormError('')
    setCreateOpen(true)
  }

  function closeCreateTicket() {
    if (submitting) return
    setCreateOpen(false)
    setCreateStep(1)
    setCreateCategory('')
    setCreateUrgency('NORMAL')
    setFormError('')
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!createCategory) {
      setCreateStep(1)
      setFormError('Select an issue type')
      return
    }

    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setSubmittingAction('create')
    setProcessText('Submitting ticket…')
    setFormError('')
    setError('')
    setNotice('')

    try {
      const ticket = await clientPostApi<Ticket>('/system/support-tickets', {
        subject: String(form.get('subject') ?? '').trim(),
        category: createCategory,
        priority: createUrgency,
        channel: 'PORTAL',
        phoneNumber: form.get('phoneNumber') || undefined,
        email: form.get('email') || session?.user.email,
        openedBy: session?.user.displayName ?? session?.user.email,
      })

      const body = String(form.get('body') ?? '').trim()
      await clientPostApi(`/system/support-tickets/${ticket.id}/messages`, {
        authorName: session?.user.displayName ?? session?.user.email ?? 'Business',
        authorRole: isVendor ? 'Business' : 'Developer Admin',
        body,
        isInternal: false,
      })

      setNotice(`Ticket ${ticket.reference} submitted`)
      closeCreateTicket()
      await loadData(ticket.id)
    } catch (caught) {
      const failure = caught instanceof Error ? caught.message : 'Unable to submit ticket'
      setFormError(failure)
      setError(failure)
    } finally {
      setSubmitting(false)
      setSubmittingAction('')
      setProcessText('')
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTicket) return
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setSubmittingAction('reply')
    setProcessText('Sending reply…')
    setFormError('')
    setError('')
    setNotice('')

    try {
      await clientPostApi(`/system/support-tickets/${selectedTicket.id}/messages`, {
        authorName: session?.user.displayName ?? session?.user.email ?? 'Support',
        authorRole: isVendor ? 'Business' : 'Developer Admin',
        body: form.get('body'),
        isInternal: !isVendor && form.get('isInternal') === 'on',
      })
      setNotice('Reply sent')
      event.currentTarget.reset()
      await loadData(selectedTicket.id)
      setReplyOpen(false)
    } catch (caught) {
      const failure = caught instanceof Error ? caught.message : 'Unable to send reply'
      setFormError(failure)
      setError(failure)
    } finally {
      setSubmitting(false)
      setSubmittingAction('')
      setProcessText('')
    }
  }

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTicket || isVendor) return
    const form = new FormData(event.currentTarget)
    const status = String(form.get('status') ?? selectedTicket.status)
    const priority = String(form.get('priority') ?? selectedTicket.priority)
    const assignedTo = String(form.get('assignedTo') ?? '').trim()
    setSubmitting(true)
    setSubmittingAction('status')
    setProcessText('Updating ticket…')
    setFormError('')
    setError('')
    setNotice('')

    try {
      await clientPatchApi(`/system/support-tickets/${selectedTicket.id}`, {
        status,
        priority,
        assignedTo: assignedTo || undefined,
      })
      await clientPostApi(`/system/support-tickets/${selectedTicket.id}/messages`, {
        authorName: session?.user.displayName ?? session?.user.email ?? 'Developer Admin',
        authorRole: 'Developer Admin',
        body: `Status changed to ${cleanLabel(status)}${assignedTo ? ` · Assigned to ${assignedTo}` : ''}.`,
        isInternal: true,
      })
      setNotice('Ticket updated')
      await loadData(selectedTicket.id)
      setStatusOpen(false)
    } catch (caught) {
      const failure = caught instanceof Error ? caught.message : 'Unable to update ticket'
      setFormError(failure)
      setError(failure)
    } finally {
      setSubmitting(false)
      setSubmittingAction('')
      setProcessText('')
    }
  }

  const filteredCount = visibleTickets.length
  const totalForView = feedbackOnly
    ? allTickets.filter((ticket) => ticket.category.startsWith('Product feedback')).length
    : data?.summary.totalTickets ?? 0

  return (
    <>
      <style>{`
        .ticket-page{display:grid;gap:14px;font-family:"Segoe UI",SegoeUI,Arial,sans-serif}
        .ticket-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
        .ticket-head h1{margin:0;font-size:25px;line-height:1.15;color:var(--text-1);font-weight:800;letter-spacing:-.025em}
        .ticket-head p{margin:5px 0 0;color:var(--text-3);font-size:12.5px}
        .ticket-summary{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:10px 13px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}
        .ticket-summary-item{display:flex;align-items:baseline;gap:6px;font-size:11.5px;color:var(--text-3)}
        .ticket-summary-item strong{font-size:15px;color:var(--text-1)}
        .ticket-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}
        .ticket-filters{display:flex;gap:5px;flex-wrap:wrap}
        .ticket-filter{border:1px solid transparent;border-radius:7px;background:transparent;color:var(--text-2);font:inherit;font-size:11.5px;font-weight:700;padding:7px 9px;cursor:pointer}
        .ticket-filter:hover{background:var(--surface-muted)}
        .ticket-filter.active{background:var(--brand-fg,#2563eb);color:#fff}
        .ticket-search{width:min(270px,100%);border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text-1);font:inherit;font-size:12.5px;padding:9px 11px;outline:none}
        .ticket-search:focus{border-color:var(--brand-fg,#2563eb);box-shadow:0 0 0 3px rgba(37,99,235,.10)}
        .ticket-layout{display:grid;grid-template-columns:minmax(290px,370px) minmax(0,1fr);gap:12px;min-height:510px}
        .ticket-panel{border:1px solid var(--border);border-radius:11px;background:var(--bg-card);overflow:hidden;min-width:0}
        .ticket-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border)}
        .ticket-panel-title{font-size:13px;font-weight:800;color:var(--text-1)}
        .ticket-panel-count{font-size:11px;color:var(--text-3)}
        .ticket-list{max-height:620px;overflow:auto;padding:6px}
        .ticket-row{display:block;width:100%;border:1px solid transparent;border-radius:9px;background:transparent;padding:10px;text-align:left;cursor:pointer;font:inherit;color:inherit}
        .ticket-row:hover{background:var(--surface-muted)}
        .ticket-row.active{border-color:rgba(37,99,235,.28);background:rgba(37,99,235,.07)}
        .ticket-row + .ticket-row{margin-top:3px}
        .ticket-row-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
        .ticket-row-title{font-size:12.5px;line-height:1.35;font-weight:750;color:var(--text-1)}
        .ticket-row-ref{margin-top:3px;font-size:10.5px;color:var(--text-3);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
        .ticket-row-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}
        .ticket-row-category{font-size:10.5px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ticket-row-time{font-size:10px;color:var(--text-3);white-space:nowrap}
        .ticket-empty{display:grid;place-items:center;gap:9px;min-height:210px;padding:24px;text-align:center;color:var(--text-3);font-size:12.5px}
        .ticket-detail{display:grid;grid-template-rows:auto auto minmax(250px,1fr) auto;min-height:510px}
        .ticket-detail-title{min-width:0}
        .ticket-detail-title strong{display:block;color:var(--text-1);font-size:14px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ticket-detail-title span{display:block;margin-top:2px;color:var(--text-3);font-size:10.5px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
        .ticket-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface-muted)}
        .ticket-meta-item span{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3)}
        .ticket-meta-item strong{display:block;margin-top:2px;font-size:11.5px;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ticket-thread{overflow:auto;padding:14px;display:flex;flex-direction:column;gap:9px;background:var(--bg-app)}
        .ticket-message{max-width:86%;border:1px solid var(--border);border-radius:10px;padding:10px 11px;background:var(--bg-card);align-self:flex-start}
        .ticket-message.internal{background:#fff8e6;border-color:#f3d58b}
        .ticket-message-head{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:10.5px;color:var(--text-3)}
        .ticket-message-head strong{font-size:11.5px;color:var(--text-1)}
        .ticket-message p{margin:6px 0 0;white-space:pre-wrap;color:var(--text-2);font-size:12.5px;line-height:1.5}
        .ticket-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid var(--border);background:var(--bg-card)}
        .ticket-contact{font-size:10.5px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ticket-action-buttons{display:flex;gap:7px;flex-wrap:wrap}
        .ticket-notice{padding:10px 12px;border-radius:9px;font-size:12px;font-weight:700}
        .ticket-notice.ok{border:1px solid #b7e4c7;background:#effaf3;color:#166534}
        .ticket-notice.error{border:1px solid #fecaca;background:#fff1f2;color:#b91c1c}
        .ticket-step{display:flex;align-items:center;gap:8px;margin-top:14px}
        .ticket-step-dot{display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:var(--surface-muted);color:var(--text-3);font-size:10.5px;font-weight:800}
        .ticket-step-dot.active{background:var(--brand-fg,#2563eb);color:#fff}
        .ticket-step-line{height:1px;flex:1;background:var(--border)}
        .ticket-category-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:15px}
        .ticket-category{display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:9px;background:var(--bg-card);padding:11px;text-align:left;cursor:pointer;font:inherit;color:var(--text-1)}
        .ticket-category:hover{border-color:rgba(37,99,235,.45);background:rgba(37,99,235,.04)}
        .ticket-category.active{border-color:var(--brand-fg,#2563eb);box-shadow:0 0 0 2px rgba(37,99,235,.10)}
        .ticket-category-code{display:grid;place-items:center;width:31px;height:31px;border-radius:8px;background:var(--surface-muted);font-size:10.5px;font-weight:800;color:var(--brand-fg,#2563eb)}
        .ticket-category-label{font-size:12.5px;font-weight:750}
        .ticket-modal-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:14px}
        .ticket-form{display:grid;gap:11px;margin-top:14px}
        .ticket-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .ticket-form label{display:grid;gap:5px;font-size:11.5px;font-weight:700;color:var(--text-2)}
        .ticket-form .form-input{font-family:"Segoe UI",SegoeUI,Arial,sans-serif}
        .ticket-urgency{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
        .ticket-urgency button{border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:9px;font:inherit;font-size:11.5px;font-weight:750;color:var(--text-2);cursor:pointer}
        .ticket-urgency button.active{border-color:var(--brand-fg,#2563eb);background:rgba(37,99,235,.07);color:var(--brand-fg,#2563eb)}
        @media(max-width:900px){.ticket-layout{grid-template-columns:1fr}.ticket-list{max-height:340px}.ticket-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.ticket-detail{min-height:470px}}
        @media(max-width:620px){.ticket-head{align-items:center}.ticket-head h1{font-size:22px}.ticket-head p{display:none}.ticket-summary{gap:12px}.ticket-toolbar{align-items:stretch;flex-direction:column}.ticket-search{width:100%}.ticket-filters{overflow:auto;flex-wrap:nowrap;padding-bottom:1px}.ticket-filter{white-space:nowrap}.ticket-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.ticket-message{max-width:96%}.ticket-actions{align-items:flex-start;flex-direction:column}.ticket-action-buttons{width:100%}.ticket-action-buttons .btn{flex:1}.ticket-category-grid,.ticket-form-grid{grid-template-columns:1fr}}
      `}</style>

      <div className="ticket-page">
        <header className="ticket-head">
          <div>
            <h1>{feedbackOnly ? 'Feedback' : isVendor ? 'Support tickets' : 'Support queue'}</h1>
            <p>{feedbackOnly ? 'Product suggestions and ratings.' : isVendor ? 'Report an issue and track the response.' : 'Review, assign, and resolve business tickets.'}</p>
          </div>
          {isVendor && !feedbackOnly && (
            <button type="button" className="btn btn-primary" onClick={openCreateTicket}>New ticket</button>
          )}
        </header>

        {(notice || error) && (
          <div className={`ticket-notice ${error ? 'error' : 'ok'}`}>{error || notice}</div>
        )}

        <div className="ticket-summary">
          <div className="ticket-summary-item"><strong>{totalForView}</strong><span>Total</span></div>
          <div className="ticket-summary-item"><strong>{data?.summary.open ?? 0}</strong><span>Open</span></div>
          <div className="ticket-summary-item"><strong>{data?.summary.inProgress ?? 0}</strong><span>In progress</span></div>
          <div className="ticket-summary-item"><strong>{data?.summary.pendingCustomer ?? 0}</strong><span>Waiting</span></div>
          <div className="ticket-summary-item"><strong>{data?.summary.resolved ?? 0}</strong><span>Resolved</span></div>
        </div>

        <div className="ticket-toolbar">
          <div className="ticket-filters">
            {statusFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`ticket-filter ${statusFilter === filter ? 'active' : ''}`}
                onClick={() => setStatusFilter(filter)}
              >
                {filter === 'ALL' ? 'All' : filter === 'PENDING_CUSTOMER' ? 'Waiting' : cleanLabel(filter)}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="ticket-search"
            placeholder="Search tickets"
            aria-label="Search tickets"
          />
        </div>

        <div className="ticket-layout">
          <section className="ticket-panel">
            <div className="ticket-panel-head">
              <span className="ticket-panel-title">{isVendor ? 'My tickets' : 'Tickets'}</span>
              <span className="ticket-panel-count">{filteredCount}</span>
            </div>
            <div className="ticket-list">
              {loading && <div className="ticket-empty">Loading tickets…</div>}
              {!loading && visibleTickets.length === 0 && (
                <div className="ticket-empty">
                  <span>{search || statusFilter !== 'ALL' ? 'No matching tickets.' : 'No tickets yet.'}</span>
                  {isVendor && !feedbackOnly && !search && statusFilter === 'ALL' && (
                    <button type="button" className="btn btn-primary" onClick={openCreateTicket}>Create first ticket</button>
                  )}
                </div>
              )}
              {visibleTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  className={`ticket-row ${selectedTicket?.id === ticket.id ? 'active' : ''}`}
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <div className="ticket-row-top">
                    <span className="ticket-row-title">{ticket.subject}</span>
                    <span className={getStatusBadgeClass(ticket.status)}>{ticket.status === 'PENDING_CUSTOMER' ? 'waiting' : ticket.status.toLowerCase().replace(/_/g, ' ')}</span>
                  </div>
                  <div className="ticket-row-ref">{ticket.reference}</div>
                  {!isVendor && ticket.tenant?.name && <div className="ticket-row-category">{ticket.tenant.name}</div>}
                  <div className="ticket-row-meta">
                    <span className="ticket-row-category">{ticket.category} · {priorityLabel(ticket.priority)}</span>
                    <span className="ticket-row-time">{formatDate(ticket.latestResponseAt ?? ticket.updatedAt ?? ticket.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {selectedTicket ? (
            <section className="ticket-panel ticket-detail">
              <div className="ticket-panel-head">
                <div className="ticket-detail-title">
                  <strong>{selectedTicket.subject}</strong>
                  <span>{selectedTicket.reference}</span>
                </div>
                <span className={getStatusBadgeClass(selectedTicket.status)}>
                  {selectedTicket.status === 'PENDING_CUSTOMER' ? 'waiting' : selectedTicket.status.toLowerCase().replace(/_/g, ' ')}
                </span>
              </div>

              <div className="ticket-meta">
                <div className="ticket-meta-item"><span>Type</span><strong>{selectedTicket.category}</strong></div>
                <div className="ticket-meta-item"><span>Priority</span><strong>{priorityLabel(selectedTicket.priority)}</strong></div>
                <div className="ticket-meta-item"><span>Opened</span><strong>{formatDate(selectedTicket.createdAt)}</strong></div>
                <div className="ticket-meta-item"><span>Assigned</span><strong>{selectedTicket.assignedTo ?? 'Unassigned'}</strong></div>
              </div>

              <div className="ticket-thread">
                {selectedTicket.messages.length === 0 && (
                  <div className="ticket-empty">Support replies will appear here.</div>
                )}
                {selectedTicket.messages
                  .filter((item) => isVendor ? !item.isInternal : true)
                  .map((item) => (
                    <article key={item.id} className={`ticket-message ${item.isInternal ? 'internal' : ''}`}>
                      <div className="ticket-message-head">
                        <strong>{item.authorName}</strong>
                        <span>{item.isInternal ? 'Internal note' : item.authorRole} · {formatDate(item.createdAt)}</span>
                      </div>
                      <p>{item.body}</p>
                    </article>
                  ))}
              </div>

              <div className="ticket-actions">
                <div className="ticket-contact">{selectedTicket.phoneNumber ?? selectedTicket.email ?? selectedTicket.tenant?.name ?? ''}</div>
                <div className="ticket-action-buttons">
                  {!isVendor && (
                    <button type="button" className="btn btn-ghost" onClick={() => { setFormError(''); setStatusOpen(true) }}>Update</button>
                  )}
                  <button type="button" className="btn btn-primary" onClick={() => { setFormError(''); setReplyOpen(true) }}>
                    {isVendor ? 'Reply' : 'Send reply'}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="ticket-panel ticket-empty">Select a ticket to open it.</section>
          )}
        </div>
      </div>

      {isVendor && !feedbackOnly && (
        <Modal open={createOpen} onClose={closeCreateTicket} closeDisabled={submitting} kicker={`Step ${createStep} of 2`} title={createStep === 1 ? 'What needs help?' : 'Ticket details'}>
          <div className="ticket-step">
            <span className="ticket-step-dot active">1</span>
            <span className="ticket-step-line" />
            <span className={`ticket-step-dot ${createStep === 2 ? 'active' : ''}`}>2</span>
          </div>

          {createStep === 1 ? (
            <div>
              <div className="ticket-category-grid">
                {ticketCategories.map((category) => (
                  <button
                    key={category.value}
                    type="button"
                    className={`ticket-category ${createCategory === category.value ? 'active' : ''}`}
                    onClick={() => setCreateCategory(category.value)}
                  >
                    <span className="ticket-category-code">{category.code}</span>
                    <span className="ticket-category-label">{category.label}</span>
                  </button>
                ))}
              </div>
              {formError && <div className="ticket-notice error" style={{ marginTop: 10 }}>{formError}</div>}
              <div className="ticket-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeCreateTicket}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    if (!createCategory) {
                      setFormError('Select an issue type')
                      return
                    }
                    setFormError('')
                    setCreateStep(2)
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <form className="ticket-form" onSubmit={createTicket}>
              <label>
                Issue title
                <input name="subject" className="form-input" required maxLength={180} placeholder="Example: Customer paid but is still offline" autoFocus />
              </label>
              <label>
                Details
                <textarea name="body" className="form-input" rows={5} required maxLength={4000} placeholder="Include the phone number, voucher, router, amount, and time where relevant." />
              </label>
              <div className="ticket-form-grid">
                <label>
                  Contact phone
                  <PhoneNumberField name="phoneNumber" />
                </label>
                <label>
                  Contact email
                  <input name="email" type="email" className="form-input" defaultValue={session?.user.email ?? ''} />
                </label>
              </div>
              <label>
                Urgency
                <div className="ticket-urgency">
                  <button type="button" className={createUrgency === 'NORMAL' ? 'active' : ''} onClick={() => setCreateUrgency('NORMAL')}>Normal</button>
                  <button type="button" className={createUrgency === 'HIGH' ? 'active' : ''} onClick={() => setCreateUrgency('HIGH')}>Urgent</button>
                </div>
              </label>
              {(submittingAction === 'create' || formError) && (
                <FormProcessStatus busy={submittingAction === 'create'} error={formError || null} text={processText || 'Submitting ticket…'} />
              )}
              <div className="ticket-modal-actions">
                <button type="button" className="btn btn-ghost" disabled={submitting} onClick={() => setCreateStep(1)}>Back</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit ticket'}</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {selectedTicket && (
        <Modal open={replyOpen} onClose={() => !submitting && setReplyOpen(false)} closeDisabled={submitting} kicker={selectedTicket.reference} title={isVendor ? 'Reply to support' : 'Send reply'}>
          <form className="ticket-form" onSubmit={sendReply}>
            <label>
              Message
              <textarea name="body" className="form-input" rows={6} required maxLength={4000} autoFocus />
            </label>
            {!isVendor && (
              <label style={{ display: 'flex', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 8 }}>
                <input name="isInternal" type="checkbox" /> Internal note
              </label>
            )}
            {(submittingAction === 'reply' || formError) && (
              <FormProcessStatus busy={submittingAction === 'reply'} error={formError || null} text={processText || 'Sending reply…'} />
            )}
            <div className="ticket-modal-actions">
              <button type="button" className="btn btn-ghost" disabled={submitting} onClick={() => setReplyOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Sending…' : 'Send reply'}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedTicket && !isVendor && (
        <Modal open={statusOpen} onClose={() => !submitting && setStatusOpen(false)} closeDisabled={submitting} kicker={selectedTicket.reference} title="Update ticket">
          <form className="ticket-form" onSubmit={updateStatus}>
            <div className="ticket-form-grid">
              <label>
                Status
                <select name="status" className="form-input" defaultValue={selectedTicket.status}>
                  {adminStatuses.map((status) => <option key={status} value={status}>{cleanLabel(status)}</option>)}
                </select>
              </label>
              <label>
                Priority
                <select name="priority" className="form-input" defaultValue={selectedTicket.priority}>
                  {adminPriorities.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}
                </select>
              </label>
            </div>
            <label>
              Assigned to
              <input name="assignedTo" className="form-input" defaultValue={selectedTicket.assignedTo ?? session?.user.displayName ?? ''} />
            </label>
            {(submittingAction === 'status' || formError) && (
              <FormProcessStatus busy={submittingAction === 'status'} error={formError || null} text={processText || 'Updating ticket…'} />
            )}
            <div className="ticket-modal-actions">
              <button type="button" className="btn btn-ghost" disabled={submitting} onClick={() => setStatusOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Updating…' : 'Save changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
