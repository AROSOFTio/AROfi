import PremiumPortalCheckout from '../components/PremiumPortalCheckout'

export default function PortalPage() {
  // `/portal` is the real customer captive portal. The premium experience keeps
  // all MikroTik query parameters in-place and resolves the business dynamically.
  return <PremiumPortalCheckout />
}
