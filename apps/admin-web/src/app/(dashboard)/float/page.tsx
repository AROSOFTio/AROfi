import { FloatOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatBasisPoints, formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function FloatPage() {
  const data = await fetchApi<FloatOverviewResponse>('/agents/float/overview')
  const tenantWallets = data?.tenantWallets ?? []
  const agents = data?.agents ?? []
  const movements = data?.movements ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Float</h1>
          <p className="page-subtitle">Tenant working capital, agent wallet balances, reserved commissions, and recent float movements.</p>
        </div>
        <button className="btn btn-primary">Top Up Float</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Tenant Float', value: formatCurrency(data?.summary.tenantWalletBalanceUgx ?? 0), color: 'blue' },
          { label: 'Agent Wallets', value: formatCurrency(data?.summary.totalAgentWalletBalanceUgx ?? 0), color: 'green' },
          { label: 'Reserved Commission', value: formatCurrency(data?.summary.reservedCommissionUgx ?? 0), color: 'amber' },
          { label: 'Working Float', value: formatCurrency(data?.summary.workingFloatUgx ?? 0), color: 'purple' },
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
              {tenantWallets.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state">
                      <p>No tenant wallets are available yet.</p>
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
          <span className="card-title">Agent Wallets</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Type</th>
                <th>Rate</th>
                <th>Wallet Balance</th>
                <th>Available Float</th>
                <th>Reserved Commission</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No agent wallets have been provisioned yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{agent.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agent.code}</div>
                  </td>
                  <td>{formatTransactionType(agent.type)}</td>
                  <td>{formatBasisPoints(agent.commissionRateBps)}</td>
                  <td>{formatCurrency(agent.walletBalanceUgx)}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(agent.availableFloatUgx)}</td>
                  <td>{formatCurrency(agent.accruedCommissionUgx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Float Movements</span>
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
                      <p>No float transfers or payout wallet entries have been posted yet.</p>
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
                  <td>{movement.agent?.name ?? 'Tenant Op'}</td>
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
