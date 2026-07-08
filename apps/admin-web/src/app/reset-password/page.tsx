'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${apiBaseUrl}/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const message = data?.message
        setError(Array.isArray(message) ? message.join(', ') : message || 'This reset link is invalid or has expired.')
        return
      }
      setDone(true)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-card">
      <div className="login-brand">
        <img src="/logo.png" alt="AROFi Logo" style={{ width: 72, height: 'auto', margin: '0 auto 10px', display: 'block' }} />
        <h1>Choose a new password</h1>
        <p>At least 8 characters. You&apos;ll sign in again everywhere afterwards.</p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 18 }}>
          {error}
        </div>
      )}

      {done ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#60a5fa', marginBottom: 18 }}>
            Password updated successfully.
          </div>
          <Link href="/login" className="btn btn-primary btn-block">Sign In</Link>
        </div>
      ) : !token ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            This page needs a reset link from your email. Request a new one below.
          </p>
          <Link href="/forgot-password" className="btn btn-primary btn-block">Request Reset Link</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              className="form-input"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input
              className="form-input"
              type="password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      )}

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
        <Link href="/login" style={{ color: 'var(--green)', fontWeight: 700 }}>Back to sign in</Link>
      </p>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="login-page">
      <div className="login-shell" style={{ gridTemplateColumns: '1fr', width: '100%', maxWidth: 440 }}>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
