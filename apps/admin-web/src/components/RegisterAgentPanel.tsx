'use client'

import { useState } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { PhoneNumberField } from '@/components/PhoneNumberField'
import { encodeAgentSalesPolicy } from '@/lib/agent-sales-policy'

type PackageItem = { id: string; name: string; activePriceUgx: number; status: string }
type PackageResponse = { items: PackageItem[] }
type CreatedAgent = { id: string; tenantId: string; name: string; email?: string | null }

type AgentFormState = {
  code: string
  name: string
  phoneNumber: string
  email: string
  temporaryPassword: string
  createLogin: boolean
  type: string
  territory: string
  commissionPercent: string
  cashLimitUgx: string
  cashEnabled: boolean
  mobileMoneyEnabled: boolean
  restrictPackages: boolean
  allowedPackageIds: string[]
  notes: string
}

const initialForm: AgentFormState = {
  code: '',
  name: '',
  phoneNumber: '',
  email: '',
  temporaryPassword: '',
  createLogin: true,
  type: 'FIELD_AGENT',
  territory: '',
  commissionPercent: '10',
  cashLimitUgx: '500000',
  cashEnabled: true,
  mobileMoneyEnabled: true,
  restrictPackages: false,
  allowedPackageIds: [],
  notes: '',
}

export default function RegisterAgentPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [packages, setPackages] = useState<PackageItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [agentCreated, setAgentCreated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    setIsOpen(true)
    setAgentCreated(false)
    setError(null)
    try {
      const response = await clientFetchApi<PackageResponse>('/packages')
      setPackages((response.items ?? []).filter((item) => item.status === 'ACTIVE'))
    } catch {
      setPackages([])
    }
  }

  function close() {
    setIsOpen(false)
    if (agentCreated) window.location.reload()
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (agentCreated) return
    setError(null)

    if (form.createLogin && !form.email.trim()) {
      setError('Email is required when creating an agent login.')
      return
    }
    if (form.createLogin && form.temporaryPassword.length < 8) {
      setError('Temporary password must be at least 8 characters.')
      return
    }
    if (form.restrictPackages && form.allowedPackageIds.length === 0) {
      setError('Select at least one package, or turn off package restriction.')
      return
    }

    setIsSubmitting(true)
    try {
      const policy = {
        cashEnabled: form.cashEnabled,
        mobileMoneyEnabled: form.mobileMoneyEnabled,
        allowedPackageIds: form.restrictPackages ? form.allowedPackageIds : [],
      }
      const agent = await clientPostApi<CreatedAgent>('/agents', {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        phoneNumber: form.phoneNumber.trim(),
        email: form.email.trim() || undefined,
        type: form.type,
        territory: form.territory.trim() || undefined,
        commissionRateBps: Math.round(Number(form.commissionPercent || 0) * 100),
        floatLimitUgx: Math.max(0, Math.round(Number(form.cashLimitUgx || 0))),
        notes: encodeAgentSalesPolicy(form.notes, policy),
      })
      setAgentCreated(true)

      if (form.createLogin) {
        const nameParts = form.name.trim().split(/\s+/).filter(Boolean)
        const firstName = nameParts[0] || 'Agent'
        const lastName = nameParts.slice(1).join(' ') || 'User'
        try {
          await clientPostApi('/users', {
            tenantId: agent.tenantId,
            email: form.email.trim().toLowerCase(),
            firstName,
            lastName,
            password: form.temporaryPassword,
            roleName: 'VoucherAgent',
          })
        } catch (loginError) {
          setError(
            `Agent profile was created, but the login could not be created: ${loginError instanceof Error ? loginError.message : 'unknown error'}. Close this window and fix the login from Staff & Roles.`,
          )
          setIsSubmitting(false)
          return
        }
      }

      setIsOpen(false)
      setForm(initialForm)
      window.location.reload()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not register agent')
    } finally {
      setIsSubmitting(false)
    }
  }

  function togglePackage(packageId: string) {
    setForm((previous) => ({
      ...previous,
      allowedPackageIds: previous.allowedPackageIds.includes(packageId)
        ? previous.allowedPackageIds.filter((id) => id !== packageId)
        : [...previous.allowedPackageIds, packageId],
    }))
  }

  return (
    <>
      <button className="primary-button" type="button" onClick={() => void open()}>
        + Register / Invite Agent
      </button>

      {isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 760, maxHeight: '92vh', overflowY: 'auto' }}>
            <button className="modal-close" type="button" onClick={close}>Close</button>
            <div className="modal-kicker">Hybrid Agent Sales</div>
            <h2 className="modal-title">Register & Configure Agent</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: -4, marginBottom: 16 }}>
              Create the seller profile, commission, cash controls, allowed packages and optional dashboard login in one place.
            </p>

            <form onSubmit={submit}>
              <div className="form-grid">
                <Field label="Agent Code" value={form.code} onChange={(value) => setForm((previous) => ({ ...previous, code: value.toUpperCase() }))} placeholder="KLA-AGENT-01" required />
                <Field label="Agent Name" value={form.name} onChange={(value) => setForm((previous) => ({ ...previous, name: value }))} placeholder="John Agent" required />
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <PhoneNumberField value={form.phoneNumber} onChange={(value) => setForm((previous) => ({ ...previous, phoneNumber: value }))} required ugandaOnly mobileOnly />
                </div>
                <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((previous) => ({ ...previous, email: value }))} placeholder="agent@example.com" required={form.createLogin} />
                <div className="form-group">
                  <label className="form-label">Agent Type</label>
                  <select className="form-input" value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))}>
                    <option value="FIELD_AGENT">Field Agent</option>
                    <option value="RESELLER">Reseller</option>
                  </select>
                </div>
                <Field label="Territory" value={form.territory} onChange={(value) => setForm((previous) => ({ ...previous, territory: value }))} placeholder="Kampala Central" />
                <Field label="Commission %" type="number" value={form.commissionPercent} onChange={(value) => setForm((previous) => ({ ...previous, commissionPercent: value }))} placeholder="10" required />
                <Field label="Maximum Unsettled Cash (UGX)" type="number" value={form.cashLimitUgx} onChange={(value) => setForm((previous) => ({ ...previous, cashLimitUgx: value }))} placeholder="500000" />
              </div>

              <div className="card" style={{ padding: 14, margin: '14px 0 0' }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Selling permissions</div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={form.cashEnabled} onChange={(event) => setForm((previous) => ({ ...previous, cashEnabled: event.target.checked }))} />
                    Allow Cash sales
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={form.mobileMoneyEnabled} onChange={(event) => setForm((previous) => ({ ...previous, mobileMoneyEnabled: event.target.checked }))} />
                    Allow Mobile Money sales
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={form.restrictPackages} onChange={(event) => setForm((previous) => ({ ...previous, restrictPackages: event.target.checked }))} />
                    Restrict packages
                  </label>
                </div>

                {form.restrictPackages && (
                  <div style={{ display: 'grid', gap: 7, marginTop: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                    {packages.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No active packages were found.</span>}
                    {packages.map((pkg) => (
                      <label key={pkg.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
                        <input type="checkbox" checked={form.allowedPackageIds.includes(pkg.id)} onChange={() => togglePackage(pkg.id)} />
                        <span>{pkg.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 14, margin: '12px 0 0' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                  <input type="checkbox" checked={form.createLogin} onChange={(event) => setForm((previous) => ({ ...previous, createLogin: event.target.checked }))} />
                  Create agent dashboard login
                </label>
                {form.createLogin && (
                  <div style={{ marginTop: 10 }}>
                    <Field label="Temporary Password" type="password" value={form.temporaryPassword} onChange={(value) => setForm((previous) => ({ ...previous, temporaryPassword: value }))} placeholder="At least 8 characters" required />
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
                      The agent signs in with the email above and gets the restricted VoucherAgent role. Their dashboard is focused on selling, commission and cash accountability.
                    </p>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Optional internal note" />
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 12 }}>
                A cash limit of 0 means no monetary ceiling. Disabling Cash does not stop Mobile Money sales, so an agent with unsettled cash can continue selling online.
              </p>
              {error && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button className="secondary-button" type="button" onClick={close}>{agentCreated ? 'Close & Refresh' : 'Cancel'}</button>
                <button className="primary-button" type="submit" disabled={isSubmitting || agentCreated}>{isSubmitting ? 'Creating...' : agentCreated ? 'Agent Saved' : 'Create Agent'}</button>
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
