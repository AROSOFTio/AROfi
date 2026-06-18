import './globals.css'
import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Inter } from 'next/font/google'
import PwaInstallPrompt from '@/components/PwaInstallPrompt'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: false,
})

const SITE_URL = 'https://arofi.arosoftlabs.com'
const SITE_NAME = 'AROFi by AROSOFT'
const TITLE = 'AROFi – #1 WiFi Hotspot Billing & Mobile Money System in Uganda'
const DESCRIPTION =
  'AROFi is Uganda\'s best hotspot billing software. Manage MikroTik routers, sell WiFi packages, collect MTN MoMo & Airtel Money payments, issue vouchers, and track sessions — all from one multi-tenant cloud console. Self-onboarding. No IT needed.'

const KEYWORDS = [
  // Core product
  'wifi billing system Uganda',
  'hotspot billing software Uganda',
  'mobile money wifi billing',
  'MikroTik hotspot billing Uganda',
  'wifi billing software',
  'hotspot management system',
  'captive portal billing Uganda',
  'wifi management software Uganda',
  'internet cafe billing software Uganda',
  // Mobile Money
  'MTN MoMo wifi payment',
  'Airtel Money wifi payment',
  'mobile money hotspot payment Uganda',
  'pay wifi with MTN mobile money Uganda',
  'pay wifi with Airtel Money Uganda',
  'MTN MoMo hotspot',
  'Airtel Money hotspot billing',
  'mobile money internet billing Uganda',
  'how to accept MTN MoMo for wifi',
  'how to accept Airtel Money for internet',
  // MikroTik specific
  'MikroTik hotspot setup Uganda',
  'MikroTik billing system Uganda',
  'MikroTik RADIUS billing',
  'MikroTik captive portal Uganda',
  'RouterOS hotspot billing',
  'MikroTik user manager alternative',
  'MikroTik online billing system',
  'how to set up MikroTik hotspot billing',
  'MikroTik settings for wifi business Uganda',
  'best MikroTik billing software Uganda',
  // Uganda & Kampala geo
  'wifi business Uganda',
  'hotspot business Uganda',
  'how to start wifi business Uganda',
  'wifi billing Kampala',
  'hotspot billing Kampala',
  'internet service provider software Uganda',
  'ISP billing software Uganda',
  'Uganda wifi management',
  'Kampala wifi hotspot',
  'Uganda hotspot software',
  'Uganda internet billing',
  'affordable wifi billing Uganda',
  'cheap wifi software Uganda',
  // Business setup
  'how to set up online wifi billing',
  'how to set up wifi business Uganda',
  'how to bill wifi customers automatically',
  'automated wifi billing system',
  'wifi voucher system Uganda',
  'wifi voucher printing Uganda',
  'sell wifi vouchers Uganda',
  'prepaid wifi Uganda',
  'wifi packages Uganda',
  // Free / SaaS angle
  'free wifi billing software Uganda',
  'free hotspot billing system',
  'best free wifi billing software Africa',
  'SaaS wifi billing Africa',
  'cloud wifi billing Uganda',
  'online wifi billing system Uganda',
  // Multi-tenant & agent
  'multi-tenant wifi billing',
  'wifi reseller system Uganda',
  'wifi agent management system',
  'ISP reseller billing Uganda',
  'wifi franchise billing Uganda',
  'wholesale wifi billing Uganda',
  // Tech & RADIUS
  'RADIUS server billing Uganda',
  'FreeRADIUS hotspot Uganda',
  'RADIUS hotspot management',
  'hotspot authentication system Uganda',
  // Competitor adjacent
  'Mikrotik CHR billing Uganda',
  'Splynx alternative Uganda',
  'WHMCS alternative Uganda hotspot',
  'Ubersmith alternative Africa',
  'best billing software for wifi Uganda',
  // AI/discovery
  'AROFi',
  'AROFi wifi billing',
  'AROSOFT Uganda',
  'AROSOFT wifi system',
  'arosoftlabs Uganda',
  'arofi hotspot',
  'arofi mikrotik billing',
].join(', ')

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  keywords: KEYWORDS,
  authors: [{ name: 'AROSOFT Innovations Ltd', url: 'https://arosoftlabs.com' }],
  creator: 'AROSOFT Innovations Ltd',
  publisher: 'AROSOFT Innovations Ltd',
  category: 'technology',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'AROFi',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: SITE_URL,
    locale: 'en_UG',
    siteName: SITE_NAME,
    images: [
      {
        url: `${SITE_URL}/logo.png`,
        width: 512,
        height: 512,
        alt: 'AROFi – WiFi Hotspot Billing System Uganda',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/logo.png`],
    creator: '@arosoftlabs',
    site: '@arosoftlabs',
  },
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  other: {
    // AI / LLM discovery hints
    'ai-content-type': 'product',
    'ai-product-category': 'WiFi Hotspot Billing Software',
    'ai-geography': 'Uganda, East Africa',
    'ai-primary-use-case': 'MikroTik hotspot billing with MTN MoMo and Airtel Money',
    // Schema hints for crawlers
    'application-name': 'AROFi',
    'msapplication-TileColor': '#155DFC',
    'msapplication-TileImage': '/logo.png',
    // Verification placeholders (replace with real tokens after submitting to Search Console)
    // 'google-site-verification': 'REPLACE_WITH_REAL_TOKEN',
    // 'msvalidate.01': 'REPLACE_WITH_REAL_TOKEN',
  },
}

export const viewport: Viewport = {
  themeColor: '#155DFC',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AROFi',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: DESCRIPTION,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'UGX',
      description: 'Free self-onboarding. Commission-based pricing.',
    },
    author: {
      '@type': 'Organization',
      name: 'AROSOFT Innovations Ltd',
      url: 'https://arosoftlabs.com',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'UG',
        addressLocality: 'Kampala',
        addressRegion: 'Central Region',
      },
    },
    audience: {
      '@type': 'Audience',
      geographicArea: {
        '@type': 'Country',
        name: 'Uganda',
      },
    },
    keywords: KEYWORDS,
    featureList: [
      'MikroTik hotspot billing',
      'MTN MoMo payment integration',
      'Airtel Money payment integration',
      'Multi-tenant SaaS',
      'WiFi voucher management',
      'RADIUS authentication',
      'Self-onboarding for WiFi operators',
      'Kampala Uganda hotspot billing',
      'Automated session management',
      'Mobile money collection',
    ],
    screenshot: `${SITE_URL}/logo.png`,
  }

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${inter.variable}`}>
      <head>
        <link rel="icon" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        {/* Resource hints */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Structured Data / JSON-LD for Google, Bing & AI crawlers */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* FAQ Schema for AI discovery */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: [
                {
                  '@type': 'Question',
                  name: 'What is the best WiFi hotspot billing software in Uganda?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'AROFi by AROSOFT is Uganda\'s leading hotspot billing platform. It supports MikroTik routers, MTN MoMo, Airtel Money, WiFi vouchers, and multi-tenant management — all in one cloud console at arofi.arosoftlabs.com.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'How do I accept MTN MoMo for my WiFi hotspot in Uganda?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'With AROFi, you simply self-onboard your MikroTik router and the system automatically accepts MTN Mobile Money (MoMo) and Airtel Money payments from WiFi customers without any extra setup.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'Is there free WiFi billing software available in Uganda?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'AROFi offers free self-onboarding with no upfront cost. The platform runs on a commission-based model, meaning you only pay when you collect revenue. It is the most accessible WiFi billing system in Uganda and across East Africa.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'How do I set up MikroTik hotspot billing in Uganda?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Register on AROFi, add your MikroTik router using one RouterOS terminal command, and you are ready. The system handles RADIUS authentication, customer sessions, mobile money billing, and voucher printing automatically.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'What is AROFi?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'AROFi is a multi-tenant SaaS platform built by AROSOFT Innovations Ltd (Uganda) that enables WiFi operators to onboard MikroTik routers, sell internet packages, collect MTN MoMo and Airtel Money payments, issue vouchers, and manage customer sessions from a single online dashboard.',
                  },
                },
              ],
            }),
          }}
        />
      </head>
      <body>
        {children}
        <PwaInstallPrompt appName="AROFi Admin" />
      </body>
    </html>
  )
}
