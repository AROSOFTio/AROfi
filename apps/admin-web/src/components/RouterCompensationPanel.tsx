'use client'

import { useEffect, useMemo, useState } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatDate } from '@/lib/format'

type CompensationCandidate = {
  activationId: string
  customerReference?: string | null
  accessPhoneNumber?: string | null
  packageName: string
  packageCode: string
  source: string
  voucherCode?: string | null
  startedAt: string
  endsAt: string
  timeRemainingSeconds: number
  remainingAtOutageSeconds: number
  secondsLost: number
  proposedNewEndsAt: string
}

type CompensationOverview = {
  settings: {
    autoCompensateRouterOutages: boolean
  }
  pendingOutage?: {
    id: string
    offlineAt: string
    restoredAt?: string | null
    durationSeconds?: number | null
    status: string
  } | null
  candidates?: CompensationCandidate[]
  outages: Array<{
    id: string
    offlineAt: string
    restoredAt?: string | null
    durationSeconds?: number | null
    status: string
    affectedActivations: number
    totalSecondsCredited: number
  }>
  compensations: Array<{
    id: string
    secondsCredited: number
    newEndsAt: string
    accessPhoneNumber?: string | null
    customerReference?: string | null
    activation: {
      package: { name: string }
    }
  }>
}

function duration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return '0 min'
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days} day${days === 1 ? '' : 's'}${remainingHours ? ` ${remainingHours} hr` : ''}`
}

function candidateLabel(candidate: CompensationCandidate) {
  return candidate.customerReference || candidate.accessPhoneNumber || 'Customer'
}

export default function RouterCompensationPanel({ routerId }: { routerId: string }) {
  const [overview, setOverview] = useState<CompensationOverview | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const candidates = overview?.candidates ?? []
  const allSelected = candidates.length > 0 && selectedIds.length === candidates.length
  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selectedIds.includes(candidate.activationId)),
    [candidates, selectedIds],
  )
  const selectedSeconds = selectedCandidates.reduce((sum, candidate) => sum + candidate.secondsLost, 0)

  useEffect(() => {
    void load()
  }, [routerId])

  async function load() {
    try {
      setLoading(true)
      setError('')
      const data = await clientFetchApi<CompensationOverview>(`/routers/${routerId}/compensation`)
      setOverview(data)
      setSelectedIds([])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load outage compensation')
    } finally {
      setLoading(false)
    }
  }

  async function toggleAutomatic(enabled: boolean) {
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const settings = await clientPostApi<{ autoCompensateRouterOutages: boolean }>('/routers/compensation/settings', { enabled })
      setOverview((current) => current ? { ...current, settings } : current)
      setMessage(enabled
        ? 'Automatic compensation is enabled for future verified router outages.'
        : 'Automatic compensation is off. Customer time will only be added after manual review.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update compensation mode')
    } finally {
      setSaving(false)
    }
  }

  function toggleCandidate(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id])
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : candidates.map((candidate) => candidate.activationId))
  }

  async function compensate(activationIds: string[], label: string) {
    if (activationIds.length === 0) return
    const accepted = window.confirm(
      `${label}\n\nThis adds only the verified time lost during the recorded router outage. Existing connection and provisioning settings will not be changed.`,
    )
    if (!accepted) return

    try {
      setSaving(true)
      setError('')
      setMessage('Applying verified customer time credits…')
      const result = await clientPostApi<{
        newlyCompensated: number
        newlyCreditedSeconds: number
        remainingCandidates: number
      }>(`/routers/${routerId}/compensation/manual`, { activationIds })
      setMessage(
        `${result.newlyCompensated} customer${result.newlyCompensated === 1 ? '' : 's'} compensated with ${duration(result.newlyCreditedSeconds)}. ${result.remainingCandidates} customer${result.remainingCandidates === 1 ? '' : 's'} still awaiting review.`,
      )
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to apply customer compensation')
      setMessage('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="router-compensation-card">
      <style>{`
        .router-compensation-card{margin-bottom:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);overflow:hidden}
        .rc-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 15px;border-bottom:1px solid var(--border)}
        .rc-title{font-size:14px;font-weight:800;color:var(--text-1)}
        .rc-subtitle{margin-top:2px;font-size:11.5px;color:var(--text-3);line-height:1.4}
        .rc-mode{display:flex;align-items:center;gap:8px;white-space:nowrap;font-size:12px;font-weight:750;color:var(--text-2)}
        .rc-switch{width:38px;height:22px;border:0;border-radius:999px;background:#cbd5e1;position:relative;padding:0;cursor:pointer;transition:.18s}
        .rc-switch:disabled{opacity:.55;cursor:not-allowed}
        .rc-switch span{position:absolute;width:18px;height:18px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.25);transition:transform .18s}
        .rc-switch.on{background:#16a34a}.rc-switch.on span{transform:translateX(16px)}
        .rc-body{padding:14px 15px;display:grid;gap:12px}
        .rc-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--surface-muted)}
        .rc-banner strong{font-size:12.5px;color:var(--text-1)}
        .rc-banner span{display:block;margin-top:2px;font-size:11.5px;color:var(--text-3)}
        .rc-count{font-size:12px;font-weight:800;color:var(--brand-fg);white-space:nowrap}
        .rc-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:10px}
        .rc-table{width:100%;border-collapse:collapse;min-width:820px}
        .rc-table th{padding:8px 9px;background:var(--surface-muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;text-align:left;color:var(--text-3);border-bottom:1px solid var(--border)}
        .rc-table td{padding:9px;border-bottom:1px solid var(--border-soft);font-size:12px;color:var(--text-2);vertical-align:middle}
        .rc-table tr:last-child td{border-bottom:0}.rc-table strong{display:block;color:var(--text-1);font-size:12.5px}.rc-table small{display:block;margin-top:2px;color:var(--text-3);font-size:10.5px}
        .rc-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
        .rc-actions-left{font-size:11.5px;color:var(--text-3)}
        .rc-buttons{display:flex;gap:8px;flex-wrap:wrap}
        .rc-empty{padding:18px;text-align:center;font-size:12.5px;color:var(--text-3)}
        .rc-message{font-size:12px;font-weight:700}.rc-message.ok{color:var(--success-fg)}.rc-message.err{color:var(--danger-fg)}
        .rc-history{border-top:1px solid var(--border);padding:10px 15px;background:var(--surface-muted)}
        .rc-history summary{cursor:pointer;font-size:11.5px;font-weight:750;color:var(--text-2)}
        .rc-history-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}
        .rc-history-item{border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:9px;font-size:11.5px;color:var(--text-2)}
        @media(max-width:720px){.rc-head{align-items:flex-start}.rc-body{padding:12px}.rc-banner{align-items:flex-start}.rc-history-grid{grid-template-columns:1fr}.rc-buttons{width:100%}.rc-buttons .btn{flex:1}.rc-mode{margin-top:1px}}
      `}</style>

      <div className="rc-head">
        <div>
          <div className="rc-title">Router outage compensation</div>
          <div className="rc-subtitle">Review verified customers affected while this router was offline. Automatic mode is off by default.</div>
        </div>
        <label className="rc-mode">
          <button
            type="button"
            className={`rc-switch ${overview?.settings.autoCompensateRouterOutages ? 'on' : ''}`}
            aria-pressed={overview?.settings.autoCompensateRouterOutages === true}
            aria-label="Toggle automatic router outage compensation"
            onClick={() => void toggleAutomatic(!overview?.settings.autoCompensateRouterOutages)}
            disabled={saving || loading}
          ><span /></button>
          Auto
        </label>
      </div>

      <div className="rc-body">
        {loading && <div className="rc-empty">Checking verified router outages and affected subscriptions…</div>}

        {!loading && overview?.pendingOutage && (
          <div className="rc-banner">
            <div>
              <strong>Outage awaiting review</strong>
              <span>{formatDate(overview.pendingOutage.offlineAt)} to {overview.pendingOutage.restoredAt ? formatDate(overview.pendingOutage.restoredAt) : 'ongoing'} · router unavailable for {duration(overview.pendingOutage.durationSeconds)}</span>
            </div>
            <div className="rc-count">{candidates.length} affected</div>
          </div>
        )}

        {!loading && candidates.length > 0 && (
          <>
            <div className="rc-table-wrap">
              <table className="rc-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all affected customers" /></th>
                    <th>Customer / reference</th>
                    <th>Phone</th>
                    <th>Voucher / package</th>
                    <th>Time left</th>
                    <th>Time lost</th>
                    <th>New expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.activationId}>
                      <td><input type="checkbox" checked={selectedIds.includes(candidate.activationId)} onChange={() => toggleCandidate(candidate.activationId)} aria-label={`Select ${candidateLabel(candidate)}`} /></td>
                      <td><strong>{candidateLabel(candidate)}</strong><small>{candidate.source.toLowerCase().replace(/_/g, ' ')}</small></td>
                      <td>{candidate.accessPhoneNumber ?? 'Not recorded'}</td>
                      <td><strong>{candidate.packageName}</strong><small>{candidate.voucherCode ? `Voucher ${candidate.voucherCode}` : candidate.packageCode}</small></td>
                      <td>{duration(candidate.timeRemainingSeconds)}<small>At outage: {duration(candidate.remainingAtOutageSeconds)}</small></td>
                      <td><span className="badge badge-warning">{duration(candidate.secondsLost)}</span></td>
                      <td>{formatDate(candidate.proposedNewEndsAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rc-actions">
              <div className="rc-actions-left">{selectedIds.length} selected · {duration(selectedSeconds)} total verified time</div>
              <div className="rc-buttons">
                <button type="button" className="btn btn-ghost btn-sm" disabled={saving || selectedIds.length === 0} onClick={() => void compensate(selectedIds, `Compensate ${selectedIds.length} selected customer${selectedIds.length === 1 ? '' : 's'}?`)}>
                  Compensate selected
                </button>
                <button type="button" className="btn btn-primary btn-sm" disabled={saving || candidates.length === 0} onClick={() => void compensate(candidates.map((candidate) => candidate.activationId), `Compensate all ${candidates.length} affected customers?`)}>
                  Compensate all affected
                </button>
              </div>
            </div>
          </>
        )}

        {!loading && candidates.length === 0 && (
          <div className="rc-empty">No uncompensated customers are waiting for review on this router.</div>
        )}

        {message && <div className="rc-message ok">{message}</div>}
        {error && <div className="rc-message err">{error}</div>}
      </div>

      <details className="rc-history">
        <summary>Recent outages and customer credits</summary>
        <div className="rc-history-grid">
          {(overview?.outages ?? []).slice(0, 4).map((outage) => (
            <div className="rc-history-item" key={outage.id}>
              <strong>{duration(outage.durationSeconds)} outage · {outage.status.toLowerCase().replace(/_/g, ' ')}</strong>
              <div>{formatDate(outage.offlineAt)} · {outage.affectedActivations} credited</div>
            </div>
          ))}
          {(overview?.compensations ?? []).slice(0, 4).map((credit) => (
            <div className="rc-history-item" key={credit.id}>
              <strong>{credit.activation.package.name} · +{duration(credit.secondsCredited)}</strong>
              <div>{credit.accessPhoneNumber ?? credit.customerReference ?? 'Customer'} · expires {formatDate(credit.newEndsAt)}</div>
            </div>
          ))}
          {(overview?.outages.length ?? 0) === 0 && (overview?.compensations.length ?? 0) === 0 && (
            <div className="rc-history-item">No outage history yet.</div>
          )}
        </div>
      </details>
    </section>
  )
}
