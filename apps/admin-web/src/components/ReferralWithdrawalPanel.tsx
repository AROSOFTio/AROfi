'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { clientPostApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'

export function ReferralWithdrawalPanel({ availableBalanceUgx }: { availableBalanceUgx: number }) {
  const router = useRouter()
  const [amountUgx, setAmountUgx] = useState('')
  const [payoutPhone, setPayoutPhone] = useState('')
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
        payoutPhone,
      })
      setAmountUgx('')
      setPayoutPhone('')
      setMessage('Referral withdrawal request submitted for review.')
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
          <span>Mobile Money Number</span>
          <input className="input" value={payoutPhone} onChange={(event) => setPayoutPhone(event.target.value)} placeholder="+256..." required />
        </label>
      </div>
      {message && <div className="badge badge-success" style={{ marginTop: 12 }}>{message}</div>}
      {error && <div className="badge badge-danger" style={{ marginTop: 12 }}>{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={saving || availableBalanceUgx <= 0} style={{ marginTop: 14 }}>
        {saving ? 'Submitting...' : 'Request Withdrawal'}
      </button>
    </form>
  )
}
