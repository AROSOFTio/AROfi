'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Clock, Loader2, MessageCircle, Search, Send, Ticket } from 'lucide-react'
import type { PortalContextResponse } from '../../lib/portal-types'

type SupportTicket = {
  id: string
  reference: string
  subject: string
  category: string
  priority: string
  status: string
  phoneNumber?: string | null
  createdAt: string
  updatedAt: string
  latestResponseAt?: string | null
  resolvedAt?: string | null
  messages: Array<{
    id: string
    authorName: string
    authorRole: string
    body: string
    createdAt: string
  }>
}

type View = 'home' | 'submit' | 'lookup' | 'ticket'

const categories = [
  'Router setup',
  'Payment issue',
  'Customer connection',
  'Voucher issue',
  'Wallet withdrawal',
  'Billing question',
  'Other',
]

const ticketStatuses = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function statusIndex(status: string) {
  const i = ticketStatuses.indexOf(status)
  return i === -1 ? 0 : i
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-UG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function SupportPage() {
  const [context, setContext] = useState<PortalContextResponse | null>(null)
  const [view, setView] = useState<View>('home')
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [lookupRef, setLookupRef] = useState('')
  const [newTicketRef, setNewTicketRef] = useState('')

  useEffect(() => {
    void loadContext()
  }, [])

  async function loadContext() {
    try {
      const res = await fetch('/api/portal/context', { cache: 'no-store' })
      if (res.ok) setContext(await res.json() as PortalContextResponse)
    } catch {
      // non-critical — page still works without it
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!context?.tenant.id) {
      setError('Portal context not loaded. Please refresh and try again.')
      return
    }
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const res = await fetch('/api/portal/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: context.tenant.id,
          subject: form.get('subject'),
          category: form.get('category'),
          phoneNumber: form.get('phoneNumber') || undefined,
          body: form.get('body') || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message ?? 'Unable to submit ticket')
      }
      const created = await res.json() as SupportTicket
      setTicket(created)
      setNewTicketRef(created.reference)
      setView('ticket')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLookup(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const ref = lookupRef.trim().toUpperCase()
    if (!ref) {
      setError('Enter a ticket reference number.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ ...(context?.tenant.id ? { tenantId: context.tenant.id } : {}) })
      const res = await fetch(`/api/portal/support-tickets/by-reference/${encodeURIComponent(ref)}?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message ?? 'Ticket not found')
      }
      setTicket(await res.json() as SupportTicket)
      setView('ticket')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ticket not found')
    } finally {
      setLoading(false)
    }
  }

  const tenantName = context?.tenant.name ?? 'AROFi Portal'
  const supportPhone = context?.tenant.supportPhone ?? context?.tenant.supportEmail

  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-slate-950">Support</h1>
          <p className="text-xs text-slate-500">{tenantName}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {/* Ticket View */}
      {view === 'ticket' && ticket && (
        <TicketView
          ticket={ticket}
          isNew={ticket.reference === newTicketRef}
          onBack={() => { setView('home'); setTicket(null); setNewTicketRef('') }}
          onRefresh={async () => {
            setLoading(true)
            try {
              const params = new URLSearchParams({ ...(context?.tenant.id ? { tenantId: context.tenant.id } : {}) })
              const res = await fetch(`/api/portal/support-tickets/by-reference/${encodeURIComponent(ticket.reference)}?${params}`, { cache: 'no-store' })
              if (res.ok) setTicket(await res.json() as SupportTicket)
            } finally {
              setLoading(false)
            }
          }}
          loading={loading}
        />
      )}

      {/* Submit Form */}
      {view === 'submit' && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Submit a Ticket</h2>
              <p className="text-xs text-slate-500">We'll get back to you as soon as possible</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">Phone Number <span className="font-normal text-slate-400">(optional)</span></label>
              <input name="phoneNumber" type="tel" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-500" placeholder="07XX XXX XXX" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Category</label>
              <select name="category" required className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-500">
                {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Subject</label>
              <input name="subject" required maxLength={180} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-500" placeholder="Brief summary of the issue" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">What happened?</label>
              <textarea name="body" rows={4} maxLength={2000} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-500" placeholder="Describe the issue in detail..." />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
              <button type="button" onClick={() => { setView('home'); setError('') }} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lookup Form */}
      {view === 'lookup' && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Track Your Ticket</h2>
              <p className="text-xs text-slate-500">Enter the reference number you received</p>
            </div>
          </div>
          <form onSubmit={handleLookup} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">Ticket Reference</label>
              <input
                value={lookupRef}
                onChange={(e) => setLookupRef(e.target.value)}
                placeholder="e.g. PRT-ABC123-XYZ"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-mono uppercase tracking-widest text-slate-950 outline-none focus:border-sky-500"
                required
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? 'Looking up...' : 'Find Ticket'}
              </button>
              <button type="button" onClick={() => { setView('home'); setError('') }} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                Back
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Home */}
      {view === 'home' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setView('submit'); setError('') }}
              className="flex items-start gap-4 rounded-[24px] border border-emerald-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-400 hover:shadow-md"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Send className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold text-slate-950">Submit a Ticket</div>
                <div className="mt-1 text-sm text-slate-500">Report an issue with your internet, payment, or voucher</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => { setView('lookup'); setError('') }}
              className="flex items-start gap-4 rounded-[24px] border border-sky-200 bg-white p-5 text-left shadow-sm transition hover:border-sky-400 hover:shadow-md"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                <Search className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold text-slate-950">Track Your Ticket</div>
                <div className="mt-1 text-sm text-slate-500">Check the status and replies on an existing ticket</div>
              </div>
            </button>
          </div>

          {supportPhone && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-sm text-slate-600">For urgent help, contact support directly:</p>
              <p className="mt-1 font-bold text-emerald-700">{supportPhone}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TicketView({
  ticket,
  isNew,
  onBack,
  onRefresh,
  loading,
}: {
  ticket: SupportTicket
  isNew: boolean
  onBack: () => void
  onRefresh: () => Promise<void>
  loading: boolean
}) {
  const statusIdx = statusIndex(ticket.status)
  const isResolved = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'

  return (
    <div className="space-y-4">
      {isNew && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-600" />
            <div>
              <div className="font-bold text-emerald-800">Ticket submitted successfully!</div>
              <div className="mt-0.5 text-sm text-emerald-700">
                Your reference: <span className="font-mono font-bold">{ticket.reference}</span>
              </div>
              <div className="mt-0.5 text-xs text-emerald-600">Save this number to track your ticket later.</div>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Card */}
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <Ticket className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <div className="font-mono text-xs font-bold tracking-widest text-slate-500">{ticket.reference}</div>
              <div className="mt-0.5 text-base font-bold text-slate-950">{ticket.subject}</div>
            </div>
          </div>
          <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
            isResolved
              ? 'bg-emerald-50 text-emerald-700'
              : ticket.status === 'IN_PROGRESS'
              ? 'bg-sky-50 text-sky-700'
              : ticket.status === 'PENDING_CUSTOMER'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-slate-100 text-slate-600'
          }`}>
            {statusLabel(ticket.status)}
          </span>
        </div>

        <div className="mt-1 text-xs text-slate-500">{ticket.category} · Opened {formatDate(ticket.createdAt)}</div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Submitted</span>
            <span>In Progress</span>
            <span>Resolved</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-700 ${isResolved ? 'bg-emerald-500' : 'bg-sky-500'}`}
              style={{ width: `${Math.min(100, (statusIdx / (ticketStatuses.length - 1)) * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between">
            {ticketStatuses.map((s, i) => (
              <div
                key={s}
                className={`h-2.5 w-2.5 rounded-full border-2 ${i <= statusIdx ? (isResolved ? 'border-emerald-500 bg-emerald-500' : 'border-sky-500 bg-sky-500') : 'border-slate-300 bg-white'}`}
              />
            ))}
          </div>
          <div className="mt-2 text-center text-xs text-slate-500">{statusLabel(ticket.status)}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Updates &amp; Replies</span>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
            Refresh
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {ticket.messages.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center text-sm text-slate-400">
              No replies yet. Our support team will respond shortly.
            </div>
          ) : (
            ticket.messages.map((msg) => (
              <div key={msg.id} className={`rounded-2xl p-4 ${msg.authorRole === 'Customer' ? 'border border-slate-200 bg-slate-50' : 'border border-sky-100 bg-sky-50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-xs font-bold ${msg.authorRole === 'Customer' ? 'text-slate-600' : 'text-sky-700'}`}>
                    {msg.authorRole === 'Customer' ? 'You' : 'Support Team'}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatDate(msg.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{msg.body}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <button type="button" onClick={onBack} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
        Back to Support
      </button>
    </div>
  )
}
