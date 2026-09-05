import CompactPortalCheckout from '../components/CompactPortalCheckout'
import PortalPackageVisuals from '../components/PortalPackageVisuals'
import PortalResilience from '../components/PortalResilience'

export default function PortalPage() {
  // `/portal` is the real customer captive portal. Keep all MikroTik query
  // parameters in place so the compact experience can resolve the business,
  // reconnect active devices, and support same-business AP roaming.
  // PortalResilience runs before the checkout effect and bounds only the
  // initial context request, which is especially important for first-time
  // clients that have no saved portal token/session to recover from.
  return (
    <>
      <PortalResilience />
      <PortalPackageVisuals />
      <CompactPortalCheckout />
    </>
  )
}
