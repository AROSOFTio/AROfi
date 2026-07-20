'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientPostApi } from '@/lib/client-api'
import type { SupportTicketResponse } from '@/lib/admin-types'

type Ticket = SupportTicketResponse['items'][number]
const types = ['Feature suggestion', 'Improvement recommendation', 'Product review', 'Something is confusing', 'Other feedback']

export default function FeedbackPage() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    const type = String(form.get('type'))
    const title = String(form.get('title')).trim()
    const details = String(form.get('details')).trim()
    const rating = String(form.get('rating') || 'Not provided')
    setBusy(true); setError(''); setReference(''); setStatus('Saving your feedback for the product team.')
    try {
      const ticket = await clientPostApi<Ticket>('/system/feedback', {
        type,
        title,
        details,
        rating: rating === 'Not provided' ? undefined : Number(rating),
      })
      localStorage.setItem('arofi-feedback-last-prompted-at', String(Date.now()))
      setReference(ticket.reference); element.reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit feedback right now.')
    } finally { setBusy(false); setStatus('') }
  }

  return <FeedbackForm submit={submit} busy={busy} status={status} error={error} reference={reference} />
}

function FeedbackForm(props: { submit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; status: string; error: string; reference: string }) {
  return <>
    <div className='page-header'><div><h1 className='page-title'>Feedback and Reviews</h1><p className='page-subtitle'>Suggest a feature, recommend an improvement, or review AROFi.</p></div><Link href='/support' className='btn btn-ghost'>Get Technical Support</Link></div>
    <div className='card' style={{ maxWidth: 820, margin: 0 }}>
      <div className='card-header'><span className='card-title'>Share your idea or experience</span></div>
      <form onSubmit={props.submit} style={{ padding: 22, display: 'grid', gap: 16 }}>
        {props.reference && <div style={{ color: 'var(--success-fg)' }}>Thank you. Submitted as {props.reference}; replies will appear in the Support Hub.</div>}
        <Field label='What would you like to share?'>
          <select name='type' className='form-input' required>{types.map((type) => <option key={type}>{type}</option>)}</select>
        </Field>
        <Field label='Short title'>
          <input name='title' className='form-input' required maxLength={160} placeholder='For example: Add weekly sales summaries' />
        </Field>
        <Field label='Your suggestion or review'>
          <textarea name='details' className='form-input' rows={7} required maxLength={3500} placeholder='Describe what you would like added, changed, or improved, and why it matters.' />
        </Field>
        <Field label='How would you rate AROFi today? (optional)'>
          <select name='rating' className='form-input' defaultValue=''>
            <option value=''>No rating</option><option value='5'>5 - Excellent</option><option value='4'>4 - Good</option>
            <option value='3'>3 - Fair</option><option value='2'>2 - Needs improvement</option><option value='1'>1 - Poor</option>
          </select>
        </Field>
        <FormProcessStatus busy={props.busy} error={props.error || null} text={props.status || 'Your submission goes to the AROFi product team.'} />
        <button className='btn btn-primary' disabled={props.busy} style={{ justifySelf: 'start' }}>{props.busy ? 'Submitting...' : 'Submit Feedback'}</button>
      </form>
    </div>
  </>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className='form-group' style={{ marginBottom: 0 }}><span className='form-label'>{label}</span>{children}</label>
}
