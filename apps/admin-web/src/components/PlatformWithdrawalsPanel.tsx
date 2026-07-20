'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PlatformWithdrawalsResponse } from '@/lib/admin-types'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'
import ReviewActionModal from '@/components/ReviewActionModal'

export default function PlatformWithdrawalsPanel({ initialData }: { initialData: PlatformWithdrawalsResponse | null }) {
  const [data, setData] = useState(initialData)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pendingReject, setPendingReject] = useState<{ actionId: string; title: string; success: string; path: string } | null>(null)

  async function reload() {
    setData(await clientFetchApi<PlatformWithdrawalsResponse>('/wallets/withdrawals/all'))
  }

  async function run(actionId: string, success: string, task: () => Promise<unknown>) {
    setBusy(actionId)
    setMessage('')
    setError('')
    try {
      await task()
      setMessage(success)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const pendingNumbers = data?.pendingPayoutNumbers ?? []
  const pendingChanges = data?.pendingNumberChanges ?? []
  const withdrawals = data?.items ?? []
  const pendingWithdrawals = withdrawals.filter((item) => item.status === 'FLAGGED_FOR_REVIEW' || item.status === 'PENDING_APPROVAL')

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Developer Withdrawal Control</h1>
          <p className="page-subtitle">Approve payout numbers, review flagged withdrawals, and monitor business settlement risk across the platform.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => run('reload', 'Refreshed withdrawal control data.', reload)} disabled={busy === 'reload'}>
          {busy === 'reload' ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {(message || error) && (
        <div className="card" style={{ padding: 14 }}>
          {message && <p style={{ color: 'var(--success-fg)', fontSize: 13 }}>{message}</p>}
          {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}
        </div>
      )}

      <div className="stats-grid">
        <Stat label="Pending Numbers" value={`${data?.summary.pendingPayoutNumbers ?? 0}`} color="amber" />
        <Stat label="Number Changes" value={`${data?.summary.pendingNumberChanges ?? 0}`} color="purple" />
        <Stat label="Flagged Withdrawals" value={`${data?.summary.pendingReview ?? 0}`} color="amber" />
        <Stat label="Completed Payouts" value={formatCurrency(data?.summary.completedAmountUgx ?? 0)} color="green" />
      </div>

      <section className="card">
        <div className="card-header"><span className="card-title">Pending Registered Payout Numbers</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Network</th>
                <th>Phone</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingNumbers.length === 0 && <Empty colSpan={7} text="No payout numbers are waiting for approval." />}
              {pendingNumbers.map((number) => (
                <tr key={number.id}>
                  <td>{number.tenant.name}<Small>{number.tenant.domain ?? 'No domain'}</Small></td>
                  <td>{number.network}</td>
                  <td>{maskPhone(number.normalizedPhone)}</td>
                  <td>{number.ownerName ?? number.label ?? '-'}</td>
                  <td><span className={getStatusBadgeClass(number.status)}>{formatStatus(number.status)}</span></td>
                  <td style={{ fontSize: 12 }}>{formatDate(number.createdAt)}</td>
                  <td>
                    <ActionRow
                      approveBusy={busy === `approve-number-${number.id}`}
                      rejectBusy={busy === `reject-number-${number.id}`}
                      onApprove={() => run(`approve-number-${number.id}`, 'Payout number approved.', () => clientPostApi(`/wallets/payouts/numbers/${number.id}/approve`, {}))}
                      onReject={() => setPendingReject({
                        actionId: `reject-number-${number.id}`,
                        title: `Reject payout number ${maskPhone(number.normalizedPhone)}`,
                        success: 'Payout number rejected.',
                        path: `/wallets/payouts/numbers/${number.id}/reject`,
                      })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><span className="card-title">Payout Number Change Requests</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>New Number</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingChanges.length === 0 && <Empty colSpan={6} text="No payout number change requests are waiting." />}
              {pendingChanges.map((request) => (
                <tr key={request.id}>
                  <td>{request.tenant.name}<Small>{request.tenant.domain ?? 'No domain'}</Small></td>
                  <td>{request.requestedNetwork} {maskPhone(request.requestedNormalizedPhone)}</td>
                  <td style={{ maxWidth: 360 }}>{request.reason}</td>
                  <td><span className={getStatusBadgeClass(request.status)}>{formatStatus(request.status)}</span></td>
                  <td style={{ fontSize: 12 }}>{formatDate(request.createdAt)}</td>
                  <td>
                    <ActionRow
                      approveBusy={busy === `approve-change-${request.id}`}
                      rejectBusy={busy === `reject-change-${request.id}`}
                      onApprove={() => run(`approve-change-${request.id}`, 'Payout number change approved.', () => clientPostApi(`/wallets/payouts/number-change-requests/${request.id}/approve`, {}))}
                      onReject={() => setPendingReject({
                        actionId: `reject-change-${request.id}`,
                        title: `Reject number change for ${request.tenant.name}`,
                        success: 'Payout number change rejected.',
                        path: `/wallets/payouts/number-change-requests/${request.id}/reject`,
                      })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><span className="card-title">Flagged Withdrawals</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingWithdrawals.length === 0 && <Empty colSpan={7} text="No withdrawals are flagged for review." />}
              {pendingWithdrawals.map((withdrawal) => (
                <tr key={withdrawal.id}>
                  <td>{withdrawal.tenant.name}<Small>{withdrawal.tenant.domain ?? 'No domain'}</Small></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{withdrawal.reference}</td>
                  <td>{formatCurrency(withdrawal.amountUgx)}</td>
                  <td>{withdrawal.network ?? 'Mobile Money'} {withdrawal.destinationReference ? maskPhone(withdrawal.destinationReference) : ''}</td>
                  <td><span className={getStatusBadgeClass(withdrawal.status)}>{formatStatus(withdrawal.status)}</span></td>
                  <td style={{ maxWidth: 360 }}>{withdrawal.notes ?? '-'}</td>
                  <td>
                    <ActionRow
                      approveBusy={busy === `approve-withdrawal-${withdrawal.id}`}
                      rejectBusy={busy === `reject-withdrawal-${withdrawal.id}`}
                      onApprove={() => run(`approve-withdrawal-${withdrawal.id}`, 'Withdrawal approved and sent to provider.', () => clientPostApi(`/wallets/withdrawals/${withdrawal.id}/approve`, {}, { timeoutMs: 30000 }))}
                      onReject={() => setPendingReject({
                        actionId: `reject-withdrawal-${withdrawal.id}`,
                        title: `Reject withdrawal ${withdrawal.reference}`,
                        success: 'Withdrawal rejected and reserve released.',
                        path: `/wallets/withdrawals/${withdrawal.id}/reject`,
                      })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><span className="card-title">Recent Business Withdrawals</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Provider Ref</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 && <Empty colSpan={7} text="No business withdrawals have been requested." />}
              {withdrawals.slice(0, 80).map((withdrawal) => (
                <tr key={withdrawal.id}>
                  <td>{withdrawal.tenant.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{withdrawal.reference}</td>
                  <td>{formatCurrency(withdrawal.amountUgx)}</td>
                  <td>{withdrawal.network ?? 'Mobile Money'} {withdrawal.destinationReference ? maskPhone(withdrawal.destinationReference) : ''}</td>
                  <td><span className={getStatusBadgeClass(withdrawal.status)}>{formatStatus(withdrawal.status)}</span></td>
                  <td>{withdrawal.providerReference ?? '-'}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(withdrawal.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ReviewActionModal
        open={Boolean(pendingReject)}
        title={pendingReject?.title ?? ''}
        description="The business will see this reason on the rejected item."
        confirmLabel="Reject"
        danger
        noteRequired
        noteLabel="Reason for rejection"
        busy={Boolean(pendingReject && busy === pendingReject.actionId)}
        onConfirm={(reason) => {
          if (!pendingReject) return
          const target = pendingReject
          void run(target.actionId, target.success, () => clientPostApi(target.path, { reason })).then(() => setPendingReject(null))
        }}
        onClose={() => setPendingReject(null)}
      />
    </div>
  )
}

function ActionRow({ approveBusy, rejectBusy, onApprove, onReject }: { approveBusy: boolean; rejectBusy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn btn-primary" style={{ padding: '7px 10px', fontSize: 12 }} onClick={onApprove} disabled={approveBusy || rejectBusy}>
        {approveBusy ? 'Approving...' : 'Approve'}
      </button>
      <button className="btn btn-ghost" style={{ padding: '7px 10px', fontSize: 12 }} onClick={onReject} disabled={approveBusy || rejectBusy}>
        {rejectBusy ? 'Rejecting...' : 'Reject'}
      </button>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
    </div>
  )
}

function Empty({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan}><div className="empty-state" style={{ padding: 24 }}><p>{text}</p></div></td>
    </tr>
  )
}

function Small({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{children}</div>
}

function formatStatus(value: string) {
  return value.toLowerCase().replace(/_/g, ' ')
}

function maskPhone(value: string) {
  if (value.length <= 6) return value
  return `${value.slice(0, 4)}xxxx${value.slice(-3)}`
}
