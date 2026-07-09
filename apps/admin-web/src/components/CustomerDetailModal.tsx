'use client'

import { useEffect, useState } from 'react'
import { clientFetchApi } from '@/lib/client-api'
import { formatCurrency, formatDate, formatMegabytes, getStatusBadgeClass } from '@/lib/format'

type CustomerDetail = {
  reference: string
  summary: {
    totalPayments: number
    totalSpentUgx: number
    totalSessions: number
    totalRedemptions: number
  }
  payments: Array<{
    id: string
    network: string
    amountUgx: number
    status: string
    createdAt: string
    package?: { name: string } | null
  }>
  activations: Array<{
    id: string
    status: string
    startsAt?: string | null
    endsAt?: string | null
    createdAt: string
    package?: { name: string } | null
  }>
  sessions: Array<{
    id: string
    status: string
    startedAt: string
    endedAt?: string | null
    inputOctets: number | string
    outputOctets: number | string
  }>
  redemptions: Array<{
    id: string
    createdAt: string
    voucher?: { code: string; faceValueUgx: number } | null
    package?: { name: string } | null
  }>
}

export default function CustomerDetailModal({ reference, onClose }: { reference: string; onClose: () => void }) {
  const [data, setData] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    clientFetchApi<CustomerDetail>(`/users/customers/${encodeURIComponent(reference)}`)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Could not load customer details')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reference])

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card wide" onClick={(event) => event.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="modal-close" type="button" onClick={onClose}>Close</button>
        <div className="modal-kicker">Customer Detail</div>
        <h2 className="modal-title">{reference}</h2>

        {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading customer history...</p>}
        {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}

        {data && (
          <div style={{ display: 'grid', gap: 18, marginTop: 12 }}>
            <div className="stats-grid">
              <div className="stat-card blue">
                <div className="stat-label">Total Payments</div>
                <div className="stat-value blue">{data.summary.totalPayments}</div>
              </div>
              <div className="stat-card green">
                <div className="stat-label">Total Spent</div>
                <div className="stat-value green">{formatCurrency(data.summary.totalSpentUgx)}</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-label">Sessions</div>
                <div className="stat-value amber">{data.summary.totalSessions}</div>
              </div>
              <div className="stat-card purple">
                <div className="stat-label">Vouchers Redeemed</div>
                <div className="stat-value purple">{data.summary.totalRedemptions}</div>
              </div>
            </div>

            <DetailSection title="Payment History">
              {data.payments.length === 0 ? (
                <EmptyNote text="No payments recorded for this customer." />
              ) : (
                <table>
                  <thead><tr><th>Date</th><th>Package</th><th>Network</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td style={{ fontSize: 12 }}>{formatDate(payment.createdAt)}</td>
                        <td>{payment.package?.name ?? 'Package'}</td>
                        <td>{payment.network}</td>
                        <td>{formatCurrency(payment.amountUgx)}</td>
                        <td><span className={getStatusBadgeClass(payment.status)}>{payment.status.toLowerCase()}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DetailSection>

            <DetailSection title="Package Activations">
              {data.activations.length === 0 ? (
                <EmptyNote text="No package activations for this customer." />
              ) : (
                <table>
                  <thead><tr><th>Package</th><th>Status</th><th>Started</th><th>Ends</th></tr></thead>
                  <tbody>
                    {data.activations.map((activation) => (
                      <tr key={activation.id}>
                        <td>{activation.package?.name ?? 'Package'}</td>
                        <td><span className={getStatusBadgeClass(activation.status)}>{activation.status.toLowerCase()}</span></td>
                        <td style={{ fontSize: 12 }}>{formatDate(activation.startsAt ?? activation.createdAt)}</td>
                        <td style={{ fontSize: 12 }}>{activation.endsAt ? formatDate(activation.endsAt) : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DetailSection>

            <DetailSection title="Network Sessions">
              {data.sessions.length === 0 ? (
                <EmptyNote text="No network sessions for this customer." />
              ) : (
                <table>
                  <thead><tr><th>Started</th><th>Ended</th><th>Status</th><th>Data Used</th></tr></thead>
                  <tbody>
                    {data.sessions.map((session) => (
                      <tr key={session.id}>
                        <td style={{ fontSize: 12 }}>{formatDate(session.startedAt)}</td>
                        <td style={{ fontSize: 12 }}>{session.endedAt ? formatDate(session.endedAt) : 'Active'}</td>
                        <td><span className={getStatusBadgeClass(session.status)}>{session.status.toLowerCase()}</span></td>
                        <td>{formatMegabytes((Number(session.inputOctets) + Number(session.outputOctets)) / 1024 / 1024)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DetailSection>

            <DetailSection title="Voucher Redemptions">
              {data.redemptions.length === 0 ? (
                <EmptyNote text="No vouchers redeemed by this customer." />
              ) : (
                <table>
                  <thead><tr><th>Date</th><th>Voucher Code</th><th>Package</th><th>Face Value</th></tr></thead>
                  <tbody>
                    {data.redemptions.map((redemption) => (
                      <tr key={redemption.id}>
                        <td style={{ fontSize: 12 }}>{formatDate(redemption.createdAt)}</td>
                        <td style={{ fontFamily: 'monospace' }}>{redemption.voucher?.code ?? 'N/A'}</td>
                        <td>{redemption.package?.name ?? 'Package'}</td>
                        <td>{formatCurrency(redemption.voucher?.faceValueUgx ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DetailSection>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-header">
        <span className="card-title">{title}</span>
      </div>
      <div className="table-wrap">{children}</div>
    </div>
  )
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
    </div>
  )
}
