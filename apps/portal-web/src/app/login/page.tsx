import PortalCheckout from '../../components/PortalCheckout'

export default function PortalLoginPage() {
  // Render the exact same home portal view so packages are always visible
  // and the design matches the live portal at arofi.net/portal
  return <PortalCheckout initialView="home" />
}
