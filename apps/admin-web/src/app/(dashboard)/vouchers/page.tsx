import AgentVoucherAccountabilityReport from '@/components/AgentVoucherAccountabilityReport'
import AgentVoucherIssuancePanel from '@/components/AgentVoucherIssuancePanel'
import VouchersManager from '@/components/VouchersManager'

export const dynamic = 'force-dynamic'

export default function VouchersPage() {
  return (
    <>
      <AgentVoucherIssuancePanel />
      <AgentVoucherAccountabilityReport />
      <VouchersManager />
    </>
  )
}
