import PortalCheckout from '../../components/PortalCheckout'

export const metadata = {
  title: 'Connect Smart TV | AROFi',
  description: 'Use a voucher or Mobile Money package to connect a Smart TV to AROFi WiFi.',
}

export default function SmartTvPortalPage() {
  return <PortalCheckout initialView="home" tvOnly />
}
