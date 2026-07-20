'use client'

import { FormEvent, useState } from 'react'
import { clientPostApi } from '@/lib/client-api'
import FormProcessStatus from './FormProcessStatus'

export default function PasswordChangeCard() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const newPassword = String(form.get('newPassword') ?? '')
    if (newPassword !== String(form.get('confirmPassword') ?? '')) {
      setError('New passwords do not match.')
      return
    }
    setBusy(true); setMessage(''); setError('')
    try {
      const result = await clientPostApi<{ message: string }>('/auth/password/change', {
        currentPassword: form.get('currentPassword'),
        newPassword,
      })
      setMessage(result.message)
      formElement.reset()
      window.setTimeout(async () => {
        try { await clientPostApi('/auth/logout', {}) } finally { window.location.href = '/login' }
      }, 1200)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change your password.')
    } finally { setBusy(false) }
  }

  return <form className='card' onSubmit={submit} style={{ maxWidth: 760 }}>
    <div className='card-header'><span className='card-title'>Change Password</span><span className='badge badge-info'>Account</span></div>
    <div className='form-grid' style={{ padding: 18 }}>
      <Field name='currentPassword' label='Current password' autoComplete='current-password' busy={busy} />
      <Field name='newPassword' label='New password' autoComplete='new-password' busy={busy} minLength={8} />
      <Field name='confirmPassword' label='Confirm new password' autoComplete='new-password' busy={busy} minLength={8} />
      <div className='form-span-2'><FormProcessStatus busy={busy} error={error || null} text={message || 'Use at least 8 characters. Changing it signs out your other sessions and remembered devices.'} /></div>
      <div className='form-span-2'><button className='btn btn-primary' disabled={busy}>{busy ? 'Changing...' : 'Change Password'}</button></div>
    </div>
  </form>
}

function Field({ name, label, autoComplete, busy, minLength }: { name: string; label: string; autoComplete: string; busy: boolean; minLength?: number }) {
  return <label className='form-group'><span className='form-label'>{label}</span><input name={name} type='password' className='form-input' required minLength={minLength} autoComplete={autoComplete} disabled={busy} /></label>
}
