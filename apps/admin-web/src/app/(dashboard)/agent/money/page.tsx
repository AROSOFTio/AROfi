import AgentSalesAccountability from '@/components/AgentSalesAccountability'

export const dynamic = 'force-dynamic'

export default function AgentMoneyPage() {
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Money & Commission</h1>
          <p className="page-subtitle">Deposit cash you owe and withdraw available Mobile Money commission.</p>
        </div>
      </div>
      <AgentSalesAccountability />
    </div>
  )
}
