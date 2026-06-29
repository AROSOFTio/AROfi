import { AgentsOverviewResponse, DisbursementOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import SettlementsManager from '@/components/SettlementsManager'

export const dynamic = 'force-dynamic'

export default async function SettlementsPage() {
  const [disbursementData, agentsData] = await Promise.all([
    fetchApi<DisbursementOverviewResponse>('/agents/disbursements/overview'),
    fetchApi<AgentsOverviewResponse>('/agents/overview'),
  ])

  const settlements = disbursementData?.settlements ?? []
  const agents = (agentsData?.agents ?? []).map((agent) => ({ id: agent.id, code: agent.code, name: agent.name }))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settlements</h1>
          <p className="page-subtitle">Batch agent commissions into settlement runs, track payable balances, and disburse against them.</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Ready', value: `${disbursementData?.summary.readySettlements ?? 0}`, color: 'blue' },
          { label: 'Processing', value: `${disbursementData?.summary.processingSettlements ?? 0}`, color: 'purple' },
          { label: 'Total Payable', value: formatCurrency(disbursementData?.summary.totalPayableUgx ?? 0), color: 'amber' },
          { label: 'Total Disbursed', value: formatCurrency(disbursementData?.summary.totalDisbursedUgx ?? 0), color: 'green' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <SettlementsManager initialSettlements={settlements} agents={agents} />
    </>
  )
}
