'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Clock3, Mail, MessageSquare, Search, UserRound } from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { Modal } from '@/components/Modal'
import { PhoneNumberField } from '@/components/PhoneNumberField'
import { clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatDate, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
type Ticket = {
  id: string
  tenantId: string
  reference: string
  subject: string
  category: string
  priority: TicketPriority
  status: TicketStatus
  channel: string
  phoneNumber?: string | null
  email?: string | null
  openedBy?: string | null
  assignedTo?: string | null
  assignee?: { id: string; email: string; displayName: string; role: string } | null
  latestResponseAt?: string | null
  resolvedAt?: string | null
  createdAt: string
  updatedAt: string
  tenant?: { id: string; name: string } | null
  messages: Array<{
    id: string
    authorName: string
    authorRole: string
    body: string
    isInternal: boolean
    createdAt: string
  }>
}
type TicketResponse = {
  summary: { totalTickets: number; open: number; inProgress: number; pendingCustomer: number; resolved: number; closed: number; critical: number }
  items: Ticket[]
}
type StaffResponse = { items: Array<{ id: string; email: string; displayName: string; role: string }> }

type Filter = 'ALL' | TicketStatus
const filters: Filter[] = ['ALL', 'OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']
const statuses: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']
const priorities: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']
const categories = ['Router setup', 'Payment issue', 'Customer connection', 'Voucher issue', 'Wallet withdrawal', 'Other']

function label(value: string) {
  if (value === 'PENDING_CUSTOMER') return 'Waiting for customer'
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function priorityLabel(value: TicketPriority) {
  return value === 'HIGH' ? 'Urgent' : label(value)
}

export default function SupportTicketWorkspaceV2({ feedbackOnly = false }: { feedbackOnly?: boolean }) {
  const searchParams = useSearchParams()
  const requestedTicket = searchParams.get('ticket')
  const [session, setSession] = useState<AdminSessionResponse | null>(null)
  const [data, setData] = useState<TicketResponse | null>(null)
  const [staff, setStaff] = useState<StaffResponse['items']>([])
  const [selectedId, setSelectedId] = useState<string | null>(requestedTicket)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [replyOpen, setReplyOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const isBusiness = isVendorWorkspace(session?.user)
  const canWrite = Boolean(session?.user.permissions.includes('support.write') || session?.user.permissions.includes('ALL'))
  const isPlatformSupport = Boolean(session && !isBusiness && session.user.permissions.includes('support.read'))

  async function load(silent = false, preferredId?: string | null) {
    if (!silent) setLoading(true)
    try {
      const sessionData = session ?? await clientFetchApi<AdminSessionResponse>('/auth/me')
      if (!session) setSession(sessionData)
      const tickets = await clientFetchApi<TicketResponse>('/support-floor/tickets')
      setData(tickets)
      const platform = !isVendorWorkspace(sessionData.user)
      if (platform && (sessionData.user.permissions.includes('support.read') || sessionData.user.permissions.includes('ALL'))) {
        try {
          const supportStaff = await clientFetchApi<StaffResponse>('/support-floor/staff')
          setStaff(supportStaff.items)
        } catch {
          setStaff([])
        }
      }
      const preferred = preferredId ?? requestedTicket ?? selectedId
      setSelectedId(preferred && tickets.items.some((ticket) => ticket.id === preferred) ? preferred : tickets.items[0]?.id ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load support tickets')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void load(false, requestedTicket)
    const timer = window.setInterval(() => void load(true), 15_000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (requestedTicket) setSelectedId(requestedTicket)
  }, [requestedTicket])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.items ?? []).filter((ticket) => {
      if (feedbackOnly && !ticket.category.startsWith('Product feedback')) return false
      if (filter !== 'ALL' && ticket.status !== filter) return false
      if (!needle) return true
      return [ticket.reference, ticket.subject, ticket.category, ticket.tenant?.name, ticket.email, ticket.phoneNumber, ticket.assignee?.displayName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [data?.items, feedbackOnly, filter, search])

  const selected = (data?.items ?? []).find((ticket) => ticket.id === selectedId) ?? visible[0] ?? null

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true); setError(''); setNotice('')
    try {
      const ticket = await clientPostApi<Ticket>('/support-floor/tickets', {
        subject: String(form.get('subject') ?? '').trim(),
        category: String(form.get('category') ?? 'Other'),
        priority: String(form.get('priority') ?? 'NORMAL'),
        body: String(form.get('body') ?? '').trim(),
        phoneNumber: String(form.get('phoneNumber') ?? '').trim() || undefined,
        email: String(form.get('email') ?? '').trim() || session?.user.email,
      })
      setCreateOpen(false)
      setNotice(`Ticket ${ticket.reference} submitted. AROFi Support has been notified.`)
      await load(false, ticket.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit ticket')
    } finally { setSubmitting(false) }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    setSubmitting(true); setError(''); setNotice('')
    try {
      const statusAfterReply = String(form.get('statusAfterReply') ?? '')
      await clientPostApi(`/support-floor/tickets/${selected.id}/messages`, {
        body: String(form.get('body') ?? '').trim(),
        isInternal: !isBusiness && form.get('isInternal') === 'on',
        statusAfterReply: !isBusiness && statusAfterReply ? statusAfterReply : undefined,
      })
      setReplyOpen(false)
      setNotice('Reply sent successfully.')
      await load(false, selected.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send reply')
    } finally { setSubmitting(false) }
  }

  async function updateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    setSubmitting(true); setError(''); setNotice('')
    try {
      await clientPatchApi(`/support-floor/tickets/${selected.id}`, {
        status: String(form.get('status') ?? selected.status),
        priority: String(form.get('priority') ?? selected.priority),
        assigneeUserId: String(form.get('assigneeUserId') ?? '') || null,
      })
      setUpdateOpen(false)
      setNotice('Ticket workflow updated.')
      await load(false, selected.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update ticket')
    } finally { setSubmitting(false) }
  }

  const summary = data?.summary

  return (
    <div className="support-v2">
      <style>{`
        .support-v2{display:grid;gap:14px}.sv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.sv-head h1{font-size:24px;margin:0;color:var(--text-1)}.sv-head p{font-size:12.5px;color:var(--text-3);margin:5px 0 0}.sv-summary{display:grid;grid-template-columns:repeat(6,minmax(95px,1fr));gap:8px}.sv-stat{border:1px solid var(--border);border-radius:10px;background:var(--bg-card);padding:10px 12px}.sv-stat strong{font-size:17px}.sv-stat span{display:block;font-size:10.5px;color:var(--text-3);margin-top:2px}.sv-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);padding:9px}.sv-filters{display:flex;gap:4px;flex-wrap:wrap}.sv-filter{border:0;background:transparent;border-radius:7px;padding:7px 9px;font-size:11.5px;font-weight:700;color:var(--text-2);cursor:pointer}.sv-filter.active{background:var(--brand-fg,#2563eb);color:#fff}.sv-search{display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:8px;padding:7px 9px;width:min(280px,100%)}.sv-search input{border:0;outline:0;background:transparent;color:var(--text-1);width:100%;font-size:12px}.sv-layout{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:11px;min-height:570px}.sv-card{border:1px solid var(--border);border-radius:11px;background:var(--bg-card);overflow:hidden}.sv-card-head{display:flex;justify-content:space-between;align-items:center;padding:11px 13px;border-bottom:1px solid var(--border)}.sv-list{padding:5px;max-height:680px;overflow:auto}.sv-ticket{width:100%;display:block;text-align:left;border:1px solid transparent;background:transparent;border-radius:8px;padding:9px;cursor:pointer;color:inherit}.sv-ticket:hover{background:var(--surface-muted)}.sv-ticket.active{background:rgba(37,99,235,.07);border-color:rgba(37,99,235,.25)}.sv-ticket-top{display:flex;justify-content:space-between;gap:8px}.sv-ticket-title{font-size:12.5px;font-weight:750;color:var(--text-1)}.sv-ref{font-size:10px;color:var(--text-3);font-family:monospace;margin-top:2px}.sv-meta{font-size:10.5px;color:var(--text-3);margin-top:5px;display:flex;justify-content:space-between;gap:8px}.sv-detail{display:grid;grid-template-rows:auto auto minmax(300px,1fr) auto}.sv-title strong{font-size:14px}.sv-title span{display:block;font-size:10px;color:var(--text-3);font-family:monospace;margin-top:2px}.sv-ticket-meta{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;background:var(--surface-muted);padding:10px 13px;border-bottom:1px solid var(--border)}.sv-ticket-meta span{font-size:9px;text-transform:uppercase;color:var(--text-3);display:block}.sv-ticket-meta strong{font-size:11.5px;display:block;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sv-thread{background:var(--bg-app);padding:13px;overflow:auto;display:flex;flex-direction:column;gap:8px}.sv-msg{max-width:88%;padding:10px 11px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}.sv-msg.internal{background:#fff8e6;border-color:#f3d58b}.sv-msg-head{display:flex;justify-content:space-between;gap:10px;font-size:10px;color:var(--text-3)}.sv-msg-head strong{font-size:11.5px;color:var(--text-1)}.sv-msg p{font-size:12.5px;line-height:1.5;white-space:pre-wrap;margin:6px 0 0}.sv-actions{display:flex;justify-content:space-between;align-items:center;gap:9px;padding:10px 13px;border-top:1px solid var(--border)}.sv-contact{font-size:10.5px;color:var(--text-3)}.sv-buttons{display:flex;gap:7px}.sv-notice{padding:9px 11px;border-radius:8px;font-size:12px}.sv-notice.ok{background:#effaf3;color:#166534;border:1px solid #b7e4c7}.sv-notice.err{background:#fff1f2;color:#b91c1c;border:1px solid #fecaca}.sv-empty{padding:30px;text-align:center;color:var(--text-3);font-size:12px}.sv-form{display:grid;gap:11px}.sv-form label{display:grid;gap:5px;font-size:11.5px;font-weight:700}.sv-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}@media(max-width:1000px){.sv-summary{grid-template-columns:repeat(3,1fr)}.sv-layout{grid-template-columns:1fr}.sv-ticket-meta{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.sv-head{align-items:center}.sv-head p{display:none}.sv-summary{grid-template-columns:repeat(2,1fr)}.sv-toolbar{align-items:stretch;flex-direction:column}.sv-filters{flex-wrap:nowrap;overflow:auto}.sv-search{width:100%}.sv-ticket-meta,.sv-grid{grid-template-columns:1fr}.sv-actions{align-items:flex-start;flex-direction:column}.sv-buttons{width:100%}.sv-buttons .btn{flex:1}}
      `}</style>

      <header className="sv-head">
        <div>
          <h1>{feedbackOnly ? 'Customer Feedback' : isBusiness ? 'Support Tickets' : 'Support Floor'}</h1>
          <p>{isBusiness ? 'Report an issue, receive replies, and track its exact status.' : 'Assign real support staff, reply quickly, and control ticket workflow.'}</p>
        </div>
        {isBusiness && canWrite && !feedbackOnly && <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>+ New Ticket</button>}
      </header>

      {(notice || error) && <div className={`sv-notice ${error ? 'err' : 'ok'}`}>{error || notice}</div>}

      <div className="sv-summary">
        {[
          ['Total', summary?.totalTickets ?? 0], ['Open', summary?.open ?? 0], ['In Progress', summary?.inProgress ?? 0],
          ['Waiting', summary?.pendingCustomer ?? 0], ['Resolved', summary?.resolved ?? 0], ['Closed', summary?.closed ?? 0],
        ].map(([name, value]) => <div className="sv-stat" key={String(name)}><strong>{value}</strong><span>{name}</span></div>)}
      </div>

      <div className="sv-toolbar">
        <div className="sv-filters">{filters.map((item) => <button key={item} className={`sv-filter ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)} type="button">{item === 'ALL' ? 'All' : label(item)}</button>)}</div>
        <div className="sv-search"><Search size={14}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets, business or assignee" /></div>
      </div>

      <div className="sv-layout">
        <section className="sv-card">
          <div className="sv-card-head"><strong>Tickets</strong><span style={{fontSize:11,color:'var(--text-3)'}}>{visible.length}</span></div>
          <div className="sv-list">
            {loading && <div className="sv-empty">Loading tickets…</div>}
            {!loading && visible.length === 0 && <div className="sv-empty">No matching tickets.</div>}
            {visible.map((ticket) => <button type="button" key={ticket.id} onClick={() => setSelectedId(ticket.id)} className={`sv-ticket ${selected?.id === ticket.id ? 'active' : ''}`}>
              <div className="sv-ticket-top"><span className="sv-ticket-title">{ticket.subject}</span><span className={getStatusBadgeClass(ticket.status)}>{label(ticket.status)}</span></div>
              <div className="sv-ref">{ticket.reference}</div>
              {!isBusiness && <div className="sv-meta"><span>{ticket.tenant?.name ?? 'Business'}</span><span>{ticket.assignee?.displayName ?? 'Unassigned'}</span></div>}
              <div className="sv-meta"><span>{ticket.category} · {priorityLabel(ticket.priority)}</span><span>{formatDate(ticket.latestResponseAt ?? ticket.updatedAt)}</span></div>
            </button>)}
          </div>
        </section>

        {selected ? <section className="sv-card sv-detail">
          <div className="sv-card-head"><div className="sv-title"><strong>{selected.subject}</strong><span>{selected.reference}</span></div><span className={getStatusBadgeClass(selected.status)}>{label(selected.status)}</span></div>
          <div className="sv-ticket-meta">
            <div><span>Type</span><strong>{selected.category}</strong></div><div><span>Priority</span><strong>{priorityLabel(selected.priority)}</strong></div>
            <div><span>Opened</span><strong>{formatDate(selected.createdAt)}</strong></div><div><span>Assigned</span><strong>{selected.assignee?.displayName ?? 'Unassigned'}</strong></div>
            <div><span>Business</span><strong>{selected.tenant?.name ?? '—'}</strong></div>
          </div>
          <div className="sv-thread">
            {selected.messages.filter((message) => isBusiness ? !message.isInternal : true).map((message) => <article key={message.id} className={`sv-msg ${message.isInternal ? 'internal' : ''}`}>
              <div className="sv-msg-head"><strong>{message.authorName}</strong><span>{message.isInternal ? 'Internal note' : message.authorRole} · {formatDate(message.createdAt)}</span></div><p>{message.body}</p>
            </article>)}
          </div>
          <div className="sv-actions"><div className="sv-contact"><Mail size={12} style={{verticalAlign:'middle'}}/> {selected.email ?? 'No requester email'} </div><div className="sv-buttons">
            {!isBusiness && canWrite && <button className="btn btn-ghost" type="button" onClick={() => setUpdateOpen(true)}><UserRound size={14}/> Assign / Status</button>}
            {canWrite && <button className="btn btn-primary" type="button" onClick={() => setReplyOpen(true)}><MessageSquare size={14}/> Reply</button>}
          </div></div>
        </section> : <section className="sv-card sv-empty">Select a ticket.</section>}
      </div>

      <Modal open={createOpen} onClose={() => !submitting && setCreateOpen(false)} closeDisabled={submitting} kicker="AROFi Support" title="New support ticket">
        <form className="sv-form" onSubmit={createTicket}><label>Issue title<input className="form-input" name="subject" required maxLength={180}/></label><div className="sv-grid"><label>Category<select className="form-input" name="category">{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Urgency<select className="form-input" name="priority" defaultValue="NORMAL"><option value="NORMAL">Normal</option><option value="HIGH">Urgent</option></select></label></div><label>Details<textarea className="form-input" name="body" rows={6} required maxLength={4000}/></label><div className="sv-grid"><label>Contact phone<PhoneNumberField name="phoneNumber" /></label><label>Contact email<input className="form-input" name="email" type="email" defaultValue={session?.user.email ?? ''}/></label></div><div className="sv-buttons" style={{justifyContent:'flex-end'}}><button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button><button disabled={submitting} className="btn btn-primary" type="submit">{submitting ? 'Submitting…' : 'Submit Ticket'}</button></div></form>
      </Modal>

      {selected && <Modal open={replyOpen} onClose={() => !submitting && setReplyOpen(false)} closeDisabled={submitting} kicker={selected.reference} title={isBusiness ? 'Reply to AROFi Support' : 'Reply to customer'}>
        <form className="sv-form" onSubmit={sendReply}><label>Message<textarea className="form-input" name="body" rows={6} required maxLength={4000} autoFocus/></label>{!isBusiness && <><label style={{display:'flex',gridTemplateColumns:'auto 1fr',alignItems:'center'}}><input name="isInternal" type="checkbox"/> Internal note — customer will not receive this</label><label>Status after this reply<select className="form-input" name="statusAfterReply" defaultValue=""><option value="">Keep {label(selected.status)}</option>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label></>}<div className="sv-buttons" style={{justifyContent:'flex-end'}}><button className="btn btn-ghost" type="button" onClick={() => setReplyOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? 'Sending…' : 'Send Reply'}</button></div></form>
      </Modal>}

      {selected && isPlatformSupport && canWrite && <Modal open={updateOpen} onClose={() => !submitting && setUpdateOpen(false)} closeDisabled={submitting} kicker={selected.reference} title="Assign & update workflow">
        <form className="sv-form" onSubmit={updateTicket}><label>Assigned support officer<select className="form-input" name="assigneeUserId" defaultValue={selected.assignee?.id ?? ''}><option value="">Unassigned</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.displayName} — {label(person.role)}</option>)}</select></label><div className="sv-grid"><label>Status<select className="form-input" name="status" defaultValue={selected.status}>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label><label>Priority<select className="form-input" name="priority" defaultValue={selected.priority}>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}</select></label></div><div style={{padding:10,border:'1px solid var(--border)',borderRadius:8,fontSize:11.5,color:'var(--text-3)'}}><Clock3 size={13} style={{verticalAlign:'middle'}}/> Status changes only when you choose them. Replies no longer force tickets into In Progress. <CheckCircle2 size={13} style={{verticalAlign:'middle'}}/></div><div className="sv-buttons" style={{justifyContent:'flex-end'}}><button className="btn btn-ghost" type="button" onClick={() => setUpdateOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? 'Saving…' : 'Save Changes'}</button></div></form>
      </Modal>}
    </div>
  )
}
