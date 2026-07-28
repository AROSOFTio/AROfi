'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { clientPostApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'
import { Modal } from './Modal'

type PayoutNumber = {
  id: string
  network: string
  normalizedPhone: string
  label?: string | null
  isPrimary: boolean
}

export function ReferralWithdrawalPanel({ availableBalanceUgx, payoutNumbers }: { availableBalanceUgx: number; payoutNumbers: PayoutNumber[] }) {
  const router = useRouter()
  const [amountUgx, setAmountUgx] = useState('')
  const [payoutNumberId, setPayoutNumberId] = useState(payoutNumbers[0]?.id ?? '')
  const [secretKey, setSecretKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await clientPostApi('/referrals/withdrawals', {
        amountUgx: Number(amountUgx),
        payoutNumberId,
        secretKey,
      })
      setAmountUgx('')
      setSecretKey('')
      setMessage('Referral withdrawal approved to your registered payout number.')
      setOpen(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit referral withdrawal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card referral-withdraw-card">
      <div className="card-header">
        <span className="card-title">Withdraw Referral Earnings</span>
        <span className="badge badge-info">Available {formatCurrency(availableBalanceUgx)}</span>
      </div>
      {message && <div className="badge badge-success referral-withdraw-message">{message}</div>}
      {error && <div className="badge badge-danger referral-withdraw-message">{error}</div>}
      <div className="settings-summary-block" style={{ margin: '18px 20px 0' }}>
        <div>
          <div className="setting-title">Available referral wallet</div>
          <div className="setting-description">Withdraw to one of your verified payout numbers using your withdrawal secret PIN.</div>
        </div>
        <strong>{formatCurrency(availableBalanceUgx)}</strong>
      </div>
      <button className="btn btn-primary referral-withdraw-submit" type="button" disabled={availableBalanceUgx <= 0 || payoutNumbers.length === 0} onClick={() => setOpen(true)}>
        Request Withdrawal
      </button>
      {payoutNumbers.length === 0 && <p className="field-hint">Register and verify up to two payout numbers before withdrawing referral earnings.</p>}
      <Modal open={open} onClose={() => !saving && setOpen(false)} title="Request referral withdrawal" closeDisabled={saving}>
        <form onSubmit={submit} className="form-grid referral-withdraw-grid">
          <label className="form-group">
            <span className="form-label">Amount UGX</span>
            <input className="form-input" value={amountUgx} onChange={(event) => setAmountUgx(event.target.value)} inputMode="numeric" required />
          </label>
          <label className="form-group">
            <span className="form-label">Payout Number</span>
            <select className="form-input" value={payoutNumberId} onChange={(event) => setPayoutNumberId(event.target.value)} required>
              {payoutNumbers.map((number) => (
                <option key={number.id} value={number.id}>
                  {number.label ? `${number.label} - ` : ''}{number.network} {number.normalizedPhone}{number.isPrimary ? ' - Primary' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">Secret PIN</span>
            <input className="form-input" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} type="password" required />
          </label>
          <div className="form-actions">
            <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving || availableBalanceUgx <= 0 || payoutNumbers.length === 0}>
              {saving ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
