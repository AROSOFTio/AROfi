import './globals.css'
import '../styles/public-responsive-overrides.css'
import '../styles/mobile-public-hotfix.css'
import '../styles/final-ui-polish.css'
import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import PwaInstallPrompt from '@/components/PwaInstallPrompt'
import DeferredChatWidget from '@/components/DeferredChatWidget'
import CookieConsent from '@/components/CookieConsent'

const SITE_URL = 'https://arofi.net'
const SITE_NAME = 'AroFi by AROSOFT'
const TITLE = 'AroFi – WiFi, Hotspot, RADIUS & ISP Billing Platform for Africa'
const DESCRIPTION =
  'AroFi helps WiFi businesses and ISPs manage hotspot billing, RADIUS access, routers, internet packages, vouchers, customers, wallets and live sessions from one cloud console. Built for African network operators in Uganda, Kenya, Nigeria, Ghana, Rwanda, Tanzania, Zambia, Malawi, Botswana, South Africa and additional markets as local payment and support options are enabled.'

const FAVICON = '/brand-assets/arofi-app-icon.png?v=20260906-final3'
const BRAND_MARK = '/brand-assets/arofi-app-icon.png?v=20260906-final3'
const BRAND_LOGO = '/brand-assets/arofi-logo.png?v=20260906-final3'
const HERO_IMAGE = '/brand-assets/arofi-hero.png?v=20260906-final3'

const COUNTRIES = [
  'Uganda', 'Kenya', 'Nigeria', 'Ghana', 'Rwanda', 'Tanzania', 'Zambia', 'Malawi',
  'Botswana', 'South Africa', 'Zimbabwe', 'Namibia', 'Mozambique', 'Ethiopia',
  'Cameroon', 'Senegal', "Côte d'Ivoire",
]

const KEYWORDS = [
  'WiFi billing Africa',
  'hotspot billing software Africa',
  'ISP billing software Africa',
  'RADIUS billing Africa',
  'captive portal billing Africa',
  'MikroTik hotspot billing',
  'router management platform Africa',
  'WiFi voucher system Africa',
  'internet package billing',
  'mobile money WiFi billing',
  'MTN MoMo WiFi Uganda',
  'Airtel Money WiFi Uganda',
  ...COUNTRIES.flatMap((country) => [
    `WiFi billing ${country}`,
    `hotspot billing ${country}`,
    `ISP billing software ${country}`,
  ]),
  'AroFi',
  'AroFi WiFi billing',
  'AROSOFT Innovations Ltd',
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
    title: 'AroFi',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: FAVICON }],
    apple: BRAND_MARK,
    shortcut: FAVICON,
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
        url: `${SITE_URL}${HERO_IMAGE}`,
        width: 1600,
        height: 900,
        alt: 'AroFi network and WiFi management platform for African operators',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}${HERO_IMAGE}`],
  },
  alternates: { canonical: SITE_URL },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  other: {
    'application-name': 'AroFi',
    'ai-content-type': 'product',
    'ai-product-category': 'WiFi Hotspot, RADIUS and ISP Billing Platform',
    'ai-geography': COUNTRIES.join(', '),
    'msapplication-TileColor': '#22A53A',
    'msapplication-TileImage': FAVICON,
    'geo.region': 'UG',
    'geo.placename': 'Kampala',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F7F9' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0805' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `
    (function () {
      try {
        var cookies = document.cookie.split('; ').reduce(function (values, item) {
          var parts = item.split('=');
          values[parts[0]] = parts.slice(1).join('=');
          return values;
        }, {});
        var preference = null;
        try { preference = localStorage.getItem('arofi-theme'); } catch (storageError) {}
        preference = preference || cookies['arofi-theme'] || 'system';
        if (preference !== 'light' && preference !== 'dark' && preference !== 'system') preference = 'system';
        var mode = preference === 'system'
          ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : preference;
        document.documentElement.setAttribute('data-theme', mode);
        document.documentElement.setAttribute('data-accent-theme', 'green');
        document.documentElement.style.colorScheme = mode;
      } catch (error) {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.setAttribute('data-accent-theme', 'green');
      }
    })();
  `

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AroFi',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: DESCRIPTION,
    image: `${SITE_URL}${HERO_IMAGE}`,
    screenshot: `${SITE_URL}${HERO_IMAGE}`,
    keywords: KEYWORDS,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'UGX',
      description: 'Free self-onboarding option with paid plans and transaction services available by market.',
    },
    provider: {
      '@type': 'Organization',
      name: 'AROSOFT Innovations Ltd',
      url: 'https://arosoftlabs.com',
      logo: `${SITE_URL}${BRAND_MARK}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Kampala',
        addressCountry: 'UG',
      },
    },
    areaServed: COUNTRIES.map((name) => ({ '@type': 'Country', name })),
    featureList: [
      'WiFi and hotspot billing',
      'RADIUS authentication and accounting',
      'Router and access point management',
      'Internet package management',
      'Voucher generation and redemption',
      'Customer and live session management',
      'Wallet, sales and withdrawal reporting',
      'Mobile money integrations where enabled',
    ],
  }

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href={FAVICON} />
        <link rel="shortcut icon" href={FAVICON} />
        <link rel="apple-touch-icon" href={BRAND_MARK} />
        <link rel="llms" href="/llms.txt" type="text/plain" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      </head>
      <body>
        {children}
        <CookieConsent />
        <PwaInstallPrompt appName="AroFi Admin" />
        <DeferredChatWidget />
      </body>
    </html>
  )
}
