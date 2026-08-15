'use client'

import { useState } from 'react'
import type { AgentItem } from '@/lib/admin-types'
import { clientDeleteApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { encodeAgentSalesPolicy, parseAgentSalesPolicy } from '@/lib/agent-sales-policy'
import GenerateAgentVouchersPanel from '@/components/GenerateAgentVouchersPanel'

type AgentForm = {
  code: string
  name: string
  phoneNumber: string
  email: string
  type: string
  territory: string
  commissionPercent: string
  notes: string
}

function formFromAgent(agent: AgentItem): AgentForm {
  return {
    code: agent.code,
    name: agent.name,
    phoneNumber: agent.phoneNumber,
    email: agent.email ?? '',
    type: agent.type,
    territory: agent.territory ?? '',
    commissionPercent: String((agent.commissionRateBps ?? 0) / 100),
    notes: parseAgentSalesPolicy(agent.notes).humanNotes,
  }
}

export default function AgentActionsPanel({ agent, canManage }: { agent: AgentItem; canManage: boolean }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<AgentForm>(() => formFromAgent(agent))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const savedPolicy = parseAgentSalesPolicy(agent.notes).policy

  async function refresh() {
    window.location.reload()
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await clientPatchApi(`/agents/${agent.id}`, {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        phoneNumber: form.phoneNumber.trim(),
        email: form.email.trim() || undefined,
        type: form.type,
        territory: form.territory.trim() || undefined,
        commissionRateBps: Math.round(Number(form.commissionPercent || 0) * 100),
        notes: encodeAgentSalesPolicy(form.notes, savedPolicy),
      })
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update agent')
    } finally {
      setBusy(false)
    }
  }

  async function setActive(active: boolean) {
    setBusy(true)
    setError('')
    try {
      await clientPostApi(`/agents/${agent.id}/${active ? 'activate' : 'deactivate'}`, {})
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update agent status')
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this agent? Agents with sales history will be deactivated to preserve records.')) return
    setBusy(true)
    setError('')
    try {
      await clientDeleteApi(`/agents/${agent.id}`)
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not delete agent')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {canManage && <GenerateAgentVouchersPanel agent={agent} />}
      {canManage && <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>}
      {canManage && (
        <button type="button" className="btn btn-ghost" onClick={() => void setActive(agent.status !== 'ACTIVE')} disabled={busy}>
          {agent.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </button>
      )}
      {canManage && <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger-fg)' }} onClick={() => void remove()} disabled={busy}>Delete</button>}

      {editing && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <button className="modal-close" type="button" onClick={() => setEditing(false)} disabled={busy}>Close</button>
            <div className="modal-kicker">Agent Profile</div>
            <h2 className="modal-title">Edit Agent</h2>
            <form onSubmit={save}>
              <div className="form-grid">
                <Field label="Agent Code" value={form.code} onChange={(value) => setForm((previous) => ({ ...previous, code: value.toUpperCase() }))} required />
                <Field label="Agent Name" value={form.name} onChange={(value) => setForm((previous) => ({ ...previous, name: value }))} required />
                <Field label="Phone Number" value={form.phoneNumber} onChange={(value) => setForm((previous) => ({ ...previous, phoneNumber: value }))} required />
                <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((previous) => ({ ...previous, email: value }))} />
                <div className="form-group">
                  <label className="form-label">Agent Type</label>
                  <select className="form-input" value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))}>
                    <option value="RESELLER">Reseller</option>
                    <option value="FIELD_AGENT">Field Agent</option>
                  </select>
                </div>
                <Field label="Territory" value={form.territory} onChange={(value) => setForm((previous) => ({ ...previous, territory: value }))} />
                <Field label="Commission %" type="number" value={form.commissionPercent} onChange={(value) => setForm((previous) => ({ ...previous, commissionPercent: value }))} required />
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} />
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                Cash/Mobile Money permissions and package restrictions are preserved here. Change those from Sales Controls on the Agents page.
              </p>
              {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button className="secondary-button" type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} min={type === 'number' ? 0 : undefined} />
    </div>
  )
}
