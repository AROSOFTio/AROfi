import './globals.css'
import type { Metadata, Viewport } from 'next'
import PwaInstallPrompt from '../components/PwaInstallPrompt'

export const metadata: Metadata = {
  title: 'AROFi Portal - High-speed Internet Access',
  description: 'Buy hotspot packages securely with mobile money and get connected instantly.',
  manifest: '/portal/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'AROFi Portal',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#16a34a',
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
      </head>
      <body className="bg-slate-50 text-slate-950 antialiased">
        <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc,_#eefdf3)]">
          <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6">
            {children}
            <p className="pb-20 pt-10 text-center text-xs tracking-[0.18em] text-slate-500 sm:pb-6">
              Powered by{' '}
              <a
                href="https://arosoft.io"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-emerald-700 hover:underline"
              >
                AROSOFT Innovations Ltd
              </a>
            </p>
          </div>
          <PwaInstallPrompt appName="AROFi Portal" />
        </main>
      </body>
    </html>
  )
}
