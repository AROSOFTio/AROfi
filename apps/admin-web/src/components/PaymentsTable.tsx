'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PaymentOverviewResponse } from '@/lib/admin-types'
import { clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, formatDuration, getStatusBadgeClass } from '@/lib/format'

type Payment = PaymentOverviewResponse['payments'][number]

type Props = {
  initialPayments: Payment[]
}

const pendingStatuses = new Set(['INITIATED', 'PENDING', 'INDETERMINATE'])

export function PaymentsTable({ initialPayments }: Props) {
  const router = useRouter()
  const [payments, setPayments] = useState(initialPayments)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function recheck(paymentId: string) {
    setBusyId(paymentId)
    setMessage(null)
    try {
      const updated = await clientPostApi<Payment>(`/payments/${paymentId}/reconcile`, {}, { timeoutMs: 30000 })
      setPayments((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setMessage(updated.status === 'COMPLETED' ? 'Payment completed and activation checked.' : `Provider still reports ${updated.status.toLowerCase()}.`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Payment recheck failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {message && <div className="notice" style={{ margin: '0 16px 12px' }}>{message}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Business</th>
              <th>Package</th>
              <th>Phone</th>
              <th>Network</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Activation</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={10}>
                  <div className="empty-state">
                    <p>No payment requests recorded yet.</p>
                  </div>
                </td>
              </tr>
            )}
            {payments.map((payment) => {
              const canRecheck = pendingStatuses.has(payment.status)
              return (
                <tr key={payment.id}>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{payment.externalReference}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{payment.providerReference ?? 'Awaiting provider ref'}</div>
                  </td>
                  <td>{payment.tenant.name}</td>
                  <td>
                    <div>{payment.package.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDuration(payment.package.durationMinutes)}</div>
                  </td>
                  <td>{payment.phoneNumber}</td>
                  <td>{payment.network}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(payment.amountUgx)}</td>
                  <td>
                    <span className={getStatusBadgeClass(payment.status)}>{payment.status.toLowerCase()}</span>
                  </td>
                  <td>
                    {payment.activation ? (
                      <div>
                        <span className={getStatusBadgeClass(payment.activation.status)}>{payment.activation.status.toLowerCase()}</span>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          Until {formatDate(payment.activation.endsAt)}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Pending</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(payment.createdAt)}</td>
                  <td>
                    {canRecheck ? (
                      <button className="btn btn-secondary btn-sm" type="button" disabled={busyId === payment.id} onClick={() => void recheck(payment.id)}>
                        {busyId === payment.id ? 'Checking...' : 'Recheck'}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
