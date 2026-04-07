import { DisbursementOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function DisbursementsPage() {
  const data = await fetchApi<DisbursementOverviewResponse>('/agents/disbursements/overview')
  const settlements = data?.settlements ?? []
  const disbursements = data?.disbursements ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Disbursements</h1>
          <p className="page-subtitle">Commission settlement runs, payable balances, and completed reseller payouts.</p>
        </div>
        <button className="btn btn-primary">Run Settlement</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Payable', value: formatCurrency(data?.summary.totalPayableUgx ?? 0), color: 'amber' },
          { label: 'Disbursed', value: formatCurrency(data?.summary.totalDisbursedUgx ?? 0), color: 'green' },
          { label: 'Ready Settlements', value: `${data?.summary.readySettlements ?? 0}`, color: 'blue' },
          { label: 'In Flight', value: formatCurrency(data?.summary.pendingDisbursementUgx ?? 0), color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Settlement Runs</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Settlement</th>
                <th>Agent</th>
                <th>Sales</th>
                <th>Commission</th>
                <th>Disbursed</th>
                <th>Status</th>
                <th>Period End</th>
              </tr>
            </thead>
            <tbody>
              {settlements.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No settlement runs have been created yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {settlements.map((settlement) => (
                <tr key={settlement.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{settlement.reference}</td>
                  <td>
                    <div>{settlement.agent.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{settlement.agent.code}</div>
                  </td>
                  <td>{formatCurrency(settlement.grossSalesUgx)}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(settlement.payableAmountUgx)}</td>
                  <td>{formatCurrency(settlement.disbursedAmountUgx)}</td>
                  <td>
                    <span className={getStatusBadgeClass(settlement.status)}>{settlement.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(settlement.periodEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Disbursement Log</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Agent</th>
                <th>Method</th>
                <th>Destination</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {disbursements.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No disbursements have been posted yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {disbursements.map((disbursement) => (
                <tr key={disbursement.id}>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{disbursement.reference}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {disbursement.billingTransaction?.externalReference ?? disbursement.settlement?.reference ?? 'No source ref'}
                    </div>
                  </td>
                  <td>{disbursement.agent.name}</td>
                  <td>{formatTransactionType(disbursement.method)}</td>
                  <td>{disbursement.destinationReference ?? 'Manual'}</td>
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
