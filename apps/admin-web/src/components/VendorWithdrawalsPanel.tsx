'use client'

import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, KeyRound, Plus, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'

type PayoutNumber = {
  id: string
  network: 'MTN' | 'AIRTEL'
  normalizedPhone: string
  label?: string | null
  status: string
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
    createdAt: string
  }>
  rules?: {
    minimumPayoutUgx?: number
    withdrawalFeeBasisPoints?: number
    withdrawalFlatFeeUgx?: number
  }
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

  const activeNumbers = profile?.numbers.filter((item) => item.status === 'ACTIVE') ?? []
  const availableUgx = profile?.wallet?.balanceUgx ?? 0
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
    await run('Disbursement secret updated.', () => clientPostApi('/wallets/payouts/secret', { secretKey: form.get('secretKey') }))
    event.currentTarget.reset()
  }

  async function addNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run('Payout number registered.', () =>
      clientPostApi('/wallets/payouts/numbers', {
        network: form.get('network'),
        phoneNumber: form.get('phoneNumber'),
        label: form.get('label'),
      }),
    )
    event.currentTarget.reset()
  }

  async function requestChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run('Payout number change request submitted.', () =>
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
    await run('Withdrawal submitted. The wallet balance has been deducted and provider payout is processing.', () =>
      clientPostApi('/wallets/withdrawals', {
        payoutNumberId: form.get('payoutNumberId'),
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

  const canWithdraw = profile.profile.secretConfigured && activeNumbers.length > 0 && availableUgx > 0
  const latestWithdrawal = profile.recentWithdrawals[0]
  const latestChange = profile.changeRequests[0]

  return (
    <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
      <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div>
          <span className="card-title">Vendor Wallet</span>
          <p style={{ marginTop: 6, color: 'var(--text-2)', fontSize: 13 }}>
            Withdrawals are paid only to registered numbers and require the vendor secret key.
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.15fr) minmax(320px, 0.85fr)', gap: 18, padding: 22 }}>
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
                Wallet is debited automatically after the provider accepts the payout request.
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setAction('withdraw')} disabled={!canWithdraw}>
              Withdraw
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 22 }}>
            <Metric label="Payout numbers" value={`${activeNumbers.length}/2`} />
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
            <ActionButton icon={<Plus size={17} />} label="Register payout number" onClick={() => setAction('number')} disabled={activeNumbers.length >= 2} />
            <ActionButton icon={<RefreshCw size={17} />} label="Request number change" onClick={() => setAction('change')} />
          </div>
          <div style={{ marginTop: 14, color: 'var(--text-2)', fontSize: 12, lineHeight: 1.6 }}>
            A number change is an application request. It does not replace an active payout number until approved.
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.42fr)', gap: 18, padding: '0 22px 22px' }}>
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
              {activeNumbers.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state" style={{ padding: 24 }}>
                      <p>No payout number registered yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {activeNumbers.map((number) => (
                <tr key={number.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-1)', fontWeight: 700 }}>{number.normalizedPhone}</td>
                  <td>{number.network === 'AIRTEL' ? 'Airtel' : 'MTN'}</td>
                  <td><span className={getStatusBadgeClass(number.status)}>{number.status.toLowerCase()}</span></td>
                  <td>{number.label || 'Owner line'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 18, background: 'var(--bg-card)' }}>
          <div style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.08 }}>Recent activity</div>
          <Activity label="Last withdrawal" value={latestWithdrawal ? `${formatCurrency(latestWithdrawal.amountUgx)} - ${latestWithdrawal.status}` : 'None yet'} />
          <Activity label="Number change" value={latestChange ? `${latestChange.status} - ${formatDate(latestChange.createdAt)}` : 'No pending change'} />
        </section>
      </div>

      {action && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !busy && setAction(null)}>
          <div className="modal-card" style={{ width: 'min(620px, 100%)' }} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setAction(null)} disabled={Boolean(busy)}>Close</button>
            {action === 'withdraw' && (
              <form onSubmit={withdraw}>
                <div className="modal-kicker">Wallet withdrawal</div>
                <h2 className="modal-title">Withdraw to registered number</h2>
                <FormGrid>
                  <Field label="Payout number">
                    <select name="payoutNumberId" className="form-input" required disabled={busy === 'withdraw'}>
                      <option value="">Choose registered number</option>
                      {activeNumbers.map((number) => (
                        <option key={number.id} value={number.id}>{number.network} - {number.normalizedPhone}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amount to send">
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
                  </Field>
                  <MathBreakdown
                    amountUgx={withdrawalMath.amountUgx}
                    feeAmountUgx={withdrawalMath.feeAmountUgx}
                    totalDebitUgx={withdrawalMath.totalDebitUgx}
                    remainingUgx={withdrawalMath.remainingUgx}
                    exceedsBalance={withdrawalMath.exceedsBalance}
                    belowMinimum={withdrawalMath.belowMinimum}
                  />
                  <Field label="Disbursement secret key">
                    <input name="secretKey" type="password" required placeholder="Required for every withdrawal" className="form-input" disabled={busy === 'withdraw'} />
                  </Field>
                  <label style={checkRowStyle}>
                    <input name="confirmPhoneInPossession" type="checkbox" required disabled={busy === 'withdraw'} />
                    <span>I confirm I have this registered payout phone with me.</span>
                  </label>
                  <label style={checkRowStyle}>
                    <input name="acceptFinalTerms" type="checkbox" required disabled={busy === 'withdraw'} />
                    <span>I accept that after provider disbursement, this payout is final and cannot be reversed by AROfi.</span>
                  </label>
                  <FormProcessStatus
                    busy={busy === 'withdraw'}
                    error={modalError}
                    text={progress || 'Submitting withdrawal request to the provider. This window closes only after AROFi receives the API response.'}
                  />
                  <button className="btn btn-primary btn-block" disabled={busy === 'withdraw' || withdrawalMath.exceedsBalance || withdrawalMath.belowMinimum}>
                    {busy === 'withdraw' ? 'Processing withdrawal...' : 'Withdraw'}
                  </button>
                </FormGrid>
              </form>
            )}

            {action === 'secret' && (
              <form onSubmit={setSecret}>
                <div className="modal-kicker">Security</div>
                <h2 className="modal-title">{profile.profile.secretConfigured ? 'Change secret key' : 'Set secret key'}</h2>
                <FormGrid>
                  <Field label="Secret key">
                    <input name="secretKey" type="password" minLength={8} required placeholder="At least 8 characters" className="form-input" disabled={busy === 'secret'} />
                  </Field>
                  <FormProcessStatus busy={busy === 'secret'} error={modalError} text={progress || 'Saving secret key and refreshing profile.'} />
                  <button className="btn btn-primary btn-block" disabled={busy === 'secret'}>{busy === 'secret' ? 'Saving secret key...' : 'Save secret key'}</button>
                </FormGrid>
              </form>
            )}

            {action === 'number' && (
              <form onSubmit={addNumber}>
                <div className="modal-kicker">Payout setup</div>
                <h2 className="modal-title">Register payout number</h2>
                <FormGrid>
                  <Field label="Network">
                    <select name="network" className="form-input" required disabled={busy === 'number'}>
                      <option value="MTN">MTN</option>
                      <option value="AIRTEL">Airtel</option>
                    </select>
                  </Field>
                  <Field label="Phone number">
                    <input name="phoneNumber" required placeholder="0771234567" className="form-input" disabled={busy === 'number'} />
                  </Field>
                  <Field label="Label">
                    <input name="label" placeholder="Owner or business line" className="form-input" disabled={busy === 'number'} />
                  </Field>
                  <FormProcessStatus busy={busy === 'number'} error={modalError} text={progress || 'Registering payout number and refreshing profile.'} />
                  <button className="btn btn-primary btn-block" disabled={busy === 'number' || activeNumbers.length >= 2}>
                    {busy === 'number' ? 'Registering number...' : 'Register number'}
                  </button>
                </FormGrid>
              </form>
            )}

            {action === 'change' && (
              <form onSubmit={requestChange}>
                <div className="modal-kicker">Approval required</div>
                <h2 className="modal-title">Request payout number change</h2>
                <FormGrid>
                  <Field label="Existing number">
                    <select name="existingPayoutNumberId" className="form-input" disabled={busy === 'change'}>
                      <option value="">Add or replace payout number</option>
                      {activeNumbers.map((number) => (
                        <option key={number.id} value={number.id}>{number.network} - {number.normalizedPhone}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="New network">
                    <select name="network" className="form-input" required disabled={busy === 'change'}>
                      <option value="MTN">MTN</option>
                      <option value="AIRTEL">Airtel</option>
                    </select>
                  </Field>
                  <Field label="New phone number">
                    <input name="phoneNumber" required placeholder="New phone number" className="form-input" disabled={busy === 'change'} />
                  </Field>
                  <Field label="Reason">
                    <textarea name="reason" required minLength={10} placeholder="Explain why this payout number should change" className="form-input" rows={4} disabled={busy === 'change'} />
                  </Field>
                  <FormProcessStatus busy={busy === 'change'} error={modalError} text={progress || 'Submitting number change request for approval.'} />
                  <button className="btn btn-primary btn-block" disabled={busy === 'change'}>
                    {busy === 'change' ? 'Submitting request...' : 'Submit request'}
                  </button>
                </FormGrid>
              </form>
            )}
          </div>
        </div>
      )}
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

function FormGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>{children}</div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  )
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

const checkRowStyle = {
  display: 'grid',
  gridTemplateColumns: '18px 1fr',
  gap: 10,
  alignItems: 'start',
  color: 'var(--text-2)',
  fontSize: 13,
  lineHeight: 1.5,
}
