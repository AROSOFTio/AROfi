import RegisterAgentPanel from '@/components/RegisterAgentPanel'
import { AdminSessionResponse, AgentsOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatBasisPoints, formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

export default async function AgentsPage() {
  const [data, session] = await Promise.all([
    fetchApi<AgentsOverviewResponse>('/agents/overview'),
    fetchApi<AdminSessionResponse>('/auth/me'),
  ])
  const canManageBusinessAgents = isVendorWorkspace(session?.user)
  const agents = data?.agents ?? []
  const recentCommissions = data?.recentCommissions ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">Register physical voucher sellers and track each agent's voucher sales for clean cash accountability.</p>
        </div>
        {canManageBusinessAgents && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <RegisterAgentPanel />
        </div>}
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Active Agents', value: `${data?.summary.activeAgents ?? 0}`, color: 'blue' },
          { label: 'Voucher Sales', value: formatCurrency(data?.summary.voucherSalesUgx ?? data?.summary.totalFloatUgx ?? 0), color: 'green' },
          { label: 'Agent Pay', value: formatCurrency(data?.summary.voucherAgentPayUgx ?? data?.summary.accruedCommissionUgx ?? 0), color: 'amber' },
          { label: 'Cash to Collect', value: formatCurrency(data?.summary.cashToCollectUgx ?? 0), color: 'purple' },
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
            <p>Agent data is unavailable right now. Once the API responds, this page will show live voucher seller metrics.</p>
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
                <th>Voucher Pay</th>
                <th>Voucher Sales</th>
                <th>Cash to Collect</th>
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
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(agent.voucherSalesUgx ?? agent.lifetimeSalesUgx)}</td>
                  <td>{formatCurrency(agent.cashToCollectUgx ?? Math.max(agent.lifetimeSalesUgx - agent.accruedCommissionUgx, 0))}</td>
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
          <span className="card-title">Recent Agent Voucher Sales</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Sale</th>
                <th>Agent Pay</th>
                <th>Status</th>
                <th>Posted</th>
              </tr>
            </thead>
            <tbody>
              {recentCommissions.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p>No voucher sales have been attributed to agents yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {recentCommissions.map((commission) => (
                <tr key={commission.id}>
                  <td>{commission.agent.name}</td>
                  <td>
                    <div>{commission.sourceTransaction ? formatTransactionType(commission.sourceTransaction.type) : 'Voucher Sale'}</div>
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

    </>
  )
}
