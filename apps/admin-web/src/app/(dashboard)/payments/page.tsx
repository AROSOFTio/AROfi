import { PaymentOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatDuration, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  const data = await fetchApi<PaymentOverviewResponse>('/payments/overview')
  const payments = data?.payments ?? []
  const logs = data?.recentLogs ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment Logs</h1>
          <p className="page-subtitle">Yo Uganda collections, webhook processing, and auto-activation events across MTN and Airtel.</p>
        </div>
        <button className="btn btn-ghost">Export Payment Logs</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Collections', value: formatCurrency(data?.summary.grossCollectionsUgx ?? 0), color: 'green' },
          { label: 'Completed', value: `${data?.summary.completedPayments ?? 0}`, color: 'blue' },
          { label: 'Pending', value: `${data?.summary.pendingPayments ?? 0}`, color: 'amber' },
          { label: 'Active Access', value: `${data?.summary.activeActivations ?? 0}`, color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Mobile Money Payments</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Tenant</th>
                <th>Package</th>
                <th>Phone</th>
                <th>Network</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Activation</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <p>No payment requests recorded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {payments.map((payment) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Webhook & Processing Log</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Payment</th>
                <th>Tenant</th>
                <th>Verification</th>
                <th>Processed</th>
                <th>Notes</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No webhook or payment processing logs yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <div>{log.eventType}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {log.providerReference ?? log.externalReference ?? 'No ref'}
                    </div>
                  </td>
                  <td>{log.payment?.externalReference ?? 'Unmatched'}</td>
                  <td>{log.tenant?.name ?? 'N/A'}</td>
                  <td>
                    <span className={getStatusBadgeClass(log.verificationStatus ?? 'INFO')}>
                      {(log.verificationStatus ?? 'unknown').toLowerCase()}
                    </span>
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(log.isProcessed ? 'COMPLETED' : 'PENDING')}>
                      {log.isProcessed ? 'done' : 'queued'}
                    </span>
                  </td>
                  <td>{log.notes ?? 'No note'}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
