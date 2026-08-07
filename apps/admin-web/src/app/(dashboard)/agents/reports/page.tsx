import AgentVoucherAccountabilityReport from '@/components/AgentVoucherAccountabilityReport'

export const dynamic = 'force-dynamic'

export default function AgentVoucherReportsPage() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Voucher Sales Report</h1>
        <a href="/agents" className="btn btn-ghost">Agents</a>
      </div>
      <AgentVoucherAccountabilityReport />
    </>
  )
}
