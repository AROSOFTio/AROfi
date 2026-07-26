'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { clientPostApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'

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
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit referral withdrawal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span className="card-title">Withdraw Referral Earnings</span>
        <span className="badge badge-info">Available {formatCurrency(availableBalanceUgx)}</span>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Amount UGX</span>
          <input className="input" value={amountUgx} onChange={(event) => setAmountUgx(event.target.value)} inputMode="numeric" required />
        </label>
        <label className="field">
          <span>Registered Payout Number</span>
          <select className="input" value={payoutNumberId} onChange={(event) => setPayoutNumberId(event.target.value)} required>
            {payoutNumbers.map((number) => (
              <option key={number.id} value={number.id}>
                {number.label ? `${number.label} - ` : ''}{number.network} {number.normalizedPhone}{number.isPrimary ? ' - Primary' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Withdrawal Secret PIN</span>
          <input className="input" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} type="password" required />
        </label>
      </div>
      {message && <div className="badge badge-success" style={{ marginTop: 12 }}>{message}</div>}
      {error && <div className="badge badge-danger" style={{ marginTop: 12 }}>{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={saving || availableBalanceUgx <= 0 || payoutNumbers.length === 0} style={{ marginTop: 14 }}>
        {saving ? 'Submitting...' : 'Request Withdrawal'}
      </button>
      {payoutNumbers.length === 0 && <p className="field-hint">Register and verify up to two payout numbers before withdrawing referral earnings.</p>}
    </form>
  )
}
