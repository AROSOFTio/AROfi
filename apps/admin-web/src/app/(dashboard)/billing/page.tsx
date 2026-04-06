import { BillingOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const data = await fetchApi<BillingOverviewResponse>('/billing/overview')
  const wallets = data?.wallets ?? []
  const ledgerEntries = data?.recentLedgerEntries ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing & Wallet</h1>
          <p className="page-subtitle">Tenant float positions, platform fee intake, and recent immutable ledger activity.</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Wallet Float', value: formatCurrency(data?.summary.walletBalanceUgx ?? 0), color: 'green' },
          { label: 'Platform Fees', value: formatCurrency(data?.summary.platformFeesUgx ?? 0), color: 'amber' },
          { label: 'Vendor Net', value: formatCurrency(data?.summary.vendorNetUgx ?? 0), color: 'blue' },
          { label: 'Posted Sales', value: formatCurrency(data?.summary.totalSalesUgx ?? 0), color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Tenant Wallets</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Balance</th>
                <th>Currency</th>
              </tr>
            </thead>
            <tbody>
              {wallets.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state">
                      <p>No tenant wallets have been created yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {wallets.map((wallet) => (
                <tr key={wallet.id}>
                  <td>{wallet.tenant.name}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(wallet.balanceUgx)}</td>
                  <td>{wallet.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Ledger Entries</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Account</th>
                <th>Direction</th>
                <th>Amount</th>
                <th>Memo</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {ledgerEntries.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No ledger postings yet. Sales and wallet adjustments will appear here.</p>
                    </div>
                  </td>
                </tr>
              )}
              {ledgerEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{entry.ledgerTransaction.reference}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTransactionType(entry.ledgerTransaction.type)}</div>
                  </td>
                  <td>{entry.accountCode}</td>
                  <td>
                    <span className={getStatusBadgeClass(entry.direction)}>{entry.direction.toLowerCase()}</span>
                  </td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(entry.amountUgx)}</td>
                  <td>{entry.memo ?? entry.ledgerTransaction.description}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(entry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
