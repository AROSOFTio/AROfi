'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { clientPostApi } from '@/lib/client-api'
import { Modal } from './Modal'

export function AdminReferralProfileActions({ profileId, status }: { profileId: string; status: string }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [action, setAction] = useState<'status' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      await clientPostApi(path, body)
      setReason('')
      setAction(null)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update referral partner')
    } finally {
      setBusy(false)
    }
  }

  const reasonRequired = reason.trim().length > 0
  const isSuspended = status === 'SUSPENDED'

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minWidth: 150 }}>
      <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => setAction('status')}>
        {isSuspended ? 'Reactivate' : 'Suspend'}
      </button>
      {error && <span className="badge badge-danger">{error}</span>}
      <Modal open={action === 'status'} onClose={() => !busy && setAction(null)} title={isSuspended ? 'Reactivate referral partner' : 'Suspend referral partner'} closeDisabled={busy}>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            void post(`/referrals/admin/profiles/${profileId}/${isSuspended ? 'reactivate' : 'suspend'}`, { reason })
          }}
        >
          <label className="form-group">
            <span className="form-label">Reason</span>
            <textarea className="form-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the reason clearly for audit records" required />
          </label>
          <div className="form-actions">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setAction(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy || !reasonRequired}>
              {busy ? 'Saving...' : isSuspended ? 'Reactivate Partner' : 'Suspend Partner'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
