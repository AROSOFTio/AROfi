import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import DocumentationBook from '@/components/docs/DocumentationBook'
import { arofiBook } from '@/content/arofi-book'

const legacyPageMap: Record<string, string> = {
  'getting-started': 'start-here',
  'how-to-start-wifi-business-uganda': 'start-here',
  'setup-mtn-airtel-wifi-billing': 'test-mobile-money',
  'block-hotspot-sharing-tethering': 'test-captive-portal',
  'remote-winbox': 'remote-access-script',
  'winbox-setup': 'mikrotik-mobile-terminal',
  payments: 'test-mobile-money',
  disbursements: 'wallet-withdrawal',
  commissions: 'agent-accountability',
  'business-compliance': 'business-profile',
  'agent-pos': 'create-agent',
  notifications: 'notifications-support',
  reports: 'reports-exports',
  'captive-portal': 'test-captive-portal',
  'packages-and-vouchers': 'create-packages',
  troubleshooting: 'troubleshooting',
  faq: 'troubleshooting',
}

type DocsPageProps = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return arofiBook.map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug } = await params
  const page = arofiBook.find((item) => item.slug === slug)

  if (!page) {
    return {
      title: 'AROFi Handbook | WiFi Billing Documentation',
      description: 'AROFi public documentation for WiFi billing, MikroTik setup, vouchers, Mobile Money, agents, wallets and reports.',
      alternates: { canonical: '/docs' },
    }
  }

  const title = `${page.title} | AROFi Handbook`
  const description = `${page.summary} ${page.chapter} for ${page.audience.toLowerCase()}s using AROFi WiFi billing.`

  return {
    title,
    description,
    alternates: { canonical: `/docs/${page.slug}` },
    openGraph: {
      title,
      description,
      url: `/docs/${page.slug}`,
      type: 'article',
      siteName: 'AROFi',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function DocsSlugPage({ params }: DocsPageProps) {
  const { slug } = await params
  const page = arofiBook.find((item) => item.slug === slug)
  if (!page) redirect(`/docs/${legacyPageMap[slug] ?? 'start-here'}`)

  return <DocumentationBook initialSlug={page.slug} />
}
