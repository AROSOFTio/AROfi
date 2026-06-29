'use client'

import { useState } from 'react'
import { Modal } from '@/components/Modal'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'
import type { DisbursementOverviewResponse } from '@/lib/admin-types'

type AgentOption = { id: string; code: string; name: string }
type SettlementItem = DisbursementOverviewResponse['settlements'][number]

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

export default function SettlementsManager({
  initialSettlements,
  agents,
}: {
  initialSettlements: SettlementItem[]
  agents: AgentOption[]
}) {
  const [settlements, setSettlements] = useState(initialSettlements)
  const [createOpen, setCreateOpen] = useState(false)
  const [disburseTarget, setDisburseTarget] = useState<SettlementItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [createForm, setCreateForm] = useState({ agentId: agents[0]?.id ?? '', periodStart: '', periodEnd: '', notes: '' })
  const [disburseForm, setDisburseForm] = useState({ amountUgx: '', method: 'MOBILE_MONEY', destinationReference: '', notes: '' })

  function patchSettlement(updated: SettlementItem) {
    setSettlements((previous) => {
      const exists = previous.some((item) => item.id === updated.id)
      return exists
        ? previous.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
        : [updated, ...previous]
    })
  }

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!createForm.agentId) {
      setError('Select an agent to settle')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const settlement = await clientPostApi<SettlementItem>(`/agents/${createForm.agentId}/settlements`, {
        periodStart: createForm.periodStart ? new Date(createForm.periodStart).toISOString() : undefined,
        periodEnd: createForm.periodEnd ? new Date(createForm.periodEnd).toISOString() : undefined,
        notes: createForm.notes.trim() || undefined,
      })
      patchSettlement({ ...settlement, disbursedAmountUgx: 0 })
      setCreateOpen(false)
      setCreateForm({ agentId: agents[0]?.id ?? '', periodStart: '', periodEnd: '', notes: '' })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create settlement')
    } finally {
      setBusy(false)
    }
  }

  async function submitDisburse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!disburseTarget) return
    setBusy(true)
    setError(null)
    try {
      await clientPostApi(`/agents/${disburseTarget.agent.id}/disbursements`, {
        settlementId: disburseTarget.id,
        amountUgx: Number(disburseForm.amountUgx || 0),
        method: disburseForm.method,
        destinationReference: disburseForm.destinationReference.trim() || undefined,
        notes: disburseForm.notes.trim() || undefined,
      })
      // Disbursement totals/status live server-side; refresh the page data
      // rather than hand-rolling the same accrual math twice client-side.
      window.location.reload()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not post disbursement')
      setBusy(false)
    }
  }

  async function cancelSettlement(settlement: SettlementItem) {
    if (!window.confirm(`Cancel settlement ${settlement.reference}? Its commissions will return to the unsettled pool.`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await clientPostApi<SettlementItem>(`/agents/settlements/${settlement.id}/cancel`, {})
      patchSettlement({ ...updated, disbursedAmountUgx: 0 })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not cancel settlement')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Settlements</span>
        <button className="primary-button" type="button" onClick={() => setCreateOpen(true)} disabled={agents.length === 0}>
          + New Settlement
        </button>
      </div>

      {error && <div style={{ padding: '0 20px 12px' }}><FormProcessStatus error={error} /></div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Settlement</th>
              <th>Agent</th>
              <th>Period</th>
              <th>Payable</th>
              <th>Disbursed</th>
              <th>Remaining</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {settlements.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <p>No settlement runs have been created yet.</p>
                  </div>
                </td>
              </tr>
            )}
            {settlements.map((settlement) => {
              const remainingUgx = settlement.payableAmountUgx - settlement.disbursedAmountUgx
              const canDisburse = (settlement.status === 'READY' || settlement.status === 'PROCESSING') && remainingUgx > 0
              const canCancel = settlement.status === 'READY' && settlement.disbursedAmountUgx === 0

              return (
                <tr key={settlement.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{settlement.reference}</td>
                  <td>
                    <div>{settlement.agent.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{settlement.agent.code}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {formatDate(settlement.periodStart)} - {formatDate(settlement.periodEnd)}
                  </td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(settlement.payableAmountUgx)}</td>
                  <td>{formatCurrency(settlement.disbursedAmountUgx)}</td>
                  <td>{formatCurrency(remainingUgx)}</td>
                  <td>
                    <span className={getStatusBadgeClass(settlement.status)}>{settlement.status.toLowerCase()}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canDisburse && (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            setDisburseTarget(settlement)
                            setDisburseForm({ amountUgx: String(remainingUgx), method: 'MOBILE_MONEY', destinationReference: '', notes: '' })
                          }}
                        >
                          Disburse
                        </button>
                      )}
                      {canCancel && (
                        <button className="secondary-button" type="button" onClick={() => cancelSettlement(settlement)} disabled={busy}>
                          Cancel
                        </button>
                      )}
                      <a
                        className="secondary-button"
                        href={`${browserApiBase}/agents/settlements/${settlement.id}/receipt.pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Receipt
                      </a>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Settlement" kicker="Agent Commissions" closeDisabled={busy}>
        <form onSubmit={submitCreate}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Agent</label>
              <select
                className="form-input"
                value={createForm.agentId}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, agentId: event.target.value }))}
                required
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Period start (optional)</label>
              <input
                className="form-input"
                type="date"
                value={createForm.periodStart}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, periodStart: event.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Period end (optional)</label>
              <input
                className="form-input"
                type="date"
                value={createForm.periodEnd}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, periodEnd: event.target.value }))}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Notes</label>
            <input
              className="form-input"
              value={createForm.notes}
              onChange={(event) => setCreateForm((previous) => ({ ...previous, notes: event.target.value }))}
              placeholder="Optional note for this settlement run"
            />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
            Batches every accrued, unsettled commission for this agent (within the period, if set) into one payable settlement.
          </p>
          {error && <FormProcessStatus error={error} />}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button className="secondary-button" type="button" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Creating...' : 'Create Settlement'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(disburseTarget)}
        onClose={() => setDisburseTarget(null)}
        title={`Disburse against ${disburseTarget?.reference ?? ''}`}
        kicker="Agent Payout"
        closeDisabled={busy}
      >
        <form onSubmit={submitDisburse}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Amount (UGX)</label>
              <input
                className="form-input"
                type="number"
                min={1}
                value={disburseForm.amountUgx}
                onChange={(event) => setDisburseForm((previous) => ({ ...previous, amountUgx: event.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Method</label>
              <select
                className="form-input"
                value={disburseForm.method}
                onChange={(event) => setDisburseForm((previous) => ({ ...previous, method: event.target.value }))}
              >
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CASH">Cash</option>
                <option value="MANUAL">Manual</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Destination reference</label>
              <input
                className="form-input"
                value={disburseForm.destinationReference}
                onChange={(event) => setDisburseForm((previous) => ({ ...previous, destinationReference: event.target.value }))}
                placeholder="Defaults to the agent's phone number"
              />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Notes</label>
            <input
              className="form-input"
              value={disburseForm.notes}
              onChange={(event) => setDisburseForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
          </div>
          {error && <FormProcessStatus error={error} />}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button className="secondary-button" type="button" onClick={() => setDisburseTarget(null)} disabled={busy}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Posting...' : 'Post Disbursement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
