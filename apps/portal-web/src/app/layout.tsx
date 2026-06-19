import './globals.css'
import type { Metadata, Viewport } from 'next'
import PwaInstallPrompt from '../components/PwaInstallPrompt'

const SITE_URL = 'https://arofi.arosoftlabs.com/portal'
const TITLE = 'AROFi WiFi Portal – Buy Internet Access | MTN MoMo & Airtel Money Uganda'
const DESCRIPTION =
  'Connect to high-speed WiFi instantly. Pay with MTN Mobile Money or Airtel Money. No app needed — just your phone number. Secure hotspot access powered by AROFi, Uganda\'s leading WiFi billing platform.'

export const metadata: Metadata = {
  metadataBase: new URL('https://arofi.arosoftlabs.com'),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'buy wifi Uganda', 'pay for wifi Uganda', 'wifi hotspot Uganda',
    'MTN MoMo wifi payment', 'Airtel Money wifi payment', 'pay wifi mobile money',
    'internet access Uganda', 'hotspot internet Uganda', 'wifi voucher Uganda',
    'buy wifi Kampala', 'connect to wifi Kampala', 'public wifi Uganda',
    'pay for internet with MTN', 'pay for internet with Airtel',
    'AROFi portal', 'hotspot login Uganda', 'wifi login Uganda',
    'wifi packages Uganda', 'cheap wifi Uganda', 'affordable internet Uganda',
  ].join(', '),
  authors: [{ name: 'AROSOFT Innovations Ltd', url: 'https://arosoftlabs.com' }],
  creator: 'AROSOFT Innovations Ltd',
  publisher: 'AROSOFT Innovations Ltd',
  manifest: '/portal/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'AROFi Portal',
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
    siteName: 'AROFi WiFi Portal',
    images: [
      {
        url: 'https://arofi.arosoftlabs.com/logo.png',
        width: 512,
        height: 512,
        alt: 'AROFi – Buy WiFi with Mobile Money Uganda',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['https://arofi.arosoftlabs.com/logo.png'],
  },
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'AROFi WiFi Portal',
              url: SITE_URL,
              description: DESCRIPTION,
              applicationCategory: 'UtilitiesApplication',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                priceCurrency: 'UGX',
                description: 'Pay for WiFi access with MTN MoMo or Airtel Money',
              },
              provider: {
                '@type': 'Organization',
                name: 'AROSOFT Innovations Ltd',
                url: 'https://arosoftlabs.com',
              },
            }),
          }}
        />
      </head>
      <body className="bg-slate-50 text-slate-950 antialiased">
        <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc,_#eefdf3)]">
          <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6">
            {children}
            <p className="pb-20 pt-10 text-center sm:pb-6">
              <a
                href="https://arosoftlabs.com"
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textDecoration: 'none', letterSpacing: '0.04em' }}
              >
                <img src="/logo.png" alt="" aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 2, objectFit: 'contain' }} />
                AROSOFT
              </a>
            </p>
          </div>
          <PwaInstallPrompt appName="AROFi Portal" />
        </main>
      </body>
    </html>
  )
}
