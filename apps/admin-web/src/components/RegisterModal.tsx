'use client'

import { useMemo, useState, type FormEvent } from 'react'
import type { TenantRegistrationResponse } from '@/lib/admin-types'
import { setBrowserAdminSession } from '@/lib/admin-session'

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

export function RegisterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [formState, setFormState] = useState(initialFormState)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<TenantRegistrationResponse | null>(null)
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api'

  const portalHint = useMemo(() => {
    const value = formState.desiredDomain.trim()
    if (!value) return 'Generated automatically'
    return value.includes('.') ? value : `${value}.tenant.arofi`
  }, [formState.desiredDomain])

  if (!open) return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (step < 3) {
      setStep((current) => current + 1)
      return
    }

    if (formState.password !== formState.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${apiBaseUrl}/onboarding/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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
        throw new Error(message ?? 'Unable to create workspace.')
      }

      const registration = body as TenantRegistrationResponse
      setBrowserAdminSession(registration.access_token)
      setSuccess(registration)
      setStep(4)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create workspace.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <button type="button" className="modal-close" onClick={onClose}>Close</button>
        <div className="modal-kicker">Step {step} of 4</div>
        <h2 className="modal-title">{step === 4 ? 'Workspace Ready' : 'Create Tenant Workspace'}</h2>
        <div className="wizard-steps">
          {[1, 2, 3, 4].map((item) => <span key={item} className={item <= step ? 'active' : ''} />)}
        </div>

        {step === 4 && success ? (
          <div className="sop-list">
            {[
              ['Add Your Router', 'Go to Routers, register the MikroTik, then paste the generated script into WinBox Terminal.'],
              ['Create Packages', 'Publish at least one package with price, duration, and optional data limits.'],
              ['Test the Portal', 'Connect a phone to the WiFi and open the captive portal to buy a package.'],
              ['Go Live', 'Confirm RADIUS traffic, accounting, voucher redemption, and paid activation.'],
            ].map(([title, description], index) => (
              <div key={title} className="sop-item">
                <strong>{index + 1}. {title}</strong>
                <span>{description}</span>
              </div>
            ))}
            <button type="button" className="btn btn-primary btn-block" onClick={() => { window.location.href = '/dashboard' }}>
              Open Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
            {step === 1 && (
              <div className="stats-grid">
                <Field label="Business Name" value={formState.tenantName} onChange={(value) => setFormState((previous) => ({ ...previous, tenantName: value }))} required />
                <Field label="Portal Slug" value={formState.desiredDomain} onChange={(value) => setFormState((previous) => ({ ...previous, desiredDomain: value }))} placeholder={portalHint} />
              </div>
            )}
            {step === 2 && (
              <div className="stats-grid">
                <Field label="First Name" value={formState.firstName} onChange={(value) => setFormState((previous) => ({ ...previous, firstName: value }))} required />
                <Field label="Last Name" value={formState.lastName} onChange={(value) => setFormState((previous) => ({ ...previous, lastName: value }))} required />
                <Field label="Login Email" type="email" value={formState.email} onChange={(value) => setFormState((previous) => ({ ...previous, email: value }))} required />
                <Field label="Phone Number" value={formState.phoneNumber} onChange={(value) => setFormState((previous) => ({ ...previous, phoneNumber: value }))} required />
              </div>
            )}
            {step === 3 && (
              <div className="stats-grid">
                <Field label="Password" type="password" value={formState.password} onChange={(value) => setFormState((previous) => ({ ...previous, password: value }))} required />
                <Field label="Confirm Password" type="password" value={formState.confirmPassword} onChange={(value) => setFormState((previous) => ({ ...previous, confirmPassword: value }))} required />
                <Field label="Support Phone" value={formState.supportPhone} onChange={(value) => setFormState((previous) => ({ ...previous, supportPhone: value }))} />
                <Field label="Support Email" type="email" value={formState.supportEmail} onChange={(value) => setFormState((previous) => ({ ...previous, supportEmail: value }))} />
                <Field label="Brand Color" value={formState.brandColor} onChange={(value) => setFormState((previous) => ({ ...previous, brandColor: value }))} placeholder="#16A34A" />
              </div>
            )}
            {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              {step > 1 && <button type="button" className="btn btn-ghost" onClick={() => setStep((current) => current - 1)}>Back</button>}
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Creating...' : step === 3 ? 'Create Workspace' : 'Continue'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
    </div>
  )
}
