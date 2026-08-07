import type { Metadata } from 'next'
import DocumentationBook from '@/components/docs/DocumentationBook'

export const metadata: Metadata = {
  title: 'AROFi Handbook | WiFi Billing, MikroTik, Vouchers and Payments',
  description: 'The visual AROFi operations handbook for WiFi billing, MikroTik setup, Mobile Money, vouchers, agents, wallets and reports.',
  alternates: { canonical: '/docs' },
}

export default function DocsPage() {
  return <DocumentationBook />
}
