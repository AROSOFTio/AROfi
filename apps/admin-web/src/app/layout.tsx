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

export const metadata: Metadata = {
  title: 'AROFi – Hotspot Billing & Network Management',
  description: 'Enterprise hotspot billing and network management by AROSOFT Innovations Ltd.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'AROFi Admin',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'AROFi – Hotspot Billing & Network Management',
    description: 'Enterprise hotspot billing and network management by AROSOFT Innovations Ltd.',
    type: 'website',
    locale: 'en_UG',
    siteName: 'AROFi',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#155DFC',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${inter.variable}`}>
      <head>
        <link rel="icon" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        {/* Resource hints — warm up API and CDN connections */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <PwaInstallPrompt appName="AROFi Admin" />
      </body>
    </html>
  )
}
