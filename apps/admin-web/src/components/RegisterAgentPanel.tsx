'use client'

import { useState } from 'react'
import { clientPostApi } from '@/lib/client-api'
import { PhoneNumberField } from '@/components/PhoneNumberField'

type AgentFormState = {
  code: string
  name: string
  phoneNumber: string
  email: string
  type: string
  territory: string
  commissionPercent: string
  floatLimitUgx: string
  notes: string
}

const initialForm: AgentFormState = {
  code: '',
  name: '',
  phoneNumber: '',
  email: '',
  type: 'RESELLER',
  territory: '',
  commissionPercent: '5',
  floatLimitUgx: '0',
  notes: '',
}

export default function RegisterAgentPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await clientPostApi('/agents', {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        phoneNumber: form.phoneNumber.trim(),
        email: form.email.trim() || undefined,
        type: form.type,
        territory: form.territory.trim() || undefined,
        commissionRateBps: Math.round(Number(form.commissionPercent || 0) * 100),
        floatLimitUgx: Number(form.floatLimitUgx || 0),
        notes: form.notes.trim() || undefined,
      })
      setIsOpen(false)
      setForm(initialForm)
      window.location.reload()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not register agent')
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
          <div className="modal-card">
            <button className="modal-close" type="button" onClick={() => setIsOpen(false)}>Close</button>
            <div className="modal-kicker">Voucher Sales Team</div>
            <h2 className="modal-title">Register Agent</h2>
            <form onSubmit={submit}>
              <div className="form-grid">
                <Field label="Agent Code" value={form.code} onChange={(value) => setForm((previous) => ({ ...previous, code: value.toUpperCase() }))} placeholder="KLA-AGENT-01" required />
                <Field label="Agent Name" value={form.name} onChange={(value) => setForm((previous) => ({ ...previous, name: value }))} placeholder="Kampala Kiosk Agent" required />
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <PhoneNumberField value={form.phoneNumber} onChange={(value) => setForm((previous) => ({ ...previous, phoneNumber: value }))} required ugandaOnly mobileOnly />
                </div>
                <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((previous) => ({ ...previous, email: value }))} placeholder="agent@example.com" />
                <div className="form-group">
                  <label className="form-label">Agent Type</label>
                  <select className="form-input" value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))}>
                    <option value="RESELLER">Reseller</option>
                    <option value="FIELD_AGENT">Field Agent</option>
                  </select>
                </div>
                <Field label="Territory" value={form.territory} onChange={(value) => setForm((previous) => ({ ...previous, territory: value }))} placeholder="Kampala Central" />
                <Field label="Commission %" type="number" value={form.commissionPercent} onChange={(value) => setForm((previous) => ({ ...previous, commissionPercent: value }))} placeholder="5" required />
                <Field label="Float Limit UGX" type="number" value={form.floatLimitUgx} onChange={(value) => setForm((previous) => ({ ...previous, floatLimitUgx: value }))} placeholder="100000" />
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Can generate and sell printed vouchers." />
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
                Sign-in needs a separate staff user (Users &amp; Roles → VoucherAgent).
              </p>
              {error && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button className="secondary-button" type="button" onClick={() => setIsOpen(false)}>Cancel</button>
                <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Registering...' : 'Register Agent'}</button>
              </div>
            </form>
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} min={type === 'number' ? 0 : undefined} />
    </div>
  )
}
