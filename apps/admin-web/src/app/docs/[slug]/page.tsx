import { redirect } from 'next/navigation'

const legacyPageMap: Record<string, string> = {
  'getting-started': 'business-onboarding',
  'how-to-start-wifi-business-uganda': 'business-onboarding',
  'setup-mtn-airtel-wifi-billing': 'checkout',
  'block-hotspot-sharing-tethering': 'router-onboarding',
  'remote-winbox': 'router-onboarding',
  'winbox-setup': 'router-onboarding',
  payments: 'checkout',
  disbursements: 'wallets',
  commissions: 'pricing',
  'business-compliance': 'business-onboarding',
  'agent-pos': 'agents',
  notifications: 'live-dashboard',
  reports: 'reports',
  'captive-portal': 'checkout',
  'packages-and-vouchers': 'vouchers',
  troubleshooting: 'troubleshooting',
  faq: 'troubleshooting',
}

export default async function LegacyDocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/docs#${legacyPageMap[slug] ?? 'welcome'}`)
}
