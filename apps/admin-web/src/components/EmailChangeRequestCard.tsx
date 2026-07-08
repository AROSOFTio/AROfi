'use client'

import { useState, type FormEvent } from 'react'
import { clientPostApi } from '@/lib/client-api'

// Sign-in email changes are sensitive (the email is the login identifier),
// so they go through a platform-admin approval queue instead of applying
// immediately — this card just files the request.
export default function EmailChangeRequestCard() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await clientPostApi<{ message?: string }>('/auth/email-change-requests', {
        newEmail: form.get('newEmail'),
        reason: form.get('reason'),
        currentPassword: form.get('currentPassword'),
      })
      setMessage(result?.message ?? 'Email change request submitted for review.')
      event.currentTarget.reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit the request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-header">
        <span className="card-title">Change Sign-in Email</span>
        <span className="badge badge-warning">Requires approval</span>
      </div>
      <div className="form-grid" style={{ padding: 16 }}>
        <label className="form-group">
          <span className="form-label">New email address</span>
          <input name="newEmail" type="email" required placeholder="new@company.com" className="form-input" disabled={busy} />
        </label>
        <label className="form-group">
          <span className="form-label">Current password</span>
          <input name="currentPassword" type="password" required placeholder="Confirm it's you" className="form-input" disabled={busy} autoComplete="current-password" />
        </label>
        <label className="form-group form-span-2">
          <span className="form-label">Reason for the change</span>
          <textarea name="reason" required minLength={10} rows={3} placeholder="e.g. Moving off a shared company inbox" className="form-input" disabled={busy} />
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
