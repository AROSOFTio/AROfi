import CompactPortalCheckout from '../components/CompactPortalCheckout'
import PortalPackageVisuals from '../components/PortalPackageVisuals'

export default function PortalPage() {
  // `/portal` is the real customer captive portal. Keep all MikroTik query
  // parameters in place so the compact experience can resolve the business,
  // reconnect active devices, and support same-business AP roaming.
  return (
    <>
      <PortalPackageVisuals />
      <CompactPortalCheckout />
    </>
  )
}
