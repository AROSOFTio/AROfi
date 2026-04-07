import { AgentsOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatBasisPoints, formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function AgentsPage() {
  const data = await fetchApi<AgentsOverviewResponse>('/agents/overview')
  const agents = data?.agents ?? []
  const recentCommissions = data?.recentCommissions ?? []
  const recentDisbursements = data?.recentDisbursements ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">Resellers, field float positions, accrued commissions, and payout history across tenant operations.</p>
        </div>
        <button className="btn btn-primary">+ Add Agent</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Active Agents', value: `${data?.summary.activeAgents ?? 0}`, color: 'blue' },
          { label: 'Agent Float', value: formatCurrency(data?.summary.totalFloatUgx ?? 0), color: 'green' },
          { label: 'Accrued Commissions', value: formatCurrency(data?.summary.accruedCommissionUgx ?? 0), color: 'amber' },
          { label: 'Paid Out', value: formatCurrency(data?.summary.totalDisbursedUgx ?? 0), color: 'purple' },
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
            <p>Agent operations data is unavailable right now. Once the API responds, this page will show live reseller and field-ops metrics.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Agent Directory</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Territory</th>
                <th>Type</th>
                <th>Rate</th>
                <th>Available Float</th>
                <th>Accrued Commission</th>
                <th>Lifetime Sales</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>No agents or resellers have been onboarded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{agent.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agent.code} - {agent.phoneNumber}</div>
                  </td>
                  <td>{agent.territory ?? 'Unassigned'}</td>
                  <td>{formatTransactionType(agent.type)}</td>
                  <td>{formatBasisPoints(agent.commissionRateBps)}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(agent.availableFloatUgx)}</td>
                  <td>{formatCurrency(agent.accruedCommissionUgx)}</td>
                  <td>{formatCurrency(agent.lifetimeSalesUgx)}</td>
                  <td>
                    <span className={getStatusBadgeClass(agent.status)}>{agent.status.toLowerCase()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Commissions</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Source Sale</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Posted</th>
              </tr>
            </thead>
            <tbody>
              {recentCommissions.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p>No commissions have been accrued yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {recentCommissions.map((commission) => (
                <tr key={commission.id}>
                  <td>{commission.agent.name}</td>
                  <td>
                    <div>{commission.sourceTransaction ? formatTransactionType(commission.sourceTransaction.type) : 'Manual'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {commission.sourceTransaction ? formatCurrency(commission.sourceTransaction.grossAmountUgx) : 'No linked sale'}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(commission.amountUgx)}</td>
                  <td>
                    <span className={getStatusBadgeClass(commission.status)}>{commission.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(commission.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Disbursements</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Agent</th>
                <th>Settlement</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {recentDisbursements.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No agent payouts have been recorded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {recentDisbursements.map((disbursement) => (
                <tr key={disbursement.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{disbursement.reference}</td>
                  <td>{disbursement.agent.name}</td>
                  <td>{disbursement.settlement?.reference ?? 'Ad hoc'}</td>
                  <td>{formatTransactionType(disbursement.method)}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(disbursement.amountUgx)}</td>
                  <td>
                    <span className={getStatusBadgeClass(disbursement.status)}>{disbursement.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(disbursement.completedAt ?? disbursement.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
