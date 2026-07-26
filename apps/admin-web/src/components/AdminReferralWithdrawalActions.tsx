'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { clientPostApi } from '@/lib/client-api'

export function AdminReferralWithdrawalActions({ transactionId }: { transactionId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function act(action: 'approve' | 'reject') {
    setBusy(true)
    setError('')
    try {
      await clientPostApi(`/referrals/admin/withdrawals/${transactionId}/${action}`, action === 'reject' ? { reason: 'Rejected by Dev Admin' } : {})
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update referral withdrawal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void act('reject')}>Reject</button>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void act('approve')}>Mark Paid</button>
      {error && <span className="badge badge-danger">{error}</span>}
    </div>
  )
}
