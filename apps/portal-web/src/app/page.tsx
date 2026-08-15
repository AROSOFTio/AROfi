import AgentActivationClaimEntry from '../components/AgentActivationClaimEntry'
import PortalCheckout from '../components/PortalCheckout'

export default function PortalPage() {
  // `/portal` is the real customer portal. Keeping the checkout on the root
  // route also preserves voucher, tenant, and MikroTik query parameters from
  // printed QR codes and captive-portal redirects.
  return (
    <>
      <AgentActivationClaimEntry />
      <PortalCheckout initialView="home" />
    </>
  )
}
