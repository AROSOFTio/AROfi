'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotEmailPage() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    setMaskedEmail(null)
    try {
      const res = await fetch(`${apiBaseUrl}/auth/forgot-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const failure = data?.message
        setError(Array.isArray(failure) ? failure.join(', ') : failure || 'Could not look up that phone number. Try again shortly.')
        return
      }
      setMaskedEmail(data?.maskedEmail ?? null)
      setMessage(data?.message ?? '')
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell" style={{ gridTemplateColumns: '1fr', width: '100%', maxWidth: 440 }}>
        <div className="login-card">
          <div className="login-brand">
            <img src="/logo.png" alt="AROFi Logo" style={{ width: 72, height: 'auto', margin: '0 auto 10px', display: 'block' }} />
            <h1>Forgot your email?</h1>
            <p>Enter the phone number you registered with and we&apos;ll show you which email is on the account.</p>
          </div>

          {maskedEmail && (
            <div style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8, padding: '12px 14px', fontSize: 14, color: '#60a5fa', marginBottom: 18, textAlign: 'center', fontWeight: 700 }}>
              {maskedEmail}
            </div>
          )}
          {message && !maskedEmail && (
            <div style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#60a5fa', marginBottom: 18 }}>
              {message}
            </div>
          )}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 18 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Registered Phone Number</label>
              <input
                className="form-input"
                type="tel"
                placeholder="0787726388"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                autoComplete="tel"
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={loading}>
              {loading ? 'Looking up...' : 'Reveal My Email'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
            <Link href="/login" style={{ color: 'var(--green)', fontWeight: 700 }}>Back to sign in</Link>
            {' · '}
            <Link href="/forgot-password" style={{ color: 'var(--green)', fontWeight: 700 }}>Forgot password?</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
