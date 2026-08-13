import './globals.css'
import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import PwaInstallPrompt from '@/components/PwaInstallPrompt'
import DeferredChatWidget from '@/components/DeferredChatWidget'
import CookieConsent from '@/components/CookieConsent'

const SITE_URL = 'https://arofi.net'
const SITE_NAME = 'AROFi by AROSOFT'
const TITLE = 'AROFi – #1 WiFi Hotspot Billing & Mobile Money System in Uganda'
const DESCRIPTION =
  'AROFi is Uganda\'s best hotspot billing software. Manage MikroTik routers, sell WiFi packages, collect MTN MoMo & Airtel Money payments, issue vouchers, and track sessions — all from one multi-business cloud console. Self-onboarding. No IT needed.'
const FAVICON = '/brand/arofi-favicon-v2.svg'
const BRAND_MARK = '/brand/arofi-mark-blue.svg'
const BRAND_LOGO = '/brand/arofi-logo-blue.svg'

const KEYWORDS = [
  'wifi billing system Uganda',
  'hotspot billing software Uganda',
  'mobile money wifi billing',
  'MikroTik hotspot billing Uganda',
  'wifi billing software',
  'hotspot management system',
  'captive portal billing Uganda',
  'wifi management software Uganda',
  'internet cafe billing software Uganda',
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
  'how to set up online wifi billing',
  'how to set up wifi business Uganda',
  'how to bill wifi customers automatically',
  'automated wifi billing system',
  'wifi voucher system Uganda',
  'wifi voucher printing Uganda',
  'sell wifi vouchers Uganda',
  'prepaid wifi Uganda',
  'wifi packages Uganda',
  'free wifi billing software Uganda',
  'free hotspot billing system',
  'best free wifi billing software Africa',
  'SaaS wifi billing Africa',
  'cloud wifi billing Uganda',
  'online wifi billing system Uganda',
  'multi-business wifi billing',
  'wifi reseller system Uganda',
  'wifi agent management system',
  'ISP reseller billing Uganda',
  'wifi franchise billing Uganda',
  'wholesale wifi billing Uganda',
  'RADIUS server billing Uganda',
  'FreeRADIUS hotspot Uganda',
  'RADIUS hotspot management',
  'hotspot authentication system Uganda',
  'Mikrotik CHR billing Uganda',
  'Splynx alternative Uganda',
  'WHMCS alternative Uganda hotspot',
  'Ubersmith alternative Africa',
  'best billing software for wifi Uganda',
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
    icon: [{ url: FAVICON, type: 'image/svg+xml' }],
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
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'AROFi – WiFi Hotspot Billing System Uganda | MTN MoMo & Airtel Money',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
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
    'ai-content-type': 'product',
    'ai-product-category': 'WiFi Hotspot Billing Software',
    'ai-geography': 'Uganda, East Africa',
    'ai-primary-use-case': 'MikroTik hotspot billing with MTN MoMo and Airtel Money',
    'application-name': 'AROFi',
    'msapplication-TileColor': '#2563EB',
    'msapplication-TileImage': FAVICON,
    'llms-txt': `${SITE_URL}/llms.txt`,
    'geo.region': 'UG-C',
    'geo.placename': 'Kampala',
    'geo.position': '0.3476;32.5825',
    'ICBM': '0.3476, 32.5825',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
}

async function getPublicDefaultAccentTheme() {
  try {
    const apiBase = process.env.API_SERVER_URL || 'http://api:3000/api'
    const response = await fetch(`${apiBase}/system/public-settings`, {
      next: { revalidate: 60 },
    })
    if (!response.ok) return 'blue'
    const settings = await response.json() as { publicDefaultAccentTheme?: string }
    return ['blue', 'green', 'gold'].includes(settings.publicDefaultAccentTheme ?? '')
      ? settings.publicDefaultAccentTheme
      : 'blue'
  } catch {
    return 'blue'
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const publicDefaultAccentTheme = await getPublicDefaultAccentTheme()
  const themeScript = `
    (function () {
      var publicDefaultAccentTheme = ${JSON.stringify(publicDefaultAccentTheme)};
      try {
        var cookies = document.cookie.split('; ').reduce(function (values, item) {
          var parts = item.split('=');
          values[parts[0]] = parts.slice(1).join('=');
          return values;
        }, {});
        var mode = null;
        var accent = null;
        try {
          mode = localStorage.getItem('arofi-theme');
        } catch (storageError) {}
        mode = mode || cookies['arofi-theme'];
        if (mode !== 'dark' && mode !== 'light') {
          mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        // The public colour is controlled by the SaaS Admin. Do not let an
        // old per-browser dashboard preference keep arofi.net on a stale
        // accent after the platform default changes.
        accent = publicDefaultAccentTheme;
        document.documentElement.setAttribute('data-theme', mode);
        document.documentElement.setAttribute('data-accent-theme', accent);
      } catch (error) {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.setAttribute('data-accent-theme', publicDefaultAccentTheme);
      }
    })();
  `
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
      logo: `${SITE_URL}${BRAND_MARK}`,
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'UG',
        addressLocality: 'Kampala',
        addressRegion: 'Central Region',
      },
      contactPoint: [
        {
          '@type': 'ContactPoint',
          telephone: '+256787726388',
          email: 'support@arofi.net',
          contactType: 'customer support',
          areaServed: 'UG',
          availableLanguage: ['en'],
        },
      ],
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
      'Multi-business SaaS',
      'WiFi voucher management',
      'RADIUS authentication',
      'Self-onboarding for WiFi operators',
      'Kampala Uganda hotspot billing',
      'Automated session management',
      'Mobile money collection',
    ],
    screenshot: `${SITE_URL}${BRAND_LOGO}`,
  }

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href={FAVICON} type="image/svg+xml" />
        <link rel="shortcut icon" href={FAVICON} type="image/svg+xml" />
        <link rel="apple-touch-icon" href={BRAND_MARK} />
        <link rel="llms" href="/llms.txt" type="text/plain" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'LocalBusiness',
              '@id': `${SITE_URL}/#local-business`,
              name: 'AROSOFT Innovations Ltd',
              alternateName: 'AROFi',
              description: 'Uganda\'s leading WiFi hotspot billing platform with MTN MoMo and Airtel Money integration for MikroTik operators.',
              url: SITE_URL,
              logo: {
                '@type': 'ImageObject',
                url: `${SITE_URL}${BRAND_MARK}`,
                width: 260,
                height: 220,
              },
              image: `${SITE_URL}${BRAND_LOGO}`,
              telephone: '+256787726388',
              email: 'support@arofi.net',
              address: {
                '@type': 'PostalAddress',
                streetAddress: 'Kampala',
                addressLocality: 'Kampala',
                addressRegion: 'Central Region',
                addressCountry: 'UG',
              },
              geo: {
                '@type': 'GeoCoordinates',
                latitude: 0.3476,
                longitude: 32.5825,
              },
              areaServed: [
                { '@type': 'Country', name: 'Uganda' },
                { '@type': 'AdministrativeArea', name: 'East Africa' },
              ],
              openingHoursSpecification: {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                opens: '00:00',
                closes: '23:59',
              },
              priceRange: 'Free - UGX 20,000/month',
              sameAs: ['https://arosoftlabs.com'],
            }),
          }}
        />
      </head>
      <body>
        {children}
        <CookieConsent />
        <PwaInstallPrompt appName="AROFi Admin" />
        <DeferredChatWidget />
      </body>
    </html>
  )
}
