import './globals.css'
import type { Metadata, Viewport } from 'next'
import PwaInstallPrompt from '@/components/PwaInstallPrompt'

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
}

export const viewport: Viewport = {
  themeColor: '#2db879',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <PwaInstallPrompt appName="AROFi Admin" />
      </body>
    </html>
  )
}
