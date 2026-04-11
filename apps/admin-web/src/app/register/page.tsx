'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  clearBrowserAdminSession,
  getBrowserAdminToken,
  setBrowserAdminSession,
} from '@/lib/admin-session'
import type { TenantRegistrationResponse } from '@/lib/admin-types'

type RegisterFormState = {
  tenantName: string
  desiredDomain: string
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  supportPhone: string
  supportEmail: string
  brandColor: string
  password: string
  confirmPassword: string
}

const initialFormState: RegisterFormState = {
  tenantName: '',
  desiredDomain: '',
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  supportPhone: '',
  supportEmail: '',
  brandColor: '',
  password: '',
  confirmPassword: '',
}

export default function RegisterPage() {
  const [formState, setFormState] = useState<RegisterFormState>(initialFormState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<TenantRegistrationResponse | null>(null)
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api'

  useEffect(() => {
    let mounted = true

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

        if (!mounted) {
          return
        }

        if (response.ok) {
          window.location.href = '/dashboard'
          return
        }

        clearBrowserAdminSession()
      } catch {
        if (mounted) {
          clearBrowserAdminSession()
        }
      }
    }

    void validateExistingSession()

    return () => {
      mounted = false
    }
  }, [apiBaseUrl])

  const portalHint = useMemo(() => {
    const value = formState.desiredDomain.trim()
    if (!value) {
      return 'A unique tenant portal domain will be generated automatically.'
    }

    return value.includes('.') ? value : `${value}.tenant.arofi`
  }, [formState.desiredDomain])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (formState.password !== formState.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${apiBaseUrl}/onboarding/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantName: formState.tenantName.trim(),
          desiredDomain: formState.desiredDomain.trim() || undefined,
          firstName: formState.firstName.trim(),
          lastName: formState.lastName.trim(),
          email: formState.email.trim(),
          phoneNumber: formState.phoneNumber.trim(),
          supportPhone: formState.supportPhone.trim() || undefined,
          supportEmail: formState.supportEmail.trim() || undefined,
          brandColor: formState.brandColor.trim() || undefined,
          password: formState.password,
        }),
      })

      const body = (await response.json().catch(() => ({}))) as
        | TenantRegistrationResponse
        | { message?: string | string[] }

      if (!response.ok) {
        const errorBody = body as { message?: string | string[] }
        const message = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message
        throw new Error(message ?? 'Unable to provision the tenant workspace.')
      }

      const registration = body as TenantRegistrationResponse
      setBrowserAdminSession(registration.access_token)
      setSuccess(registration)
      setFormState(initialFormState)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to provision the tenant workspace.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="login-page" style={{ alignItems: 'flex-start', paddingTop: 48, paddingBottom: 48 }}>
        <div className="login-card" style={{ maxWidth: 860 }}>
          <div className="login-brand" style={{ textAlign: 'left' }}>
            <p style={{ letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)' }}>Tenant Provisioned</p>
            <h1 style={{ marginTop: 10 }}>{success.tenant.name}</h1>
            <p style={{ marginTop: 12 }}>
              Your workspace is approved, isolated, and ready. The first hotspot site and router group were created automatically.
            </p>
          </div>

          <div className="stats-grid" style={{ marginTop: 24 }}>
            <div className="stat-card blue">
              <div className="stat-label">Portal Domain</div>
              <div className="stat-value blue" style={{ fontSize: 20 }}>{success.tenant.domain ?? 'Auto-assigned'}</div>
            </div>
            <div className="stat-card green">
              <div className="stat-label">Primary Hotspot</div>
              <div className="stat-value green" style={{ fontSize: 20 }}>{success.starterWorkspace.primaryHotspot.name}</div>
            </div>
            <div className="stat-card amber">
              <div className="stat-label">Router Group</div>
              <div className="stat-value amber" style={{ fontSize: 20 }}>{success.starterWorkspace.primaryRouterGroup.name}</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header">
              <span className="card-title">Immediate Next Steps</span>
            </div>
            <div style={{ padding: 20, display: 'grid', gap: 14 }}>
              {success.onboarding.checklist.map((item, index) => (
                <div
                  key={item.title}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr',
                    gap: 14,
                    padding: 16,
                    borderRadius: 16,
                    border: '1px solid var(--border)',
                    background: 'rgba(15, 23, 42, 0.22)',
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'linear-gradient(135deg, rgba(14,165,233,0.18), rgba(16,185,129,0.18))',
                      color: 'var(--text-primary)',
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{item.title}</div>
                    <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 14 }}>{item.description}</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>{item.path}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => { window.location.href = '/dashboard' }}>
              Open Tenant Console
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { window.location.href = '/routers' }}>
              Go to Router Onboarding
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page" style={{ alignItems: 'flex-start', paddingTop: 48, paddingBottom: 48 }}>
      <div className="login-card" style={{ maxWidth: 980 }}>
        <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div>
            <div className="login-brand" style={{ textAlign: 'left', marginBottom: 0 }}>
              <p style={{ letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)' }}>Self-Service SaaS Onboarding</p>
              <h1 style={{ marginTop: 10 }}>Launch your hotspot billing workspace</h1>
              <p style={{ marginTop: 12 }}>
                Create a production tenant, vendor admin account, starter hotspot site, router group, wallet, and feature limits in one flow.
              </p>
            </div>

            <div style={{ marginTop: 28, display: 'grid', gap: 14 }}>
              {[
                'Automatic tenant approval with isolated workspace access.',
                'Starter hotspot site and primary router group created immediately.',
                'Billing wallet and MikroTik onboarding checklist included.',
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    borderRadius: 16,
                    border: '1px solid var(--border)',
                    padding: '14px 16px',
                    background: 'rgba(15,23,42,0.22)',
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: 24,
              padding: 24,
              background: 'linear-gradient(160deg, rgba(14,165,233,0.14), rgba(16,185,129,0.12), rgba(15,23,42,0.84))',
              border: '1px solid rgba(14,165,233,0.2)',
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--green)' }}>
              Provisioning Preview
            </div>
            <div style={{ marginTop: 18, display: 'grid', gap: 18 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Portal domain</div>
                <div style={{ marginTop: 4, color: 'var(--text-primary)', fontSize: 20, fontWeight: 700 }}>{portalHint}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Starter router group</div>
                <div style={{ marginTop: 4, color: 'var(--text-primary)', fontSize: 20, fontWeight: 700 }}>Primary Site</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Starter hotspot</div>
                <div style={{ marginTop: 4, color: 'var(--text-primary)', fontSize: 20, fontWeight: 700 }}>
                  {formState.tenantName.trim() ? `${formState.tenantName.trim()} Main Hotspot` : 'Main Hotspot'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 24,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 16,
              padding: '12px 16px',
              color: '#f87171',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 28 }}>
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <Field label="Business / Tenant Name" value={formState.tenantName} onChange={(value) => setFormState((previous) => ({ ...previous, tenantName: value }))} placeholder="ARO SpeedX" required />
            <Field label="Desired Portal Domain or Slug" value={formState.desiredDomain} onChange={(value) => setFormState((previous) => ({ ...previous, desiredDomain: value }))} placeholder="aro-speedx" />
            <Field label="Owner First Name" value={formState.firstName} onChange={(value) => setFormState((previous) => ({ ...previous, firstName: value }))} placeholder="Benjamin" required />
            <Field label="Owner Last Name" value={formState.lastName} onChange={(value) => setFormState((previous) => ({ ...previous, lastName: value }))} placeholder="Angella" required />
            <Field label="Login Email" type="email" value={formState.email} onChange={(value) => setFormState((previous) => ({ ...previous, email: value }))} placeholder="owner@arospeedx.com" required />
            <Field label="Owner Phone" value={formState.phoneNumber} onChange={(value) => setFormState((previous) => ({ ...previous, phoneNumber: value }))} placeholder="+256700000000" required />
            <Field label="Support Phone" value={formState.supportPhone} onChange={(value) => setFormState((previous) => ({ ...previous, supportPhone: value }))} placeholder="Defaults to owner phone" />
            <Field label="Support Email" type="email" value={formState.supportEmail} onChange={(value) => setFormState((previous) => ({ ...previous, supportEmail: value }))} placeholder="support@arospeedx.com" />
            <Field label="Brand Color" value={formState.brandColor} onChange={(value) => setFormState((previous) => ({ ...previous, brandColor: value }))} placeholder="#0EA5E9" />
            <Field label="Password" type="password" value={formState.password} onChange={(value) => setFormState((previous) => ({ ...previous, password: value }))} placeholder="At least 8 characters" required />
            <Field label="Confirm Password" type="password" value={formState.confirmPassword} onChange={(value) => setFormState((previous) => ({ ...previous, confirmPassword: value }))} placeholder="Repeat password" required />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Already have an account? <Link href="/login" style={{ color: 'var(--green)', fontWeight: 700 }}>Sign in</Link>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Provisioning workspace...' : 'Create Tenant Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  required?: boolean
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}
