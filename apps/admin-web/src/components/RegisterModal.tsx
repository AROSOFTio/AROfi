'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { TenantRegistrationResponse } from '@/lib/admin-types'
import { getAppDashboardUrl } from '@/lib/admin-session'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { COUNTRY_CODES, DEFAULT_COUNTRY, isPlausibleNationalNumber, toE164 } from '@/lib/country-codes'

// Plan/payment picker is hidden from public signup for now — everyone lands
// on the Free plan and goes straight to the dashboard. Flip this back on
// when pricing is ready to go public; the step 4/5 UI below is untouched.
const SHOW_PRICING = false

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

const PLAN_CARDS = [
  {
    key: 'FREE',
    name: 'Starter (Free)',
    price: 'UGX 0 / Month',
    desc: 'Perfect for testing and small operations starting out.',
    color: '#64748b',
    badge: undefined as string | undefined,
  },
  {
    key: 'PRO',
    name: 'Pro Plan',
    price: 'UGX 20,000 / Month',
    desc: 'For growing ISPs wanting lower fees and branding control.',
    color: '#3b82f6',
    badge: 'Recommended',
  },
  {
    key: 'ENTERPRISE',
    name: 'Enterprise Plan',
    price: 'UGX 70,000 / Month',
    desc: 'For professional, large-scale networks and operators.',
    color: '#8b5cf6',
    badge: undefined as string | undefined,
  },
] as const

type PlanKey = (typeof PLAN_CARDS)[number]['key']

type CheckoutStatus = {
  selectedPlan: string
  subscriptionStatus: string
  pendingPlan: string | null
  checkout: { status: string; statusMessage?: string; amountUgx: number; plan: string } | null
}

export function RegisterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [formState, setFormState] = useState(initialFormState)
  const [phoneCountryIso2, setPhoneCountryIso2] = useState(DEFAULT_COUNTRY.iso2)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<TenantRegistrationResponse | null>(null)
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api'

  // Plan selection (step 4)
  const [planChoice, setPlanChoice] = useState<PlanKey | null>(null)
  const [planSaving, setPlanSaving] = useState(false)
  const [planError, setPlanError] = useState('')

  // Checkout (step 5)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [checkoutState, setCheckoutState] = useState<CheckoutStatus | null>(null)
  const pollRef = useRef<number | null>(null)

  const portalHint = useMemo(() => {
    const value = formState.desiredDomain.trim()
    if (!value) return 'Generated automatically'
    return value.includes('.') ? value : `${value}.tenant.arofi`
  }, [formState.desiredDomain])

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  if (!open) return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (step === 2 && !isPlausibleNationalNumber(formState.phoneNumber)) {
      setError('Enter a valid phone number for the selected country.')
      return
    }

    if (step < 3) {
      setStep((current) => current + 1)
      return
    }

    if (formState.password !== formState.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    const phoneCountry = COUNTRY_CODES.find((c) => c.iso2 === phoneCountryIso2) ?? DEFAULT_COUNTRY
    const fullPhoneNumber = toE164(phoneCountry, formState.phoneNumber)

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
          phoneNumber: fullPhoneNumber,
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

      // The API set the HttpOnly session cookies on this response — nothing
      // to store from JavaScript.
      const registration = body as TenantRegistrationResponse
      setSuccess(registration)
      setPhoneNumber(formState.phoneNumber.trim())

      if (!SHOW_PRICING) {
        window.location.href = getAppDashboardUrl()
        return
      }

      setStep(4)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create workspace.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectPlan(plan: PlanKey) {
    setPlanError('')
    setPlanSaving(true)
    try {
      await clientPostApi('/subscription/select', { plan })
      setPlanChoice(plan)

      if (plan === 'FREE') {
        window.location.href = getAppDashboardUrl()
        return
      }

      setStep(5)
    } catch (planRequestError) {
      setPlanError(planRequestError instanceof Error ? planRequestError.message : 'Unable to save plan selection.')
    } finally {
      setPlanSaving(false)
    }
  }

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function startPolling() {
    stopPolling()
    pollRef.current = window.setInterval(async () => {
      try {
        const statusResponse = await clientFetchApi<CheckoutStatus>('/subscription/checkout/status')
        setCheckoutState(statusResponse)

        const checkoutPaymentStatus = statusResponse.checkout?.status
        if (statusResponse.subscriptionStatus === 'ACTIVE' && !statusResponse.checkout) {
          stopPolling()
          setCheckoutLoading(false)
          window.location.href = getAppDashboardUrl()
        } else if (checkoutPaymentStatus === 'FAILED' || checkoutPaymentStatus === 'CANCELLED' || checkoutPaymentStatus === 'EXPIRED') {
          stopPolling()
          setCheckoutLoading(false)
          setCheckoutError(statusResponse.checkout?.statusMessage || 'Payment was not completed. Please try again.')
        }
      } catch (pollError) {
        // keep polling, transient network errors are common during MoMo prompts
      }
    }, 4000)
  }

  async function handlePayNow() {
    setCheckoutError('')
    setCheckoutLoading(true)
    try {
      const statusResponse = await clientPostApi<CheckoutStatus>('/subscription/checkout', { phoneNumber })
      setCheckoutState(statusResponse)
      startPolling()
    } catch (checkoutRequestError) {
      setCheckoutLoading(false)
      setCheckoutError(checkoutRequestError instanceof Error ? checkoutRequestError.message : 'Unable to start payment.')
    }
  }

  async function handleSkipAndPayLater() {
    setCheckoutError('')
    setCheckoutLoading(true)
    try {
      await clientPostApi('/subscription/skip', {})
      window.location.href = getAppDashboardUrl()
    } catch (skipError) {
      setCheckoutLoading(false)
      setCheckoutError(skipError instanceof Error ? skipError.message : 'Unable to skip payment right now.')
    }
  }

  const stepTitles: Record<number, string> = {
    1: 'Create Tenant Workspace',
    2: 'Create Tenant Workspace',
    3: 'Create Tenant Workspace',
    4: 'Choose Your Plan',
    5: 'Activate Your Plan',
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card" style={step >= 4 ? { width: 'min(720px, 96vw)' } : undefined}>
        {step < 4 && <button type="button" className="modal-close" onClick={onClose}>Close</button>}
        <div className="modal-kicker">Step {step} of 5</div>
        <h2 className="modal-title">{stepTitles[step]}</h2>
        <div className="wizard-steps">
          {[1, 2, 3, 4, 5].map((item) => <span key={item} className={item <= step ? 'active' : ''} />)}
        </div>

        {step === 4 && success ? (
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginBottom: 18 }}>
              Choose a plan. You can change it later in Settings.
            </p>
            {planError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 12 }}>{planError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {PLAN_CARDS.map((plan) => (
                <div
                  key={plan.key}
                  style={{
                    border: `1px solid var(--border)`,
                    borderRadius: 12,
                    padding: 18,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  {plan.badge && (
                    <span style={{
                      position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                      background: plan.color, color: '#fff', padding: '3px 10px', borderRadius: 12,
                      fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>{plan.badge}</span>
                  )}
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 800 }}>{plan.name}</h3>
                    <div style={{ fontSize: 18, fontWeight: 900, color: plan.color, margin: '8px 0' }}>{plan.price}</div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{plan.desc}</p>
                  </div>
                  <button
                    type="button"
                    disabled={planSaving}
                    onClick={() => handleSelectPlan(plan.key)}
                    className="btn btn-primary btn-block"
                    style={{ backgroundColor: plan.color, borderColor: plan.color }}
                  >
                    {planSaving ? 'Saving...' : `Select ${plan.name}`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : step === 5 && success ? (
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginBottom: 18 }}>
              Mobile money number for your {planChoice === 'ENTERPRISE' ? 'Enterprise' : 'Pro'} subscription, or skip and pay later.
            </p>
            {checkoutError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 12 }}>{checkoutError}</p>}
            {checkoutState?.checkout?.status === 'PENDING' && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
                Check your phone and enter your Mobile Money PIN to approve the payment. This page will update automatically.
              </p>
            )}
            <div className="form-group">
              <label className="form-label">Phone Number (MTN or Airtel)</label>
              <input
                className="form-input"
                type="text"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="07XXXXXXXX"
                disabled={checkoutLoading}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={handleSkipAndPayLater} disabled={checkoutLoading}>
                Skip and pay later
              </button>
              <button type="button" className="btn btn-primary" onClick={handlePayNow} disabled={checkoutLoading || !phoneNumber.trim()}>
                {checkoutLoading ? 'Processing...' : 'Pay Now'}
              </button>
            </div>
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
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      className="form-input"
                      style={{ flex: '0 0 auto', width: 120 }}
                      value={phoneCountryIso2}
                      onChange={(event) => setPhoneCountryIso2(event.target.value)}
                      aria-label="Country code"
                    >
                      {COUNTRY_CODES.map((country) => (
                        <option key={country.iso2} value={country.iso2}>
                          {country.iso2} +{country.dialCode}
                        </option>
                      ))}
                    </select>
                    <input
                      className="form-input"
                      style={{ flex: 1 }}
                      type="tel"
                      value={formState.phoneNumber}
                      onChange={(event) => setFormState((previous) => ({ ...previous, phoneNumber: event.target.value }))}
                      placeholder="771234567"
                      required
                    />
                  </div>
                </div>
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
