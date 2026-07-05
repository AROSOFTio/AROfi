'use client'

import { useState, type FormEvent } from 'react'
import { getAppDashboardUrl } from '@/lib/admin-session'

async function readErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  const message = body?.message
  if (Array.isArray(message)) return message.join(', ')
  return typeof message === 'string' && message ? message : fallback
}

export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api'

  if (!open) return null

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${apiBaseUrl}/auth/login/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        setError(await readErrorMessage(response, 'Invalid email or password.'))
        return
      }

      setStep('otp')
      setOtp('')
      setInfo(`We emailed a 6-digit code to ${email}.`)
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${apiBaseUrl}/auth/login/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otp.trim() }),
      })

      if (!response.ok) {
        setError(await readErrorMessage(response, 'Incorrect or expired verification code.'))
        return
      }

      // Session cookies (HttpOnly) are set by the API on this response.
      window.location.href = getAppDashboardUrl()
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card compact">
        <button type="button" className="modal-close" onClick={onClose}>Close</button>
        <div className="modal-kicker">Welcome Back</div>
        <h2 className="modal-title">Sign in to AROFi</h2>
        {step === 'credentials' ? (
          <form onSubmit={handleCredentialsSubmit} style={{ marginTop: 20 }}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Checking...' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} style={{ marginTop: 20 }}>
            {info && <p style={{ fontSize: 13, marginBottom: 12 }}>{info}</p>}
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                autoComplete="one-time-code"
                style={{ letterSpacing: 6, textAlign: 'center' }}
              />
            </div>
            {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={loading || otp.length !== 6}>
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials')
                setOtp('')
                setError('')
                setInfo('')
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 10, fontSize: 12 }}
            >
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
