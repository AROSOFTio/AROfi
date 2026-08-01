'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Lightbulb, MessageSquareText, Sparkles, Star } from 'lucide-react'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientPostApi } from '@/lib/client-api'
import type { SupportTicketResponse } from '@/lib/admin-types'

type Ticket = SupportTicketResponse['items'][number]

const feedbackTypes = [
  { value: 'Feature suggestion', label: 'Feature', icon: Lightbulb, hint: 'Request a new dashboard, portal, router, or sales workflow.' },
  { value: 'Improvement recommendation', label: 'Improve', icon: Sparkles, hint: 'Tell us what should be simpler, faster, or clearer.' },
  { value: 'Product review', label: 'Review', icon: Star, hint: 'Share how AROFi feels in daily use.' },
  { value: 'Something is confusing', label: 'Confusing', icon: MessageSquareText, hint: 'Point out unclear screens, wording, or steps.' },
]

export default function FeedbackPage() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  const [type, setType] = useState(feedbackTypes[0].value)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    const title = String(form.get('title')).trim()
    const details = String(form.get('details')).trim()
    const rating = String(form.get('rating') || 'Not provided')
    setBusy(true)
    setError('')
    setReference('')
    setStatus('Saving feedback for the product team.')
    try {
      const ticket = await clientPostApi<Ticket>('/system/feedback', {
        type,
        title,
        details,
        rating: rating === 'Not provided' ? undefined : Number(rating),
      })
      localStorage.setItem('arofi-feedback-last-prompted-at', String(Date.now()))
      setReference(ticket.reference)
      element.reset()
      setType(feedbackTypes[0].value)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit feedback right now.')
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const active = feedbackTypes.find((item) => item.value === type) ?? feedbackTypes[0]

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Feedback</h1>
          <p className="page-subtitle">Send product ideas, reviews, and confusing screens to the AROFi team.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/support" className="btn btn-ghost">Support Tickets</Link>
          <Link href="/support?view=documentation" className="btn btn-ghost">Documentation</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 760px)', gap: 18, alignItems: 'start' }}>
        <aside className="card" style={{ padding: 10 }}>
          {feedbackTypes.map((item) => {
            const Icon = item.icon
            const selected = item.value === type
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setType(item.value)}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr',
                  gap: 10,
                  textAlign: 'left',
                  border: selected ? '1px solid var(--primary)' : '1px solid transparent',
                  background: selected ? 'var(--blue-light)' : 'transparent',
                  borderRadius: 8,
                  padding: 12,
                  cursor: 'pointer',
                }}
              >
                <Icon size={18} style={{ color: selected ? 'var(--primary)' : 'var(--text-secondary)' }} />
                <span style={{ display: 'grid', gap: 3 }}>
                  <strong style={{ fontSize: 13 }}>{item.label}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.35 }}>{item.hint}</span>
                </span>
              </button>
            )
          })}
        </aside>

        <section className="card" style={{ padding: 0 }}>
          <div className="card-header">
            <span className="card-title">{active.label} Feedback</span>
            <span className="badge badge-info">Product team</span>
          </div>
          <form onSubmit={submit} style={{ padding: 22, display: 'grid', gap: 16 }}>
            {reference && (
              <div className="badge badge-success" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> Submitted as {reference}
              </div>
            )}
            <label className="form-group" style={{ marginBottom: 0 }}>
              <span className="form-label">Short title</span>
              <input name="title" className="form-input" required maxLength={160} placeholder="Example: Make router script steps clearer" />
            </label>
            <label className="form-group" style={{ marginBottom: 0 }}>
              <span className="form-label">Details</span>
              <textarea name="details" className="form-input" rows={8} required maxLength={3500} placeholder="Describe what happened, what you expected, and where you saw it." />
            </label>
            <label className="form-group" style={{ marginBottom: 0, maxWidth: 260 }}>
              <span className="form-label">Rating</span>
              <select name="rating" className="form-input" defaultValue="">
                <option value="">No rating</option>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Good</option>
                <option value="3">3 - Fair</option>
                <option value="2">2 - Needs improvement</option>
                <option value="1">1 - Poor</option>
              </select>
            </label>
            <FormProcessStatus busy={busy} error={error || null} text={status || 'Feedback becomes a support item you can follow up from Support.'} />
            <button className="btn btn-primary" disabled={busy} style={{ justifySelf: 'start' }}>
              {busy ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </section>
      </div>
    </>
  )
}
