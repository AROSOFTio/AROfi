'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { clientPostApi } from '@/lib/client-api'

export function AdminReferralProfileActions({ profileId, status }: { profileId: string; status: string }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [amountUgx, setAmountUgx] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      await clientPostApi(path, body)
      setReason('')
      setAmountUgx('')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update referral partner')
    } finally {
      setBusy(false)
    }
  }

  const reasonRequired = reason.trim().length > 0

  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
      <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required reason" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {status === 'SUSPENDED' ? (
          <button className="btn btn-ghost" type="button" disabled={busy || !reasonRequired} onClick={() => void post(`/referrals/admin/profiles/${profileId}/reactivate`, { reason })}>
            Reactivate
          </button>
        ) : (
          <button className="btn btn-ghost" type="button" disabled={busy || !reasonRequired} onClick={() => void post(`/referrals/admin/profiles/${profileId}/suspend`, { reason })}>
            Suspend
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 120 }} value={amountUgx} onChange={(event) => setAmountUgx(event.target.value)} placeholder="+/- UGX" inputMode="numeric" />
        <button className="btn btn-primary" type="button" disabled={busy || !reasonRequired || !amountUgx} onClick={() => void post(`/referrals/admin/profiles/${profileId}/adjust-wallet`, { amountUgx: Number(amountUgx), reason })}>
          Adjust
        </button>
      </div>
      {error && <span className="badge badge-danger">{error}</span>}
    </div>
  )
}
