'use client'

import { useState } from 'react'
import { clientPatchApi, clientPostApi } from '@/lib/client-api'

type Policy = { cashEnabled: boolean; mobileMoneyEnabled: boolean; allowedPackageIds: string[] }
type PackageItem = { id: string; name: string }

export default function AgentSalesControlsPanel({
  agentId,
  policy,
  cashLimitUgx,
  cashToCollectUgx,
  packages,
}: {
  agentId: string
  policy: Policy
  cashLimitUgx: number
  cashToCollectUgx: number
  packages: PackageItem[]
}) {
  const [open, setOpen] = useState<'policy' | 'settlement' | null>(null)
  const [cashEnabled, setCashEnabled] = useState(policy.cashEnabled)
  const [mobileMoneyEnabled, setMobileMoneyEnabled] = useState(policy.mobileMoneyEnabled)
  const [restrictPackages, setRestrictPackages] = useState(policy.allowedPackageIds.length > 0)
  const [allowedPackageIds, setAllowedPackageIds] = useState(policy.allowedPackageIds)
  const [cashLimit, setCashLimit] = useState(String(cashLimitUgx || 0))
  const [settlementAmount, setSettlementAmount] = useState(String(cashToCollectUgx || ''))
  const [settlementNote, setSettlementNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function togglePackage(id: string) {
    setAllowedPackageIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  async function savePolicy() {
    if (restrictPackages && allowedPackageIds.length === 0) {
      setError('Select at least one package or remove package restriction.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await clientPatchApi(`/agent-sales/agents/${agentId}/policy`, {
        cashEnabled,
        mobileMoneyEnabled,
        allowedPackageIds: restrictPackages ? allowedPackageIds : [],
        cashLimitUgx: Math.max(0, Math.round(Number(cashLimit || 0))),
      })
      window.location.reload()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update sales controls.')
      setBusy(false)
    }
  }

  async function recordSettlement() {
    const amountUgx = Math.round(Number(settlementAmount || 0))
    if (amountUgx <= 0) {
      setError('Enter the cash amount received from the agent.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await clientPostApi('/agent-sales/cash-settlements', {
        agentId,
        amountUgx,
        notes: settlementNote.trim() || undefined,
      })
      window.location.reload()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not record cash settlement.')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setError(''); setOpen('policy') }}>Sales Controls</button>
      {cashToCollectUgx > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setError(''); setSettlementAmount(String(cashToCollectUgx)); setOpen('settlement') }}>Record Settlement</button>}

      {open && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="modal-close" type="button" onClick={() => setOpen(null)} disabled={busy}>Close</button>
            {open === 'policy' ? (
              <>
                <div className="modal-kicker">Agent Permissions</div>
                <h2 className="modal-title">Sales Controls</h2>
                <div style={{ display: 'grid', gap: 12 }}>
                  <label style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                    <input type="checkbox" checked={cashEnabled} onChange={(event) => setCashEnabled(event.target.checked)} />
                    <span><strong>Cash sales</strong><br /><small style={{ color: 'var(--text-muted)' }}>Agent may confirm physical cash and activate/generate access.</small></span>
                  </label>
                  <label style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                    <input type="checkbox" checked={mobileMoneyEnabled} onChange={(event) => setMobileMoneyEnabled(event.target.checked)} />
                    <span><strong>Mobile Money sales</strong><br /><small style={{ color: 'var(--text-muted)' }}>Customer pays directly through the configured AROFi payment gateway.</small></span>
                  </label>
                  <div className="form-group">
                    <label className="form-label">Maximum unsettled cash (UGX)</label>
                    <input className="form-input" type="number" min={0} value={cashLimit} onChange={(event) => setCashLimit(event.target.value)} />
                    <small style={{ color: 'var(--text-muted)' }}>0 means no cash ceiling. Mobile Money remains available when the cash ceiling is reached.</small>
                  </div>
                  <label style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                    <input type="checkbox" checked={restrictPackages} onChange={(event) => setRestrictPackages(event.target.checked)} />
                    <strong>Only allow selected packages</strong>
                  </label>
                  {restrictPackages && (
                    <div style={{ display: 'grid', gap: 7, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                      {packages.map((pkg) => (
                        <label key={pkg.id} style={{ border: '1px solid var(--border)', padding: 9, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                          <input type="checkbox" checked={allowedPackageIds.includes(pkg.id)} onChange={() => togglePackage(pkg.id)} />
                          {pkg.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}
                <button type="button" className="primary-button" style={{ width: '100%', marginTop: 16 }} onClick={() => void savePolicy()} disabled={busy}>{busy ? 'Saving...' : 'Save Sales Controls'}</button>
              </>
            ) : (
              <>
                <div className="modal-kicker">Cash Accountability</div>
                <h2 className="modal-title">Record Cash Settlement</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Outstanding before settlement: <strong>UGX {cashToCollectUgx.toLocaleString()}</strong></p>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Cash received (UGX)</label>
                  <input className="form-input" type="number" min={1} max={cashToCollectUgx} value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} />
                </div>
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label className="form-label">Note</label>
                  <input className="form-input" value={settlementNote} onChange={(event) => setSettlementNote(event.target.value)} placeholder="Cash received at office" />
                </div>
                {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}
                <button type="button" className="primary-button" style={{ width: '100%', marginTop: 16 }} onClick={() => void recordSettlement()} disabled={busy}>{busy ? 'Recording...' : 'Confirm Cash Received'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
