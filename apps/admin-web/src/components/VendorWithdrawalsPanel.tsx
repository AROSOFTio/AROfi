'use client'

import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, KeyRound, Plus, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import FormProcessStatus from '@/components/FormProcessStatus'
import { Modal } from '@/components/Modal'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'

type PayoutNumber = {
  id: string
  network: 'MTN' | 'AIRTEL'
  normalizedPhone: string
  label?: string | null
  ownerName?: string | null
  status: string
  isPrimary?: boolean
  verifiedAt?: string | null
}

type PayoutProfile = {
  profile: { secretConfigured: boolean; termsVersion: string }
  wallet?: { balanceUgx: number; currency: string } | null
  numbers: PayoutNumber[]
  changeRequests: Array<{
    id: string
    requestedNetwork: string
    requestedNormalizedPhone: string
    reason: string
    status: string
    createdAt: string
  }>
  recentWithdrawals: Array<{
    id: string
    reference: string
    network?: string | null
    destinationReference?: string | null
    amountUgx: number
    status: string
    providerReference?: string | null
    createdAt: string
  }>
  rules?: {
    minimumPayoutUgx?: number
    withdrawalFeeBasisPoints?: number
    withdrawalFlatFeeUgx?: number
    instantWithdrawalsEnabled?: boolean
    requireApprovalAboveAmountUgx?: number | null
    failedSecretAttemptsBeforeLock?: number
    withdrawalLockMinutes?: number
  }
  metrics?: {
    totalCollectedUgx: number
    totalFeesUgx: number
    agentCommissionUgx: number
    availableBalanceUgx: number
  } | null
}

type PanelAction = 'withdraw' | 'secret' | 'number' | 'change' | null

export default function VendorWithdrawalsPanel({ initialProfile }: { initialProfile: PayoutProfile | null }) {
  const [profile, setProfile] = useState(initialProfile)
  const [action, setAction] = useState<PanelAction>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [historyRange, setHistoryRange] = useState<'today' | 'yesterday' | 'last7' | 'month' | 'custom'>('last7')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const verifiedNumbers = profile?.numbers.filter((item) => item.status === 'VERIFIED') ?? []
  const primaryNumber = verifiedNumbers.find((item) => item.isPrimary) ?? verifiedNumbers[0] ?? null
  const availableUgx = profile?.metrics?.availableBalanceUgx ?? profile?.wallet?.balanceUgx ?? 0
  const feeBps = profile?.rules?.withdrawalFeeBasisPoints ?? 0
  const flatFeeUgx = profile?.rules?.withdrawalFlatFeeUgx ?? 0
  const minimumPayoutUgx = profile?.rules?.minimumPayoutUgx ?? 0

  const withdrawalMath = useMemo(() => {
    const amountUgx = Math.max(0, Number(withdrawAmount || 0))
    const percentageFeeUgx = Math.round((amountUgx * feeBps) / 10000)
    const feeAmountUgx = amountUgx > 0 ? percentageFeeUgx + flatFeeUgx : 0
    const totalDebitUgx = amountUgx + feeAmountUgx
    return {
      amountUgx,
      percentageFeeUgx,
      feeAmountUgx,
      totalDebitUgx,
      remainingUgx: availableUgx - totalDebitUgx,
      exceedsBalance: totalDebitUgx > availableUgx,
      belowMinimum: amountUgx > 0 && amountUgx < minimumPayoutUgx,
    }
  }, [availableUgx, feeBps, flatFeeUgx, minimumPayoutUgx, withdrawAmount])
  const filteredWithdrawals = useMemo(() => filterWithdrawals(profile?.recentWithdrawals ?? [], historyRange, customFrom, customTo), [profile?.recentWithdrawals, historyRange, customFrom, customTo])

  async function run(successMessage: string, callback: () => Promise<unknown>) {
    const activeAction = action ?? 'saving'
    setBusy(activeAction)
    setMessage('')
    setError('')
    setModalError('')
    setProgress(activeAction === 'withdraw' ? 'Validating payout number, wallet balance, and secret key.' : 'Saving changes.')
    try {
      await callback()
      setProgress('Refreshing live wallet and payout records.')
      const fresh = await clientFetchApi<PayoutProfile>('/wallets/payouts/profile/me')
      setProfile(fresh)
      setMessage(successMessage)
      setAction(null)
      setWithdrawAmount('')
    } catch (caught) {
      const failure = caught instanceof Error ? caught.message : 'Request failed'
      setError(failure)
      setModalError(failure)
    } finally {
      setBusy('')
      setProgress('')
    }
  }

  async function setSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run('Withdrawal secret updated.', () => clientPostApi('/wallets/payouts/secret', {
      currentPassword: form.get('currentPassword') || undefined,
      currentSecretKey: form.get('currentSecretKey') || undefined,
      secretKey: form.get('secretKey'),
    }))
    event.currentTarget.reset()
  }

  async function addNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run('Payout number submitted. It must be verified before it can receive withdrawals.', () =>
      clientPostApi('/wallets/payouts/numbers', {
        network: form.get('network'),
        phoneNumber: form.get('phoneNumber'),
        label: form.get('label'),
        ownerName: form.get('ownerName'),
      }),
    )
    event.currentTarget.reset()
  }

  async function requestChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run('Payout number change request submitted. Withdrawals are disabled until it is verified or approved.', () =>
      clientPostApi('/wallets/payouts/number-change-requests', {
        existingPayoutNumberId: form.get('existingPayoutNumberId') || undefined,
        network: form.get('network'),
        phoneNumber: form.get('phoneNumber'),
        reason: form.get('reason'),
      }),
    )
    event.currentTarget.reset()
  }

  async function withdraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (withdrawalMath.belowMinimum) {
      const failure = `Minimum withdrawal is ${formatCurrency(minimumPayoutUgx)}.`
      setError(failure)
      setModalError(failure)
      return
    }
    if (withdrawalMath.exceedsBalance) {
      const failure = 'Withdrawal amount plus charges is higher than the available wallet balance.'
      setError(failure)
      setModalError(failure)
      return
    }

    const form = new FormData(event.currentTarget)

    await run('Withdrawal sent successfully. If the provider later fails, your balance will be restored automatically.', () =>
      clientPostApi('/wallets/withdrawals', {
        amountUgx: withdrawalMath.amountUgx,
        secretKey: form.get('secretKey'),
        confirmPhoneInPossession: form.get('confirmPhoneInPossession') === 'on',
        acceptFinalTerms: form.get('acceptFinalTerms') === 'on',
      }, { timeoutMs: 45_000 }),
    )
    event.currentTarget.reset()
  }

  if (!profile) {
    return null
  }

  const pendingChange = profile.changeRequests.find((item) => ['PENDING', 'PENDING_VERIFICATION', 'PENDING_ADMIN_APPROVAL'].includes(item.status))
  const canWithdraw = profile.profile.secretConfigured && Boolean(primaryNumber) && !pendingChange
  const latestWithdrawal = profile.recentWithdrawals[0]
  const latestChange = profile.changeRequests[0]

  return (
    <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
      <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div>
          <span className="card-title">Vendor Wallet</span>
          <p style={{ marginTop: 6, color: 'var(--text-2)', fontSize: 13 }}>
            Withdrawals are instant only to your primary verified payout number and require the vendor secret key.
          </p>
        </div>
        <span className="badge badge-info">Registered numbers only</span>
      </div>

      {(message || error) && (
        <div style={{ padding: '16px 22px 0' }}>
          {message && <Notice tone="success" text={message} />}
          {error && <Notice tone="danger" text={error} />}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18, padding: 22 }}>
        <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 22, background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-2)', fontSize: 13, fontWeight: 700 }}>
                <Wallet size={18} /> Available balance
              </div>
              <div style={{ marginTop: 12, fontSize: 38, lineHeight: 1, color: 'var(--text-1)', fontWeight: 800 }}>
                {formatCurrency(availableUgx)}
              </div>
              <div style={{ marginTop: 10, color: 'var(--text-2)', fontSize: 13 }}>
                Wallet is debited immediately, then AROFi sends the payout through the configured provider.
              </div>
              {primaryNumber && (
                <div style={{ marginTop: 12, color: 'var(--text-1)', fontSize: 14, fontWeight: 800 }}>
                  Withdraw to: {primaryNumber.network} {maskPhone(primaryNumber.normalizedPhone)}
                </div>
              )}
              {pendingChange && (
                <Notice tone="danger" text="Payout number change pending. Withdrawals are disabled until verified or approved." />
              )}
              {profile?.metrics && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-2)' }}>Total Collected (Mobile Money)</span>
                    <strong style={{ color: 'var(--text-1)' }}>{formatCurrency(profile.metrics.totalCollectedUgx)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-2)' }}>Agent Commission</span>
                    <strong style={{ color: '#ef4444' }}>- {formatCurrency(profile.metrics.agentCommissionUgx)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-2)' }}>System Service Fee</span>
                    <strong style={{ color: '#ef4444' }}>- {formatCurrency(profile.metrics.totalFeesUgx)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '1px dashed var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span style={{ color: 'var(--text-1)', fontWeight: 700 }}>Available to Withdraw</span>
                    <strong style={{ color: '#10b981', fontWeight: 800 }}>{formatCurrency(profile.metrics.availableBalanceUgx)}</strong>
                  </div>
                </div>
              )}
            </div>
            {!canWithdraw && (
              <div style={{ marginTop: 10, marginBottom: 10, fontSize: 12, color: '#ef4444', display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(239, 68, 68, 0.08)', padding: '8px 12px', borderRadius: 6 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>
                  {!profile.profile.secretConfigured
                    ? 'Secret key not set. Configure it below to enable withdrawals.'
                    : !primaryNumber
                      ? 'No primary verified payout number. Register one below.'
                      : 'Payout number change is pending approval.'}
                </span>
              </div>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setAction('withdraw')} disabled={!canWithdraw}>
              Withdraw
            </button>
          </div>

          <div className="vendor-metrics-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 22 }}>
            <Metric label="Verified numbers" value={`${verifiedNumbers.length}/2`} />
            <Metric label="Secret key" value={profile.profile.secretConfigured ? 'Set' : 'Missing'} />
            <Metric label="Minimum payout" value={minimumPayoutUgx > 0 ? formatCurrency(minimumPayoutUgx) : 'None'} />
          </div>
        </section>

        <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 18, background: 'var(--bg-app)' }}>
          <div style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.08 }}>
            Setup actions
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <ActionButton icon={<KeyRound size={17} />} label={profile.profile.secretConfigured ? 'Change secret key' : 'Set secret key'} onClick={() => setAction('secret')} />
            <ActionButton icon={<Plus size={17} />} label="Register payout number" onClick={() => setAction('number')} disabled={verifiedNumbers.length >= 2} />
            <ActionButton icon={<RefreshCw size={17} />} label="Change payout number" onClick={() => setAction('change')} />
          </div>
          <div style={{ marginTop: 14, color: 'var(--text-2)', fontSize: 12, lineHeight: 1.6 }}>
            Withdrawals to a new number are disabled until verified or approved.
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 18, padding: '0 22px 22px' }}>
        <section className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Registered payout number</th>
                <th>Network</th>
                <th>Status</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {profile.numbers.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state" style={{ padding: 24 }}>
                      <p>No payout number registered yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {profile.numbers.map((number) => (
                <tr key={number.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-1)', fontWeight: 700 }}>{number.normalizedPhone}</td>
                  <td>{number.network === 'AIRTEL' ? 'Airtel' : 'MTN'}</td>
                  <td><span className={getStatusBadgeClass(number.status)}>{number.isPrimary ? 'primary ' : ''}{number.status.toLowerCase().replace(/_/g, ' ')}</span></td>
                  <td>{number.ownerName || number.label || 'Owner line'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 18, background: 'var(--bg-card)' }}>
          <div style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.08 }}>Recent activity</div>
          <Activity label="Last withdrawal" value={latestWithdrawal ? `${formatCurrency(latestWithdrawal.amountUgx)} - ${latestWithdrawal.status}${latestWithdrawal.providerReference ? ` - ${latestWithdrawal.providerReference}` : ''}` : 'None yet'} />
          <Activity label="Number change" value={latestChange ? `${latestChange.status} - ${formatDate(latestChange.createdAt)}` : 'No pending change'} />
        </section>
      </div>

      <section style={{ padding: '0 22px 22px' }}>
        <div className="card-header" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <span className="card-title">Withdrawal History</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['last7', 'Last 7 days'],
              ['month', 'This month'],
              ['custom', 'Custom range'],
            ].map(([value, label]) => (
              <button key={value} type="button" className={`btn btn-sm ${historyRange === value ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHistoryRange(value as typeof historyRange)}>{label}</button>
            ))}
          </div>
        </div>
        {historyRange === 'custom' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <input className="form-input" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} style={{ maxWidth: 180 }} />
            <input className="form-input" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} style={{ maxWidth: 180 }} />
          </div>
        )}
        <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Provider Ref</th>
              </tr>
            </thead>
            <tbody>
              {filteredWithdrawals.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state" style={{ padding: 24 }}><p>No withdrawals in this date range.</p></div></td></tr>
              )}
              {filteredWithdrawals.map((withdrawal) => (
                <tr key={withdrawal.id}>
                  <td>{formatDate(withdrawal.createdAt)}</td>
                  <td>{formatCurrency(withdrawal.amountUgx)}</td>
                  <td>{withdrawal.network ?? 'Mobile Money'} {withdrawal.destinationReference ? maskPhone(withdrawal.destinationReference) : ''}</td>
                  <td><span className={getStatusBadgeClass(withdrawal.status)}>{withdrawal.status.toLowerCase().replace(/_/g, ' ')}</span></td>
                  <td>{withdrawal.providerReference ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={Boolean(action)}
        onClose={() => setAction(null)}
        closeDisabled={Boolean(busy)}
        style={{ width: 'min(620px, 100%)' }}
        kicker={
          action === 'withdraw' ? 'Wallet withdrawal'
          : action === 'secret' ? 'Security'
          : action === 'number' ? 'Payout setup'
          : 'Approval required'
        }
        title={
          action === 'withdraw' ? 'Withdraw to registered number'
          : action === 'secret' ? (profile.profile.secretConfigured ? 'Change secret key' : 'Set secret key')
          : action === 'number' ? 'Register payout number'
          : 'Request payout number change'
        }
      >
            {action === 'withdraw' && (
              <form onSubmit={withdraw}>
                <div className="form-grid" style={{ marginTop: 22 }}>
                  <ReadOnlyLine label="Withdraw to" value={primaryNumber ? `${primaryNumber.network} ${maskPhone(primaryNumber.normalizedPhone)}` : 'No verified primary payout number'} />
                  <label className="form-group">
                    <span className="form-label">Amount to send</span>
                    <input
                      name="amountUgx"
                      type="number"
                      min={Math.max(1, minimumPayoutUgx)}
                      required
                      value={withdrawAmount}
                      onChange={(event) => setWithdrawAmount(event.target.value)}
                      placeholder="Amount UGX"
                      className="form-input"
                      disabled={busy === 'withdraw'}
                    />
                  </label>
                  <div className="form-span-2">
                    <MathBreakdown
                      amountUgx={withdrawalMath.amountUgx}
                      feeAmountUgx={withdrawalMath.feeAmountUgx}
                      totalDebitUgx={withdrawalMath.totalDebitUgx}
                      remainingUgx={withdrawalMath.remainingUgx}
                      exceedsBalance={withdrawalMath.exceedsBalance}
                      belowMinimum={withdrawalMath.belowMinimum}
                    />
                  </div>
                  <label className="form-group form-span-2">
                    <span className="form-label">Disbursement secret key</span>
                    <input name="secretKey" type="password" required placeholder="Required for every withdrawal" className="form-input" disabled={busy === 'withdraw'} />
                  </label>
                  <label className="check-card form-span-2">
                    <input name="confirmPhoneInPossession" type="checkbox" required disabled={busy === 'withdraw'} />
                    <span>I confirm I have this registered payout phone with me.</span>
                  </label>
                  <label className="check-card form-span-2">
                    <input name="acceptFinalTerms" type="checkbox" required disabled={busy === 'withdraw'} />
                    <span>I accept that after provider disbursement, this payout is final and cannot be reversed by AROFi.</span>
                  </label>
                  <div className="form-span-2">
                    <FormProcessStatus
                      busy={busy === 'withdraw'}
                      error={modalError}
                      text={progress || 'Sending withdrawal to the provider. This window closes after AROFi receives the API response.'}
                    />
                  </div>
                  <button className="btn btn-primary btn-block form-span-2" disabled={busy === 'withdraw' || !primaryNumber || withdrawalMath.exceedsBalance || withdrawalMath.belowMinimum}>
                    {busy === 'withdraw' ? 'Processing withdrawal...' : 'Withdraw'}
                  </button>
                </div>
              </form>
            )}

            {action === 'secret' && (
              <form onSubmit={setSecret}>
                <div className="form-grid" style={{ marginTop: 22 }}>
                  {profile.profile.secretConfigured && (
                    <label className="form-group">
                      <span className="form-label">Current secret key</span>
                      <input name="currentSecretKey" type="password" placeholder="Current withdrawal secret or use password below" className="form-input" disabled={busy === 'secret'} />
                    </label>
                  )}
                  <label className="form-group">
                    <span className="form-label">Current account password</span>
                    <input name="currentPassword" type="password" placeholder="Current account password" className="form-input" disabled={busy === 'secret'} />
                  </label>
                  <label className="form-group form-span-2">
                    <span className="form-label">New secret key</span>
                    <input name="secretKey" type="password" minLength={8} required placeholder="At least 8 characters" className="form-input" disabled={busy === 'secret'} />
                  </label>
                  <div className="form-span-2">
                    <FormProcessStatus busy={busy === 'secret'} error={modalError} text={progress || 'Saving secret key and refreshing profile.'} />
                  </div>
                  <button className="btn btn-primary btn-block form-span-2" disabled={busy === 'secret'}>{busy === 'secret' ? 'Saving secret key...' : 'Save secret key'}</button>
                </div>
              </form>
            )}

            {action === 'number' && (
              <form onSubmit={addNumber}>
                <div className="form-grid" style={{ marginTop: 22 }}>
                  <label className="form-group">
                    <span className="form-label">Network</span>
                    <select name="network" className="form-input" required disabled={busy === 'number'}>
                      <option value="MTN">MTN</option>
                      <option value="AIRTEL">Airtel</option>
                    </select>
                  </label>
                  <label className="form-group">
                    <span className="form-label">Phone number</span>
                    <input name="phoneNumber" required placeholder="0771234567" className="form-input" disabled={busy === 'number'} />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Label</span>
                    <input name="label" placeholder="Owner or business line" className="form-input" disabled={busy === 'number'} />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Owner name</span>
                    <input name="ownerName" placeholder="Registered owner name" className="form-input" disabled={busy === 'number'} />
                  </label>
                  <div className="form-span-2">
                    <FormProcessStatus busy={busy === 'number'} error={modalError} text={progress || 'Registering payout number and refreshing profile.'} />
                  </div>
                  <button className="btn btn-primary btn-block form-span-2" disabled={busy === 'number' || verifiedNumbers.length >= 2}>
                    {busy === 'number' ? 'Submitting number...' : 'Submit number for verification'}
                  </button>
                </div>
              </form>
            )}

            {action === 'change' && (
              <form onSubmit={requestChange}>
                <div className="form-grid" style={{ marginTop: 22 }}>
                  <label className="form-group">
                    <span className="form-label">Existing number</span>
                    <select name="existingPayoutNumberId" className="form-input" disabled={busy === 'change'}>
                      <option value="">Add or replace payout number</option>
                      {verifiedNumbers.map((number) => (
                        <option key={number.id} value={number.id}>{number.network} - {number.normalizedPhone}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-group">
                    <span className="form-label">New network</span>
                    <select name="network" className="form-input" required disabled={busy === 'change'}>
                      <option value="MTN">MTN</option>
                      <option value="AIRTEL">Airtel</option>
                    </select>
                  </label>
                  <label className="form-group form-span-2">
                    <span className="form-label">New phone number</span>
                    <input name="phoneNumber" required placeholder="New phone number" className="form-input" disabled={busy === 'change'} />
                  </label>
                  <label className="form-group form-span-2">
                    <span className="form-label">Reason</span>
                    <textarea name="reason" required minLength={10} placeholder="Explain why this payout number should change" className="form-input" rows={4} disabled={busy === 'change'} />
                  </label>
                  <div className="form-span-2">
                    <Notice tone="danger" text="Withdrawals to this new number will be disabled until verified or approved." />
                  </div>
                  <div className="form-span-2">
                    <FormProcessStatus busy={busy === 'change'} error={modalError} text={progress || 'Submitting number change request for approval.'} />
                  </div>
                  <button className="btn btn-primary btn-block form-span-2" disabled={busy === 'change'}>
                    {busy === 'change' ? 'Submitting request...' : 'Submit request'}
                  </button>
                </div>
              </form>
            )}
      </Modal>
    </div>
  )
}

function Notice({ tone, text }: { tone: 'success' | 'danger'; text: string }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertTriangle
  return (
    <div className={`badge badge-${tone}`} style={{ display: 'flex', gap: 8, alignItems: 'center', width: 'fit-content', padding: '8px 10px' }}>
      <Icon size={15} />
      {text}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg-app)' }}>
      <div style={{ color: 'var(--text-2)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.08 }}>{label}</div>
      <div style={{ marginTop: 8, color: 'var(--text-1)', fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  )
}

function ActionButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn btn-ghost" onClick={onClick} disabled={disabled} style={{ justifyContent: 'flex-start', padding: '11px 12px' }}>
      {icon}
      {label}
    </button>
  )
}

function Activity({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14 }}>
      <ShieldCheck size={16} color="var(--green)" />
      <div>
        <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{label}</div>
        <div style={{ color: 'var(--text-1)', fontSize: 13, fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  )
}

function ReadOnlyLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg-app)' }}>
      <div style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 6, color: 'var(--text-1)', fontSize: 15, fontWeight: 900 }}>{value}</div>
    </div>
  )
}

function maskPhone(phone: string) {
  if (phone.length <= 6) return phone
  return `${phone.slice(0, 3)}xxxx${phone.slice(-3)}`
}

function filterWithdrawals(items: PayoutProfile['recentWithdrawals'], range: 'today' | 'yesterday' | 'last7' | 'month' | 'custom', customFrom: string, customTo: string) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let from = new Date(startOfToday)
  let to = new Date(now)
  if (range === 'yesterday') {
    from = new Date(startOfToday)
    from.setDate(from.getDate() - 1)
    to = new Date(startOfToday)
  } else if (range === 'last7') {
    from = new Date(startOfToday)
    from.setDate(from.getDate() - 6)
  } else if (range === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (range === 'custom') {
    from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(0)
    to = customTo ? new Date(`${customTo}T23:59:59`) : new Date(8640000000000000)
  }
  return items.filter((item) => {
    const created = new Date(item.createdAt)
    return created >= from && created <= to
  })
}

function MathBreakdown({
  amountUgx,
  feeAmountUgx,
  totalDebitUgx,
  remainingUgx,
  exceedsBalance,
  belowMinimum,
}: {
  amountUgx: number
  feeAmountUgx: number
  totalDebitUgx: number
  remainingUgx: number
  exceedsBalance: boolean
  belowMinimum: boolean
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-app)' }}>
      <div style={mathRowStyle}><span>Payout to phone</span><strong>{formatCurrency(amountUgx)}</strong></div>
      <div style={mathRowStyle}><span>Withdrawal charges</span><strong>{formatCurrency(feeAmountUgx)}</strong></div>
      <div style={{ ...mathRowStyle, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>
        <span>Total deducted from wallet</span><strong>{formatCurrency(totalDebitUgx)}</strong>
      </div>
      <div style={{ ...mathRowStyle, color: exceedsBalance ? 'var(--danger-fg)' : 'var(--text-2)' }}>
        <span>Balance after withdrawal</span><strong>{formatCurrency(remainingUgx)}</strong>
      </div>
      {exceedsBalance && <div style={{ color: 'var(--danger-fg)', fontSize: 12, marginTop: 8 }}>Amount plus charges exceeds available balance.</div>}
      {belowMinimum && <div style={{ color: 'var(--danger-fg)', fontSize: 12, marginTop: 8 }}>Amount is below the configured minimum payout.</div>}
    </div>
  )
}

const mathRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  color: 'var(--text-2)',
  fontSize: 13,
  marginTop: 8,
}

