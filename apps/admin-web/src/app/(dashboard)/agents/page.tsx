import RegisterAgentPanel from '@/components/RegisterAgentPanel'
import AgentActionsPanel from '@/components/AgentActionsPanel'
import { AdminSessionResponse, AgentsOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

type AgentVoucherMetricsResponse = {
  summary: {
    agentsWithStock: number
    totalAssigned: number
    unsold: number
    soldAwaitingUse: number
    redeemed: number
    expired: number
    voided: number
    unsoldValueUgx: number
    recordedSales: number
    recordedSalesUgx: number
  }
  items: Array<{
    agentId: string
    totalAssigned: number
    generated: number
    printed: number
    unsold: number
    soldAwaitingUse: number
    redeemed: number
    expired: number
    voided: number
    assignedValueUgx: number
    unsoldValueUgx: number
    recordedSales: number
    recordedSalesUgx: number
    recordedFeesUgx: number
    recordedNetUgx: number
  }>
}

export default async function AgentsPage() {
  const [data, voucherMetrics, session] = await Promise.all([
    fetchApi<AgentsOverviewResponse>('/agents/overview'),
    fetchApi<AgentVoucherMetricsResponse>('/agents/voucher-metrics'),
    fetchApi<AdminSessionResponse>('/auth/me'),
  ])
  const canManageBusinessAgents = isVendorWorkspace(session?.user)
  const agents = data?.agents ?? []
  const recentCommissions = data?.recentCommissions ?? []
  const voucherMetricsByAgent = new Map(
    (voucherMetrics?.items ?? []).map((item) => [item.agentId, item]),
  )

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">Track every agent's assigned voucher stock, sales, usage, expiry, commission, and cash accountability.</p>
        </div>
        {canManageBusinessAgents && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <RegisterAgentPanel />
        </div>}
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Active Agents', value: `${data?.summary.activeAgents ?? 0}`, color: 'blue' },
          { label: 'Vouchers Assigned', value: `${voucherMetrics?.summary.totalAssigned ?? 0}`, color: 'purple' },
          { label: 'Unsold Stock', value: `${voucherMetrics?.summary.unsold ?? 0}`, color: 'amber' },
          { label: 'Recorded Sales', value: `${voucherMetrics?.summary.recordedSales ?? 0}`, color: 'green' },
          { label: 'Vouchers Used', value: `${voucherMetrics?.summary.redeemed ?? 0}`, color: 'blue' },
          { label: 'Expired', value: `${voucherMetrics?.summary.expired ?? 0}`, color: 'amber' },
          { label: 'Voucher Sales', value: formatCurrency(voucherMetrics?.summary.recordedSalesUgx ?? data?.summary.voucherSalesUgx ?? 0), color: 'green' },
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
          <span className="card-title">Agent Voucher Inventory & Sales</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Territory</th>
                <th>Assigned</th>
                <th>Unsold</th>
                <th>Sold</th>
                <th>Used</th>
                <th>Expired</th>
                <th>Sales Value</th>
                <th>Cash to Collect</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-state">
                      <p>No agents or resellers have been onboarded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {agents.map((agent) => {
                const metric = voucherMetricsByAgent.get(agent.id)
                return (
                  <tr key={agent.id}>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{agent.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agent.code} - {agent.phoneNumber}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{formatTransactionType(agent.type)}</div>
                    </td>
                    <td>{agent.territory ?? 'Unassigned'}</td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{metric?.totalAssigned ?? 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatCurrency(metric?.assignedValueUgx ?? 0)}</div>
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{metric?.unsold ?? 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{metric?.generated ?? 0} generated · {metric?.printed ?? 0} printed</div>
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{metric?.recordedSales ?? 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{metric?.soldAwaitingUse ?? 0} awaiting use</div>
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{metric?.redeemed ?? 0}</td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{metric?.expired ?? 0}</div>
                      {(metric?.voided ?? 0) > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{metric?.voided} voided</div>}
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(metric?.recordedSalesUgx ?? agent.voucherSalesUgx ?? agent.lifetimeSalesUgx)}</td>
                    <td>{formatCurrency(agent.cashToCollectUgx ?? Math.max(agent.lifetimeSalesUgx - agent.accruedCommissionUgx, 0))}</td>
                    <td>
                      <span className={getStatusBadgeClass(agent.status)}>{agent.status.toLowerCase()}</span>
                    </td>
                    <td>
                      <AgentActionsPanel agent={agent} canManage={canManageBusinessAgents} />
                    </td>
                  </tr>
                )
              })}
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
