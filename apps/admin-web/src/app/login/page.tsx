'use client'
import { useEffect, useState } from 'react'
import {
  adminAuthCookieName,
  clearBrowserAdminSession,
  getBrowserAdminToken,
} from '@/lib/admin-session'

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

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api'
  const nextPath = resolveNextPath()

  useEffect(() => {
    let isMounted = true

    async function validateExistingSession() {
      const token = getBrowserAdminToken()
      if (!token) {
        return
      }

      try {
        const response = await fetch(`${apiBaseUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        })

        if (!isMounted) {
          return
        }

        if (response.ok) {
          window.location.href = nextPath
          return
        }

        clearBrowserAdminSession()
      } catch {
        if (isMounted) {
          clearBrowserAdminSession()
        }
      }
    }

    void validateExistingSession()

    return () => {
      isMounted = false
    }
  }, [apiBaseUrl, nextPath])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        throw new Error('Invalid credentials')
      }

      const data = await res.json()
      const token = data.access_token as string
      const secureFlag = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${adminAuthCookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; SameSite=Lax${secureFlag}`
      window.location.href = nextPath
    } catch {
      setError('Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img
            src="/logo.png"
            alt="AROFi Logo"
            style={{ width: '200px', height: 'auto', margin: '0 auto 10px', display: 'block' }}
          />
          <p>Hotspot Billing & Network Management</p>
          <p style={{ marginTop: 4, fontSize: 11 }}>AROSOFT Innovations Ltd</p>
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

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              className="form-input"
              type="email"
              placeholder="admin@arosoft.io"
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
          <button
            type="submit"
            className="btn btn-primary btn-block"
            style={{ marginTop: 8 }}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
          AROFi v1.0 | &copy; 2026 AROSOFT Innovations Ltd
        </p>
      </div>
    </div>
  )
}
