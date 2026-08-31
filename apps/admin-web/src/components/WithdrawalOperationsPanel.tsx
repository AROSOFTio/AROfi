'use client'

import { useMemo, useState } from 'react'
import { Activity, Ban, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'

type Withdrawal = {
  id: string
  reference: string
  network?: string | null
  destinationReference?: string | null
  amountUgx: number
  status: string
  providerReference?: string | null
  createdAt: string
}

type Diagnostics = {
  withdrawal: Withdrawal & {
    provider?: string | null
    notes?: string | null
    completedAt?: string | null
    failedAt?: string | null
  }
  reserve?: {
    billingTransactionId: string
    billingStatus: string
    totalDebitUgx: number
    feeAmountUgx: number
    walletId?: string | null
  } | null
  safety: {
    providerSubmitted: boolean
    canCancel: boolean
    canRefreshProvider: boolean
    cancellationReason: string
    retryPolicy?: string | null
  }
  providerStatus?: {
    status?: unknown
    statusCode?: unknown
    transactionStatus?: unknown
    transactionReference?: unknown
    statusMessage?: unknown
    errorMessage?: unknown
  } | null
  providerError?: string | null
  auditTrail: Array<{
    id: string
    action: string
    severity: string
    createdAt: string
    userId?: string | null
  }>
}

const LIVE_STATUSES = new Set([
  'PENDING',
  'PENDING_APPROVAL',
  'PENDING_NUMBER_APPROVAL',
  'FLAGGED_FOR_REVIEW',
  'PROCESSING',
  'FAILED',
])

const SAFE_CANCEL_STATUSES = new Set([
  'PENDING',
  'PENDING_APPROVAL',
  'PENDING_NUMBER_APPROVAL',
  'FLAGGED_FOR_REVIEW',
])

export default function WithdrawalOperationsPanel({ initialWithdrawals }: { initialWithdrawals: Withdrawal[] }) {
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals)
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const operational = useMemo(
    () => withdrawals.filter((item) => LIVE_STATUSES.has(item.status)).slice(0, 10),
    [withdrawals],
  )

  if (operational.length === 0) return null

  async function reloadWithdrawals() {
    const profile = await clientFetchApi<{ recentWithdrawals?: Withdrawal[] }>('/wallets/payouts/profile/me')
    setWithdrawals(profile.recentWithdrawals ?? [])
  }

  async function troubleshoot(withdrawal: Withdrawal, checkProvider = false) {
    setBusy(`diagnostics:${withdrawal.id}`)
    setError('')
    setMessage('')
    try {
      const result = await clientFetchApi<Diagnostics>(
        `/wallets/withdrawals/${encodeURIComponent(withdrawal.id)}/diagnostics?checkProvider=${checkProvider ? 'true' : 'false'}`,
      )
      setDiagnostics(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load withdrawal diagnostics')
    } finally {
      setBusy('')
    }
  }

  async function refreshProvider(withdrawal: Withdrawal) {
    setBusy(`refresh:${withdrawal.id}`)
    setError('')
    setMessage('')
    try {
      const result = await clientPostApi<Diagnostics>(
        `/wallets/withdrawals/${encodeURIComponent(withdrawal.id)}/refresh-status`,
        {},
        { timeoutMs: 30_000 },
      )
      setDiagnostics(result)
      await reloadWithdrawals()
      setMessage('Provider status checked and the withdrawal record was reconciled safely.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh provider status')
    } finally {
      setBusy('')
    }
  }

  async function cancelWithdrawal(withdrawal: Withdrawal) {
    const accepted = window.confirm(
      `Cancel ${formatCurrency(withdrawal.amountUgx)} withdrawal ${withdrawal.reference}? This only succeeds if it has not been submitted to the payout provider.`,
    )
    if (!accepted) return

    const reason = window.prompt('Reason for cancellation:', 'Cancelled from Wallet & Earnings')?.trim()
    if (reason === undefined) return

    setBusy(`cancel:${withdrawal.id}`)
    setError('')
    setMessage('')
    try {
      await clientPostApi(`/wallets/withdrawals/${encodeURIComponent(withdrawal.id)}/cancel`, {
        reason: reason || 'Cancelled from Wallet & Earnings',
      })
      await reloadWithdrawals()
      setDiagnostics(null)
      setMessage('Withdrawal cancelled before provider submission. Reserved wallet funds were returned.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to cancel withdrawal')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Withdrawal Operations & Troubleshooting</span>
          <span className="badge badge-warning">{operational.length} need attention</span>
        </div>
        <div className="withdraw-card-body">
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Cancel only withdrawals that have not reached the payout provider. For processing withdrawals, check the provider first so AROFi never refunds money that may already be on its way.
          </p>
          {(message || error) && (
            <div className="withdraw-alert-row" style={{ marginBottom: 12 }}>
              {message && <div className="inline-success"><ShieldCheck size={15} /> {message}</div>}
              {error && <div className="inline-warning"><TriangleAlert size={15} /> {error}</div>}
            </div>
          )}
        </div>
        <div className="table-wrap clean-withdraw-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Operations</th>
              </tr>
            </thead>
            <tbody>
              {operational.map((withdrawal) => {
                const canOfferCancel = SAFE_CANCEL_STATUSES.has(withdrawal.status) && !withdrawal.providerReference
                const isProcessing = withdrawal.status === 'PROCESSING'
                return (
                  <tr key={withdrawal.id}>
                    <td>{formatDate(withdrawal.createdAt)}</td>
                    <td>{formatCurrency(withdrawal.amountUgx)}</td>
                    <td><code>{withdrawal.reference}</code></td>
                    <td><span className={getStatusBadgeClass(withdrawal.status)}>{humanize(withdrawal.status)}</span></td>
                    <td>
                      <div className="withdraw-head-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => troubleshoot(withdrawal, false)}
                          disabled={Boolean(busy)}
                        >
                          <Activity size={14} /> Troubleshoot
                        </button>
                        {isProcessing && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => refreshProvider(withdrawal)}
                            disabled={Boolean(busy)}
                          >
                            <RefreshCw size={14} className={busy === `refresh:${withdrawal.id}` ? 'spin' : ''} /> Check Provider
                          </button>
                        )}
                        {canOfferCancel && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => cancelWithdrawal(withdrawal)}
                            disabled={Boolean(busy)}
                          >
                            <Ban size={14} /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <DiagnosticsModal
        diagnostics={diagnostics}
        busy={busy}
        onClose={() => setDiagnostics(null)}
        onRefresh={refreshProvider}
        onCancel={cancelWithdrawal}
      />
    </>
  )
}

function DiagnosticsModal({
  diagnostics,
  busy,
  onClose,
  onRefresh,
  onCancel,
}: {
  diagnostics: Diagnostics | null
  busy: string
  onClose: () => void
  onRefresh: (withdrawal: Withdrawal) => Promise<void>
  onCancel: (withdrawal: Withdrawal) => Promise<void>
}) {
  const withdrawal = diagnostics?.withdrawal
  return (
    <Modal
      open={Boolean(diagnostics)}
      onClose={onClose}
      closeDisabled={Boolean(busy)}
      style={{ width: 'min(760px, 100%)' }}
      kicker="Withdrawal diagnostics"
      title={withdrawal ? `${formatCurrency(withdrawal.amountUgx)} · ${humanize(withdrawal.status)}` : 'Withdrawal diagnostics'}
    >
      {diagnostics && withdrawal && (
        <div className="withdraw-step-form" style={{ marginTop: 16 }}>
          <div className="withdraw-summary-box">
            <DiagnosticRow label="Reference" value={withdrawal.reference} />
            <DiagnosticRow label="Provider reference" value={withdrawal.providerReference || 'Not recorded'} />
            <DiagnosticRow label="Provider submitted" value={diagnostics.safety.providerSubmitted ? 'Yes / possible' : 'No evidence'} />
            <DiagnosticRow label="Reserved amount" value={diagnostics.reserve ? formatCurrency(diagnostics.reserve.totalDebitUgx) : 'Unknown'} />
            <DiagnosticRow label="Billing state" value={diagnostics.reserve?.billingStatus || 'Unknown'} />
          </div>

          <div className={diagnostics.safety.canCancel ? 'inline-success' : 'inline-warning'}>
            {diagnostics.safety.canCancel ? <ShieldCheck size={16} /> : <TriangleAlert size={16} />}
            {diagnostics.safety.cancellationReason}
          </div>

          {diagnostics.providerStatus && (
            <div className="withdraw-summary-box">
              <DiagnosticRow label="Provider status" value={String(diagnostics.providerStatus.transactionStatus ?? diagnostics.providerStatus.status ?? 'Unknown')} />
              <DiagnosticRow label="Provider transaction" value={String(diagnostics.providerStatus.transactionReference ?? 'Not returned')} />
              <DiagnosticRow label="Provider message" value={String(diagnostics.providerStatus.statusMessage ?? diagnostics.providerStatus.errorMessage ?? 'No message')} />
            </div>
          )}
          {diagnostics.providerError && <div className="inline-warning"><TriangleAlert size={16} /> {diagnostics.providerError}</div>}
          {diagnostics.safety.retryPolicy && <p className="field-hint">{diagnostics.safety.retryPolicy}</p>}

          <div>
            <div className="form-label" style={{ marginBottom: 8 }}>Audit trail</div>
            {diagnostics.auditTrail.length === 0 ? (
              <p className="field-hint">No withdrawal audit entries were found.</p>
            ) : (
              <div className="destination-list">
                {diagnostics.auditTrail.slice(0, 8).map((entry) => (
                  <div className="destination-option" key={entry.id}>
                    <span style={{ flex: 1 }}>{humanize(entry.action.replace(/\./g, '_'))}</span>
                    <small>{formatDate(entry.createdAt)}</small>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="withdraw-action-row">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={Boolean(busy)}>Close</button>
            {diagnostics.safety.canCancel && (
              <button type="button" className="btn btn-ghost" onClick={() => onCancel(withdrawal)} disabled={Boolean(busy)}>
                <Ban size={16} /> Cancel Withdrawal
              </button>
            )}
            {diagnostics.safety.canRefreshProvider && (
              <button type="button" className="btn btn-primary" onClick={() => onRefresh(withdrawal)} disabled={Boolean(busy)}>
                <RefreshCw size={16} /> Check Provider & Reconcile
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
