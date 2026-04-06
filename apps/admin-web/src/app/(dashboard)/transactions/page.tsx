import { BillingTransactionsResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function TransactionsPage() {
  const data = await fetchApi<BillingTransactionsResponse>('/billing/transactions')
  const items = data?.items ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">All billing events including sales, voucher redemptions, and wallet adjustments.</p>
        </div>
        <button className="btn btn-ghost">Export Transactions</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Transactions', value: `${data?.summary.totalTransactions ?? 0}`, color: 'blue' },
          { label: 'Wallet Balance', value: formatCurrency(data?.summary.walletBalanceUgx ?? 0), color: 'green' },
          { label: 'Fees Posted', value: formatCurrency(data?.summary.totalFeesUgx ?? 0), color: 'amber' },
          { label: 'Gross Value', value: formatCurrency(data?.summary.totalGrossUgx ?? 0), color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {!data && (
        <div className="card">
          <div className="empty-state">
            <p>Transaction feed is currently unavailable. It will populate when the billing API is reachable.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Billing Transactions</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Tenant</th>
                <th>Type</th>
                <th>Channel</th>
                <th>Gross</th>
                <th>Fee</th>
                <th>Net</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <p>No transactions recorded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.externalReference ?? item.id.slice(0, 8)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.ledgerTransaction?.reference ?? 'No ledger ref'}</div>
                  </td>
                  <td>{item.tenant.name}</td>
                  <td>{formatTransactionType(item.type)}</td>
                  <td>{item.channel.toLowerCase()}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(item.grossAmountUgx)}</td>
                  <td>{formatCurrency(item.feeAmountUgx)}</td>
                  <td>{formatCurrency(item.netAmountUgx)}</td>
                  <td>
                    <span className={getStatusBadgeClass(item.status)}>{item.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
