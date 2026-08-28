'use client'

import { useState } from 'react'
import { clientPostApi } from '@/lib/client-api'
import { PhoneNumberField } from '@/components/PhoneNumberField'

type AgentFormState = {
  code: string
  name: string
  phoneNumber: string
  email: string
  territory: string
  commissionPercent: string
  notes: string
  temporaryPassword: string
}

type CreatedAgent = {
  id: string
  loginReady?: boolean
}

const initialForm: AgentFormState = {
  code: '',
  name: '',
  phoneNumber: '',
  email: '',
  territory: '',
  commissionPercent: '5',
  notes: '',
  temporaryPassword: '',
}

export default function RegisterAgentPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdLogin, setCreatedLogin] = useState<{ email: string; password: string } | null>(null)

  function close() {
    setIsOpen(false)
    setCreatedLogin(null)
    setError(null)
    setForm(initialForm)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const email = form.email.trim().toLowerCase()
      const password = form.temporaryPassword

      const agent = await clientPostApi<CreatedAgent>('/agents/register', {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        phoneNumber: form.phoneNumber.trim(),
        email,
        temporaryPassword: password,
        territory: form.territory.trim() || undefined,
        commissionRateBps: Math.round(Number(form.commissionPercent || 0) * 100),
        floatLimitUgx: 0,
        notes: form.notes.trim() || undefined,
      })

      if (!agent.loginReady) {
        throw new Error('Agent profile was created without a login. Please refresh and review the Agent account.')
      }

      setCreatedLogin({ email, password })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not register agent login')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <button className="primary-button" type="button" onClick={() => setIsOpen(true)}>
        + Register Agent
      </button>

      {isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 720 }}>
            <button className="modal-close" type="button" onClick={close} disabled={isSubmitting}>Close</button>
            <div className="modal-kicker">Agent Login + Sales Account</div>
            <h2 className="modal-title">Register Agent</h2>

            {createdLogin ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ border: '1px solid var(--success-border, var(--border))', borderRadius: 12, padding: 16, background: 'var(--bg-soft)' }}>
                  <strong style={{ color: 'var(--success-fg)' }}>Agent account is ready</strong>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55, margin: '6px 0 0' }}>
                    Give these details to the Agent. They sign in at <strong>/login</strong>, then AROFi sends a verification code to this email before opening the Agent Dashboard.
                  </p>
                </div>
                <div className="form-grid">
                  <ReadOnlyField label="Login URL" value="https://arofi.net/login" />
                  <ReadOnlyField label="Login Email" value={createdLogin.email} />
                  <ReadOnlyField label="Temporary Password" value={createdLogin.password} />
                  <ReadOnlyField label="After Login" value="Dashboard → Sell Internet" />
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 13 }}>
                  <strong style={{ fontSize: 13 }}>How the Agent sells online</strong>
                  <ol style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.65, margin: '7px 0 0', paddingLeft: 20 }}>
                    <li>Open <strong>Sell Internet</strong> and choose an allowed package.</li>
                    <li>Choose <strong>Activate Now</strong> or <strong>Voucher for Later</strong>.</li>
                    <li>Choose <strong>Cash</strong> or <strong>Mobile Money</strong>.</li>
                    <li>For Mobile Money, enter the paying MTN/Airtel number. The customer approves the prompt; AROFi issues access only after the provider confirms payment.</li>
                  </ol>
                </div>
                <button className="primary-button" type="button" onClick={() => window.location.reload()}>Done</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14, background: 'var(--bg-soft)' }}>
                  <strong style={{ fontSize: 13 }}>Every online-selling Agent gets their own login.</strong>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.5, margin: '4px 0 0' }}>
                    Use a real email the Agent can access. AROFi creates the seller profile and login together, so registration cannot leave a half-created Agent if one step fails.
                  </p>
                </div>

                <div className="form-grid">
                  <Field label="Agent Code" value={form.code} onChange={(value) => setForm((previous) => ({ ...previous, code: value.toUpperCase() }))} placeholder="KLA-AGENT-01" required />
                  <Field label="Agent Name" value={form.name} onChange={(value) => setForm((previous) => ({ ...previous, name: value }))} placeholder="Kampala Kiosk Agent" required />
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <PhoneNumberField value={form.phoneNumber} onChange={(value) => setForm((previous) => ({ ...previous, phoneNumber: value }))} required ugandaOnly mobileOnly />
                  </div>
                  <Field label="Agent Login Email" type="email" value={form.email} onChange={(value) => setForm((previous) => ({ ...previous, email: value }))} placeholder="agent@example.com" required />
                  <Field label="Temporary Password" type="password" value={form.temporaryPassword} onChange={(value) => setForm((previous) => ({ ...previous, temporaryPassword: value }))} placeholder="At least 8 characters" required minLength={8} />
                  <Field label="Territory" value={form.territory} onChange={(value) => setForm((previous) => ({ ...previous, territory: value }))} placeholder="Kampala Central" />
                  <Field label="Commission %" type="number" value={form.commissionPercent} onChange={(value) => setForm((previous) => ({ ...previous, commissionPercent: value }))} placeholder="5" required />
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Notes</label>
                  <input className="form-input" value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Optional internal note" />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
                  The Agent cannot create normal voucher batches. The business owner assigns offline stock separately. Online vouchers are created one-by-one only after a completed Cash sale or provider-confirmed Mobile Money payment.
                </p>
                {error && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                  <button className="secondary-button" type="button" onClick={close} disabled={isSubmitting}>Cancel</button>
                  <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating Login...' : 'Register Agent + Login'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  minLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  required?: boolean
  minLength?: number
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} minLength={minLength} min={type === 'number' ? 0 : undefined} />
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" value={value} readOnly onFocus={(event) => event.currentTarget.select()} />
    </div>
  )
}
