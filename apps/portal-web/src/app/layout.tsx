import './globals.css'
import type { Metadata, Viewport } from 'next'
import PortalThemeToggle from './PortalThemeToggle'

const SITE_URL = 'https://arofi.net/portal'
const TITLE = 'AroFi WiFi Portal – Internet Packages, Vouchers & Mobile Money'
const DESCRIPTION =
  'Connect to WiFi, choose an internet package, redeem a voucher, and pay using supported payment methods. Secure hotspot access powered by AroFi for African WiFi and ISP operators.'

const FAVICON = '/brand-assets/arofi-app-icon.png'
const MARK = '/brand-assets/arofi-app-icon.png'
const LOGO = '/brand-assets/arofi-logo.png'

export const metadata: Metadata = {
  metadataBase: new URL('https://arofi.net'),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'AroFi portal', 'WiFi hotspot portal', 'buy WiFi package', 'WiFi voucher',
    'hotspot login Africa', 'WiFi login Uganda', 'WiFi packages Uganda',
    'mobile money WiFi', 'MTN MoMo WiFi', 'Airtel Money WiFi',
    'ISP customer portal Africa', 'captive portal Africa',
  ],
  authors: [{ name: 'AROSOFT Innovations Ltd', url: 'https://arosoftlabs.com' }],
  creator: 'AROSOFT Innovations Ltd',
  publisher: 'AROSOFT Innovations Ltd',
  manifest: '/portal/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'AroFi Portal',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: FAVICON, type: 'image/png' }],
    apple: MARK,
    shortcut: FAVICON,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: SITE_URL,
    locale: 'en_UG',
    siteName: 'AroFi WiFi Portal',
    images: [{
      url: `https://arofi.net${LOGO}`,
      width: 1200,
      height: 500,
      alt: 'AroFi WiFi and hotspot portal',
    }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: [`https://arofi.net${MARK}`],
  },
  alternates: { canonical: SITE_URL },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1 },
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F7F9' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0805' },
  ],
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

  return (
    <html lang="en" data-accent-theme="green" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href={FAVICON} type="image/png" />
        <link rel="shortcut icon" href={FAVICON} type="image/png" />
        <link rel="apple-touch-icon" href={MARK} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'AroFi WiFi Portal',
              url: SITE_URL,
              description: DESCRIPTION,
              applicationCategory: 'UtilitiesApplication',
              operatingSystem: 'Web',
              image: `https://arofi.net${LOGO}`,
              provider: {
                '@type': 'Organization',
                name: 'AROSOFT Innovations Ltd',
                url: 'https://arosoftlabs.com',
                logo: `https://arofi.net${MARK}`,
              },
            }),
          }}
        />
      </head>
      <body className="antialiased">
        <PortalThemeToggle />
        <main className="min-h-screen">
          <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6">
            {children}
            <p className="pb-6 pt-10 text-center">
              <a
                href="https://arosoftlabs.com"
                target="_blank"
                rel="noreferrer"
                className="portal-powered-by"
              >
                <img src={MARK} alt="" aria-hidden="true" />
                Powered by AroFi · AROSOFT Innovations Ltd
              </a>
            </p>
          </div>
        </main>
      </body>
    </html>
  )
}
