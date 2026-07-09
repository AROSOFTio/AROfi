'use client'

import { useState, type FormEvent } from 'react'
import { clientPostApi } from '@/lib/client-api'

// Support email/phone double as the business's verified identity details
// captured during onboarding, so — like the sign-in email — a vendor can't
// silently change them. This files a Support Hub ticket instead; a reviewer
// applies the change after confirming it's really the business asking.
export default function SupportContactChangePanel({ currentEmail, currentPhone }: { currentEmail: string; currentPhone: string }) {
  const [type, setType] = useState<'EMAIL' | 'PHONE'>('EMAIL')
  const [newValue, setNewValue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const fieldLabel = type === 'EMAIL' ? 'support email' : 'support phone number'
      const currentValue = (type === 'EMAIL' ? currentEmail : currentPhone) || 'not set'
      const ticket = await clientPostApi<{ id: string; reference: string }>('/system/support-tickets', {
        subject: `Request: change ${fieldLabel}`,
        category: 'Contact Info Change',
        phoneNumber: type === 'PHONE' ? currentPhone || undefined : undefined,
        email: type === 'EMAIL' ? currentEmail || undefined : undefined,
      })
      await clientPostApi(`/system/support-tickets/${ticket.id}/messages`, {
        authorName: 'Business owner',
        authorRole: 'Vendor',
        body: `Requesting to change ${fieldLabel} from "${currentValue}" to "${newValue}".\n\nReason: ${reason}`,
      })
      setMessage(`Request submitted (ticket ${ticket.reference}). Our team will apply the change after review.`)
      setNewValue('')
      setReason('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit the request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 14 }}>
      <div className="card-header">
        <span className="card-title">Change Support Contact</span>
        <span className="badge badge-warning">Requires approval</span>
      </div>
      <div className="form-grid" style={{ padding: 16 }}>
        <label className="form-group">
          <span className="form-label">What do you want to change?</span>
          <select className="form-input" value={type} onChange={(event) => setType(event.target.value as 'EMAIL' | 'PHONE')} disabled={busy}>
            <option value="EMAIL">Support email</option>
            <option value="PHONE">Support phone number</option>
          </select>
        </label>
        <label className="form-group">
          <span className="form-label">New {type === 'EMAIL' ? 'email' : 'phone number'}</span>
          <input
            className="form-input"
            required
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            disabled={busy}
            type={type === 'EMAIL' ? 'email' : 'tel'}
            placeholder={type === 'EMAIL' ? 'new@company.com' : '07XXXXXXXX'}
          />
        </label>
        <label className="form-group form-span-2">
          <span className="form-label">Reason for the change</span>
          <textarea
            className="form-input"
            required
            minLength={10}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            placeholder="e.g. Old number is no longer reachable"
          />
        </label>
        {message && <p className="form-span-2" style={{ margin: 0, fontSize: 13, color: 'var(--success-fg)' }}>{message}</p>}
        {error && <p className="form-span-2" style={{ margin: 0, fontSize: 13, color: 'var(--danger-fg)' }}>{error}</p>}
        <div className="form-span-2">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting...' : 'Submit for Approval'}</button>
        </div>
      </div>
    </form>
  )
}
