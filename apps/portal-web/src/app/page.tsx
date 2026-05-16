import PortalCheckout from '../components/PortalCheckout'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function PortalPage() {
  return <PortalCheckout initialView="home" />
}
