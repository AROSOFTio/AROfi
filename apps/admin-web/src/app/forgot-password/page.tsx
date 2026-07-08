'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`${apiBaseUrl}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof data?.message === 'string' ? data.message : 'Could not send the reset link. Try again shortly.')
        return
      }
      setMessage(data?.message ?? 'If an account with that email exists, a password reset link has been sent.')
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
            <h1>Reset your password</h1>
            <p>Enter your account email and we&apos;ll send you a reset link.</p>
          </div>

          {message && (
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
              <label className="form-label">Email Address</label>
              <input
                className="form-input"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
            Remembered it? <Link href="/login" style={{ color: 'var(--green)', fontWeight: 700 }}>Back to sign in</Link>
            {' · '}
            <Link href="/forgot-email" style={{ color: 'var(--green)', fontWeight: 700 }}>Forgot email?</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
