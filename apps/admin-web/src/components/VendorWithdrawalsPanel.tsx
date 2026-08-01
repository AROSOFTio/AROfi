'use client'

import { useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  KeyRound,
  MoreVertical,
  Plus,
  Send,
  Settings,
  Star,
} from 'lucide-react'
import FormProcessStatus from '@/components/FormProcessStatus'
import { Modal } from '@/components/Modal'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'
import { PhoneNumberField } from '@/components/PhoneNumberField'

function formatAmountInput(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

function parseAmountInput(value: string) {
  return Number(value.replace(/\D/g, '') || 0)
}

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
    maxActiveNumbers?: number
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
    walletBalanceUgx?: number
    earnedBalanceUgx?: number
    alreadyWithdrawnUgx?: number
    pendingWithdrawalsUgx?: number
  } | null
}

type PanelAction = 'secret' | 'number' | 'change' | 'withdraw' | null

export default function VendorWithdrawalsPanel({ initialProfile }: { initialProfile: PayoutProfile | null }) {
  const [profile, setProfile] = useState(initialProfile)
  const [action, setAction] = useState<PanelAction>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [selectedPayoutNumberId, setSelectedPayoutNumberId] = useState('')
  const [confirmedPhone, setConfirmedPhone] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [historyRange, setHistoryRange] = useState<'today' | 'yesterday' | 'last7' | 'month' | 'custom'>('last7')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const verifiedNumbers = profile?.numbers.filter((item) => item.status === 'VERIFIED') ?? []
  const primaryNumber = verifiedNumbers.find((item) => item.isPrimary) ?? verifiedNumbers[0] ?? null
  const selectedNumber = verifiedNumbers.find((item) => item.id === selectedPayoutNumberId) ?? primaryNumber
  const mtnNumbers = profile?.numbers.filter((item) => item.network === 'MTN') ?? []
  const airtelNumbers = profile?.numbers.filter((item) => item.network === 'AIRTEL') ?? []
  const availableUgx = profile?.metrics?.availableBalanceUgx ?? profile?.wallet?.balanceUgx ?? 0
  const walletBalanceUgx = profile?.metrics?.walletBalanceUgx ?? profile?.wallet?.balanceUgx ?? availableUgx
  const pendingWithdrawalsUgx = profile?.metrics?.pendingWithdrawalsUgx ?? 0
  const alreadyWithdrawnUgx = profile?.metrics?.alreadyWithdrawnUgx ?? 0
  const feeBps = profile?.rules?.withdrawalFeeBasisPoints ?? 0
  const flatFeeUgx = profile?.rules?.withdrawalFlatFeeUgx ?? 0
  const minimumPayoutUgx = profile?.rules?.minimumPayoutUgx ?? 0

  const withdrawalMath = useMemo(() => {
    const amountUgx = Math.max(0, parseAmountInput(withdrawAmount))
    const percentageFeeUgx = Math.round((amountUgx * feeBps) / 10000)
    const feeAmountUgx = amountUgx > 0 ? percentageFeeUgx + flatFeeUgx : 0
    const totalDebitUgx = amountUgx + feeAmountUgx
    return {
      amountUgx,
      percentageFeeUgx,
      feeAmountUgx,
      totalDebitUgx,
      receiveUgx: amountUgx,
      remainingUgx: availableUgx - totalDebitUgx,
      exceedsBalance: totalDebitUgx > availableUgx,
      belowMinimum: amountUgx > 0 && amountUgx < minimumPayoutUgx,
    }
  }, [availableUgx, feeBps, flatFeeUgx, minimumPayoutUgx, withdrawAmount])

  const filteredWithdrawals = useMemo(
    () => filterWithdrawals(profile?.recentWithdrawals ?? [], historyRange, customFrom, customTo),
    [profile?.recentWithdrawals, historyRange, customFrom, customTo],
  )

  if (!profile) {
    return null
  }

  const pendingChange = profile.changeRequests.find((item) =>
    ['PENDING', 'PENDING_VERIFICATION', 'PENDING_ADMIN_APPROVAL'].includes(item.status),
  )
  const selectedIsPrimary = Boolean(selectedNumber && primaryNumber && selectedNumber.id === primaryNumber.id)
  const canWithdraw = profile.profile.secretConfigured && Boolean(primaryNumber) && !pendingChange
  const canSubmitWithdrawal =
    canWithdraw &&
    selectedIsPrimary &&
    withdrawalMath.amountUgx > 0 &&
    !withdrawalMath.exceedsBalance &&
    !withdrawalMath.belowMinimum &&
    Boolean(secretKey.trim()) &&
    confirmedPhone &&
    acceptedTerms

  async function refreshProfile() {
    const fresh = await clientFetchApi<PayoutProfile>('/wallets/payouts/profile/me')
    setProfile(fresh)
    return fresh
  }

  async function run(successMessage: string, activeAction: string, callback: () => Promise<unknown>) {
    setBusy(activeAction)
    setMessage('')
    setError('')
    setModalError('')
    setProgress(activeAction === 'withdraw' ? 'Checking payout number, wallet balance, and withdrawal code.' : 'Saving changes.')
    try {
      await callback()
      setProgress('Refreshing live wallet and payout records.')
      await refreshProfile()
      setMessage(successMessage)
      setAction(null)
      if (activeAction === 'withdraw') {
        setWithdrawAmount('')
        setSecretKey('')
        setConfirmedPhone(false)
        setAcceptedTerms(false)
      }
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
    await run('Withdrawal secret updated.', 'secret', () =>
      clientPostApi('/wallets/payouts/secret', {
        currentPassword: form.get('currentPassword') || undefined,
        currentSecretKey: form.get('currentSecretKey') || undefined,
        secretKey: form.get('secretKey'),
      }),
    )
    event.currentTarget.reset()
  }

  async function addNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run('Payout number submitted. It must be verified before it can receive withdrawals.', 'number', () =>
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
    await run('Payout number change request submitted. Withdrawals are disabled until it is verified or approved.', 'change', () =>
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
    if (!selectedNumber) {
      setModalError('Select a verified payout number before withdrawing.')
      return
    }
    if (!selectedIsPrimary) {
      setModalError('Withdrawals currently go only to the primary verified payout number.')
      return
    }
    if (withdrawalMath.belowMinimum) {
      setModalError(`Minimum withdrawal is ${formatCurrency(minimumPayoutUgx)}.`)
      return
    }
    if (withdrawalMath.exceedsBalance) {
      setModalError('Withdrawal amount plus charges is higher than the available wallet balance.')
      return
    }

    await run('Withdrawal started. The wallet balance has refreshed.', 'withdraw', () =>
      clientPostApi(
        '/wallets/withdrawals',
        {
          payoutNumberId: selectedNumber.id,
          amountUgx: withdrawalMath.amountUgx,
          secretKey,
          confirmPhoneInPossession: confirmedPhone,
          acceptFinalTerms: acceptedTerms,
        },
        { timeoutMs: 45_000 },
      ),
    )
  }

  return (
    <div className="withdraw-workspace">
      {(message || error) && (
        <div className="withdraw-alert-row">
          {message && <Notice tone="success" text={message} />}
          {error && <Notice tone="danger" text={error} />}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card vibrant">
          <div className="stat-label">Available Balance</div>
          <div className="stat-value vibrant">{formatCurrency(availableUgx)}</div>
          <div className="stat-change">Ready to withdraw now</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Wallet Balance</div>
          <div className="stat-value">{formatCurrency(walletBalanceUgx)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Withdrawals</div>
          <div className="stat-value">{formatCurrency(pendingWithdrawalsUgx)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Already Withdrawn</div>
          <div className="stat-value">{formatCurrency(alreadyWithdrawnUgx)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Payout Numbers</span>
          <div className="withdraw-head-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAction('withdraw')} disabled={!canWithdraw}>
              <Send size={14} /> Withdraw
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setAction('number')}
              disabled={(profile.rules?.maxActiveNumbers ?? 2) <= profile.numbers.length}
            >
              <Plus size={14} /> Add Number
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAction('change')}>
              <Settings size={14} /> Manage
            </button>
          </div>
        </div>
        <div className="withdraw-card-body">
          {!canWithdraw && (
            <p className="field-hint">{withdrawBlockedReason(profile, primaryNumber, pendingChange)}</p>
          )}
          <div className="payout-columns">
            <PayoutColumn network="MTN" numbers={mtnNumbers} selectedId={selectedNumber?.id} onSelect={setSelectedPayoutNumberId} />
            <PayoutColumn network="AIRTEL" numbers={airtelNumbers} selectedId={selectedNumber?.id} onSelect={setSelectedPayoutNumberId} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Withdrawal Secret</span>
          <span className={`badge ${profile.profile.secretConfigured ? 'badge-success' : 'badge-warning'}`}>
            {profile.profile.secretConfigured ? 'Active' : 'Not set'}
          </span>
        </div>
        <div className="withdraw-card-body secret-row">
          <p>Required every time you withdraw funds.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAction('secret')}>
            <KeyRound size={14} /> {profile.profile.secretConfigured ? 'Change Secret' : 'Set Secret'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Withdrawals</span>
          <HistoryFilters
            value={historyRange}
            onChange={setHistoryRange}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFrom={setCustomFrom}
            onCustomTo={setCustomTo}
          />
        </div>
        <div className="table-wrap clean-withdraw-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Network</th>
                <th>Number</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredWithdrawals.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state" style={{ padding: 24 }}>
                      <p>No withdrawals in this date range.</p>
                    </div>
                  </td>
                </tr>
              )}
              {filteredWithdrawals.map((withdrawal) => (
                <tr key={withdrawal.id}>
                  <td>{formatDate(withdrawal.createdAt)}</td>
                  <td>{formatCurrency(withdrawal.amountUgx)}</td>
                  <td><NetworkMark network={withdrawal.network} compact /> {networkLabel(withdrawal.network)}</td>
                  <td>{withdrawal.destinationReference ? maskPhone(withdrawal.destinationReference) : '-'}</td>
                  <td><span className={getStatusBadgeClass(withdrawal.status)}>{humanize(withdrawal.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WithdrawModal
        open={action === 'withdraw'}
        busy={busy === 'withdraw'}
        modalError={modalError}
        progress={progress}
        onClose={() => setAction(null)}
        onSubmit={withdraw}
        availableUgx={availableUgx}
        minimumPayoutUgx={minimumPayoutUgx}
        withdrawAmount={withdrawAmount}
        onWithdrawAmount={setWithdrawAmount}
        verifiedNumbers={verifiedNumbers}
        selectedNumber={selectedNumber}
        onSelectNumber={setSelectedPayoutNumberId}
        selectedIsPrimary={selectedIsPrimary}
        secretConfigured={profile.profile.secretConfigured}
        secretKey={secretKey}
        onSecretKey={setSecretKey}
        onSetSecret={() => setAction('secret')}
        withdrawalMath={withdrawalMath}
        confirmedPhone={confirmedPhone}
        onConfirmedPhone={setConfirmedPhone}
        acceptedTerms={acceptedTerms}
        onAcceptedTerms={setAcceptedTerms}
        canSubmit={canSubmitWithdrawal}
        blockedReason={!canWithdraw ? withdrawBlockedReason(profile, primaryNumber, pendingChange) : ''}
      />

      <SetupModal
        action={action === 'withdraw' ? null : action}
        profile={profile}
        verifiedNumbers={verifiedNumbers}
        busy={busy}
        modalError={modalError}
        progress={progress}
        onClose={() => setAction(null)}
        onSecret={setSecret}
        onAddNumber={addNumber}
        onChangeNumber={requestChange}
      />
    </div>
  )
}

function WithdrawModal({
  open,
  busy,
  modalError,
  progress,
  onClose,
  onSubmit,
  availableUgx,
  minimumPayoutUgx,
  withdrawAmount,
  onWithdrawAmount,
  verifiedNumbers,
  selectedNumber,
  onSelectNumber,
  selectedIsPrimary,
  secretConfigured,
  secretKey,
  onSecretKey,
  onSetSecret,
  withdrawalMath,
  confirmedPhone,
  onConfirmedPhone,
  acceptedTerms,
  onAcceptedTerms,
  canSubmit,
  blockedReason,
}: {
  open: boolean
  busy: boolean
  modalError: string
  progress: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  availableUgx: number
  minimumPayoutUgx: number
  withdrawAmount: string
  onWithdrawAmount: (value: string) => void
  verifiedNumbers: PayoutNumber[]
  selectedNumber: PayoutNumber | null
  onSelectNumber: (id: string) => void
  selectedIsPrimary: boolean
  secretConfigured: boolean
  secretKey: string
  onSecretKey: (value: string) => void
  onSetSecret: () => void
  withdrawalMath: { amountUgx: number; feeAmountUgx: number; receiveUgx: number }
  confirmedPhone: boolean
  onConfirmedPhone: (value: boolean) => void
  acceptedTerms: boolean
  onAcceptedTerms: (value: boolean) => void
  canSubmit: boolean
  blockedReason: string
}) {
  return (
    <Modal open={open} onClose={onClose} closeDisabled={busy} style={{ width: 'min(560px, 100%)' }} kicker="Withdraw" title="Withdraw Funds">
      <p className="field-hint" style={{ marginTop: 8 }}>Available balance: {formatCurrency(availableUgx)}</p>
      <form onSubmit={onSubmit} className="withdraw-step-form" style={{ marginTop: 18 }}>
        <label className="form-group">
          <span className="form-label">Amount to withdraw</span>
          <input
            className="form-input amount-input"
            type="text"
            name="withdrawAmountUgx"
            value={withdrawAmount}
            onChange={(event) => onWithdrawAmount(formatAmountInput(event.target.value))}
            placeholder="Enter amount in UGX"
            autoComplete="off"
            inputMode="numeric"
            disabled={busy}
            required
          />
        </label>
        {minimumPayoutUgx > 0 && <p className="field-hint">Minimum withdrawal is {formatCurrency(minimumPayoutUgx)}.</p>}

        <div className="form-group">
          <span className="form-label">Destination number</span>
          <div className="destination-list">
            {verifiedNumbers.length === 0 && (
              <div className="destination-empty">No verified payout number yet. Add a number first.</div>
            )}
            {verifiedNumbers.map((number) => {
              const active = selectedNumber?.id === number.id
              return (
                <button
                  key={number.id}
                  type="button"
                  className={`destination-option ${active ? 'active' : ''}`}
                  onClick={() => onSelectNumber(number.id)}
                >
                  <NetworkMark network={number.network} />
                  <span className="destination-phone">{formatPhone(number.normalizedPhone)}</span>
                  {number.isPrimary && <span className="mini-badge blue">Default</span>}
                  <Check size={18} className="destination-check" />
                </button>
              )
            })}
          </div>
          {selectedNumber && !selectedIsPrimary && (
            <p className="field-hint danger">Withdrawals currently go only to the primary verified number.</p>
          )}
        </div>

        <label className="form-group">
        <span className="form-label">Withdrawal code</span>
          <input
            className="form-input"
            type="password"
            value={secretKey}
            onChange={(event) => onSecretKey(event.target.value)}
            placeholder="Enter your withdrawal code"
            disabled={busy}
            required
          />
          {!secretConfigured && (
            <button type="button" className="link-button" style={{ marginTop: 6 }} onClick={onSetSecret}>Set withdrawal code</button>
          )}
        </label>

        <div className="withdraw-summary-box">
          <SummaryRow label="Amount" value={formatCurrency(withdrawalMath.amountUgx)} />
          <SummaryRow label="Fee" value={formatCurrency(withdrawalMath.feeAmountUgx)} />
          <div className="summary-total">
            <span>You Receive</span>
            <strong>{formatCurrency(withdrawalMath.receiveUgx)}</strong>
          </div>
        </div>

        <label className="withdraw-check">
          <input type="checkbox" checked={confirmedPhone} onChange={(event) => onConfirmedPhone(event.target.checked)} disabled={busy} />
          <span>I have this registered payout phone with me.</span>
        </label>
        <label className="withdraw-check">
          <input type="checkbox" checked={acceptedTerms} onChange={(event) => onAcceptedTerms(event.target.checked)} disabled={busy} />
          <span>I accept the final withdrawal terms.</span>
        </label>

        {blockedReason && <div className="inline-warning">{blockedReason}</div>}

        <FormProcessStatus busy={busy} error={modalError} text={progress || 'Withdrawals are checked against your live wallet balance before payout.'} />

        <div className="withdraw-action-row">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary withdraw-submit" disabled={busy || !canSubmit}>
            <Send size={18} /> {busy ? 'Withdrawing...' : 'Withdraw Now'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function SetupModal({
  action,
  profile,
  verifiedNumbers,
  busy,
  modalError,
  progress,
  onClose,
  onSecret,
  onAddNumber,
  onChangeNumber,
}: {
  action: PanelAction
  profile: PayoutProfile
  verifiedNumbers: PayoutNumber[]
  busy: string
  modalError: string
  progress: string
  onClose: () => void
  onSecret: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onAddNumber: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onChangeNumber: (event: FormEvent<HTMLFormElement>) => Promise<void>
}) {
  return (
    <Modal
      open={Boolean(action)}
      onClose={onClose}
      closeDisabled={Boolean(busy)}
      style={{ width: 'min(620px, 100%)' }}
      kicker={action === 'secret' ? 'Security' : action === 'number' ? 'Payout setup' : 'Approval required'}
      title={
        action === 'secret'
          ? profile.profile.secretConfigured ? 'Change withdrawal code' : 'Set withdrawal code'
          : action === 'number'
            ? 'Register payout number'
            : 'Request payout number change'
      }
    >
      {action === 'secret' && (
        <form onSubmit={onSecret}>
          <div className="form-grid" style={{ marginTop: 22 }}>
            {profile.profile.secretConfigured && (
              <label className="form-group">
                <span className="form-label">Current withdrawal code</span>
                <input name="currentSecretKey" type="password" placeholder="Current withdrawal secret or use password below" className="form-input" disabled={busy === 'secret'} />
              </label>
            )}
            <label className="form-group">
              <span className="form-label">Current account password</span>
              <input name="currentPassword" type="password" placeholder="Current account password" className="form-input" disabled={busy === 'secret'} />
            </label>
            <label className="form-group form-span-2">
              <span className="form-label">New withdrawal code</span>
              <input name="secretKey" type="password" minLength={8} required placeholder="At least 8 characters" className="form-input" disabled={busy === 'secret'} />
            </label>
            <div className="form-span-2">
              <FormProcessStatus busy={busy === 'secret'} error={modalError} text={progress || 'Saving withdrawal code and refreshing profile.'} />
            </div>
            <button className="btn btn-primary btn-block form-span-2" disabled={busy === 'secret'}>{busy === 'secret' ? 'Saving withdrawal code...' : 'Save withdrawal code'}</button>
          </div>
        </form>
      )}

      {action === 'number' && (
        <form onSubmit={onAddNumber}>
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
              <PhoneNumberField name="phoneNumber" required disabled={busy === 'number'} ugandaOnly mobileOnly />
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
            <button className="btn btn-primary btn-block form-span-2" disabled={busy === 'number' || (profile.rules?.maxActiveNumbers ?? 2) <= profile.numbers.length}>
              {busy === 'number' ? 'Submitting number...' : 'Submit number for verification'}
            </button>
          </div>
        </form>
      )}

      {action === 'change' && (
        <form onSubmit={onChangeNumber}>
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
              <PhoneNumberField name="phoneNumber" required disabled={busy === 'change'} ugandaOnly mobileOnly />
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
  )
}

function PayoutColumn({
  network,
  numbers,
  selectedId,
  onSelect,
}: {
  network: 'MTN' | 'AIRTEL'
  numbers: PayoutNumber[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="payout-column">
      <div className="payout-column-title"><NetworkMark network={network} /> {network === 'MTN' ? 'MTN Mobile Money' : 'Airtel Money'}</div>
      {numbers.length === 0 && <div className="payout-empty">No {network === 'MTN' ? 'MTN' : 'Airtel'} number registered.</div>}
      {numbers.map((number) => {
        const verified = number.status === 'VERIFIED'
        return (
          <button
            type="button"
            key={number.id}
            className={`payout-row ${selectedId === number.id ? 'selected' : ''}`}
            onClick={() => verified && onSelect(number.id)}
            disabled={!verified}
          >
            <span>{formatPhone(number.normalizedPhone)}</span>
            {number.isPrimary && <span className="mini-badge blue">Default</span>}
            <span className={`mini-badge ${verified ? 'green' : 'amber'}`}>{verified ? 'Approved' : humanize(number.status)}</span>
            {number.isPrimary ? <Star size={16} className="primary-star" /> : <MoreVertical size={16} className="muted-icon" />}
          </button>
        )
      })}
    </div>
  )
}

function HistoryFilters({
  value,
  onChange,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
}: {
  value: 'today' | 'yesterday' | 'last7' | 'month' | 'custom'
  onChange: (value: 'today' | 'yesterday' | 'last7' | 'month' | 'custom') => void
  customFrom: string
  customTo: string
  onCustomFrom: (value: string) => void
  onCustomTo: (value: string) => void
}) {
  return (
    <div className="history-filter-wrap">
      <select className="form-input history-select" value={value} onChange={(event) => onChange(event.target.value as typeof value)}>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="last7">Last 7 days</option>
        <option value="month">This month</option>
        <option value="custom">Custom range</option>
      </select>
      {value === 'custom' && (
        <div className="history-custom-fields">
          <input className="form-input" type="date" value={customFrom} onChange={(event) => onCustomFrom(event.target.value)} />
          <input className="form-input" type="date" value={customTo} onChange={(event) => onCustomTo(event.target.value)} />
        </div>
      )}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
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

function NetworkMark({ network, compact = false }: { network?: string | null; compact?: boolean }) {
  const normalized = network === 'AIRTEL' ? 'AIRTEL' : 'MTN'
  return (
    <span className={`network-mark ${normalized === 'AIRTEL' ? 'airtel' : 'mtn'} ${compact ? 'compact' : ''}`}>
      {normalized === 'AIRTEL' ? 'airtel' : 'MTN'}
    </span>
  )
}

function maskPhone(phone: string) {
  if (phone.length <= 6) return phone
  return `${phone.slice(0, 3)}xxxx${phone.slice(-3)}`
}

function formatPhone(phone: string) {
  const clean = phone.replace(/\D/g, '')
  const local = clean.startsWith('256') ? `0${clean.slice(3)}` : clean
  if (local.length === 10) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }
  return phone
}

function networkLabel(network?: string | null) {
  return network === 'AIRTEL' ? 'Airtel Money' : network === 'MTN' ? 'MTN Mobile Money' : 'Mobile Money'
}

function humanize(status: string) {
  return status.toLowerCase().replace(/_/g, ' ')
}

function withdrawBlockedReason(
  profile: PayoutProfile,
  primaryNumber: PayoutNumber | null,
  pendingChange: PayoutProfile['changeRequests'][number] | undefined,
) {
  if (!profile.profile.secretConfigured) return 'Set a withdrawal secret code before withdrawing.'
  if (!primaryNumber) return 'Register a verified primary payout number before withdrawing.'
  if (pendingChange) return 'A payout number change is pending; withdrawals are blocked.'
  return ''
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
