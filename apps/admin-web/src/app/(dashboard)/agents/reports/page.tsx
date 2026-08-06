import AgentVoucherAccountabilityReport from '@/components/AgentVoucherAccountabilityReport'

export const dynamic = 'force-dynamic'

export default function AgentVoucherReportsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agent Voucher Reports</h1>
          <p className="page-subtitle">
            Filter confirmed voucher sales, assigned stock, redemptions, expiry and cash accountability by agent, location, package and date.
          </p>
        </div>
        <a href="/agents" className="btn btn-ghost">Back to Agents</a>
      </div>
      <AgentVoucherAccountabilityReport />
    </>
  )
}
