import { FloatOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function FloatPage() {
  const data = await fetchApi<FloatOverviewResponse>('/agents/float/overview')
  const tenantWallets = data?.tenantWallets ?? []
  const movements = data?.movements ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Earnings</h1>
          <p className="page-subtitle">Business settlement balance and recent wallet movements.</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Settlement Balance', value: formatCurrency(data?.summary.tenantWalletBalanceUgx ?? 0), color: 'blue' },
          { label: 'Business Wallets', value: `${tenantWallets.length}`, color: 'green' },
          { label: 'Pending Movements', value: `${movements.filter((movement) => movement.status === 'PENDING' || movement.status === 'PROCESSING').length}`, color: 'amber' },
          { label: 'Recent Movements', value: `${movements.length}`, color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Business Wallets</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Balance</th>
                <th>Currency</th>
              </tr>
            </thead>
            <tbody>
              {tenantWallets.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state">
                      <p>No business wallets are available yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {tenantWallets.map((wallet) => (
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
          <span className="card-title">Recent Wallet Movements</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Agent</th>
                <th>Type</th>
                <th>Gross</th>
                <th>Net Wallet Delta</th>
                <th>Status</th>
                <th>Posted</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No wallet transfers or payout entries have been posted yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{movement.externalReference ?? movement.id.slice(0, 8)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{movement.ledgerTransaction?.reference ?? 'No ledger ref'}</div>
                  </td>
                  <td>{movement.agent?.name ?? 'Business Op'}</td>
                  <td>{formatTransactionType(movement.type)}</td>
                  <td>{formatCurrency(movement.grossAmountUgx)}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(movement.netAmountUgx)}</td>
                  <td>
                    <span className={getStatusBadgeClass(movement.status)}>{movement.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(movement.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
