'use client'
import { useEffect, useState } from 'react'

function resolveNextPath() {
  if (typeof window === 'undefined') {
    return '/dashboard'
  }

  const requestedPath = new URLSearchParams(window.location.search).get('next')

  if (!requestedPath || !requestedPath.startsWith('/')) {
    return '/dashboard'
  }

  return requestedPath
}

async function readErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  const message = body?.message
  const error = body?.error
  if (Array.isArray(message)) return message.join(', ')
  if (message === 'ThrottlerException' || error === 'Too Many Requests' || response.status === 429) {
    return 'Please wait a moment, then try again.'
  }
  return typeof message === 'string' && message ? message : fallback
}

export default function LoginPage() {
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [rememberDevice, setRememberDevice] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [fallbackOtp, setFallbackOtp] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null)
  const [resendCountdown, setResendCountdown] = useState(0)
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api'
  const nextPath = resolveNextPath()
  const shouldAutoRedirectExistingSession = false

  useEffect(() => {
    let isMounted = true

    async function validateExistingSession() {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/me`, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (shouldAutoRedirectExistingSession && isMounted && response.ok) {
          window.location.href = nextPath
        }
      } catch {
        // Not signed in — stay on the login form.
      }
    }

    void validateExistingSession()

    return () => {
      isMounted = false
    }
  }, [apiBaseUrl, nextPath, shouldAutoRedirectExistingSession])

  useEffect(() => {
    if (!resendAvailableAt) {
      return
    }
    const tick = () => {
      setResendCountdown(Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [resendAvailableAt])

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    try {
      const res = await fetch(`${apiBaseUrl}/auth/login/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        setError(await readErrorMessage(res, 'Invalid email or password. Please try again.'))
        return
      }

      const data = await res.json()
      if (data?.otpRequired === false) {
        window.location.href = nextPath
        return
      }
      setStep('otp')
      setOtp('')
      setFallbackOtp(typeof data?.otpFallback === 'string' ? data.otpFallback : '')
      setInfo(
        data?.otpFallback
          ? 'Email delivery failed, so a fallback code is shown below to keep sign-in working.'
          : `We emailed a 6-digit verification code to ${email}. It expires in a few minutes.`,
      )
      if (typeof data?.resendAvailableAt === 'string') {
        setResendAvailableAt(new Date(data.resendAvailableAt).getTime())
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(code: string) {
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${apiBaseUrl}/auth/login/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code, rememberDevice }),
      })

      if (!res.ok) {
        setError(await readErrorMessage(res, 'Incorrect or expired verification code.'))
        return
      }

      window.location.href = nextPath
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault()
    void verifyOtp(otp.trim())
  }

  useEffect(() => {
    if (step === 'otp' && otp.length === 6 && !loading && !error) {
      void verifyOtp(otp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step])

  async function handleResend() {
    if (resendCountdown > 0 || loading) {
      return
    }
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${apiBaseUrl}/auth/login/resend`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        setError(await readErrorMessage(res, 'Could not resend the code. Sign in again.'))
        return
      }
      setFallbackOtp('')
      setInfo(`A new verification code was sent to ${email}.`)
      setResendAvailableAt(Date.now() + 60_000)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <img
              src="/brand/arofi-logo-blue.svg"
              alt="AROFi"
              className="brand-logo login-logo"
            />
            <h1>Sign in to AROFi</h1>
            <p>Manage your WiFi business.</p>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                color: '#f87171',
                marginBottom: 18,
              }}
            >
              {error}
            </div>
          )}

          {info && !error && (
            <div className="login-notice">
              {info}
            </div>
          )}

          {fallbackOtp && !error && (
            <div className="login-notice" style={{ marginTop: 12, fontFamily: 'monospace', letterSpacing: '0.2em', fontSize: 18, fontWeight: 700 }}>
              {fallbackOtp}
            </div>
          )}

          {step === 'credentials' ? (
            <form onSubmit={handleCredentialsSubmit}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="**********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 9,
                  margin: '2px 0 14px',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  lineHeight: 1.45,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(event) => setRememberDevice(event.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>Remember this device for 30 days</strong>
                  <small className="login-remember-note">Skip email verification on this private device.</small>
                </span>
              </label>
              <button
                type="submit"
                className="btn btn-primary btn-block"
                style={{ marginTop: 8 }}
                disabled={loading}
              >
                {loading ? 'Checking...' : 'Continue'}
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 12 }}>
                <a href="/forgot-password" style={{ color: 'var(--green)', fontWeight: 700, textDecoration: 'none' }}>Forgot password?</a>
                <a href="/forgot-email" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Forgot email?</a>
              </div>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit}>
              <div className="form-group">
                <label className="form-label">Verification code</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, ''))
                    setError('')
                  }}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  style={{ letterSpacing: 8, textAlign: 'center', fontSize: 20 }}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-block"
                style={{ marginTop: 8 }}
                disabled={loading || otp.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify and sign in'}
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setStep('credentials')
                    setOtp('')
                    setError('')
                    setInfo('')
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCountdown > 0 || loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: resendCountdown > 0 ? 'var(--text-muted)' : 'var(--green)',
                    cursor: resendCountdown > 0 ? 'default' : 'pointer',
                    padding: 0,
                    fontWeight: 700,
                  }}
                >
                  {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          <p className="login-signup">
            New to AROFi? <a href="/?register=1">Create a business account</a>
          </p>

          <p className="login-footer">
            &copy; 2026 AROSOFT Innovations Ltd
          </p>
        </div>
      </div>
    </div>
  )
}
