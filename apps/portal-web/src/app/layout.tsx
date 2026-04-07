import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AROFi Portal - High-speed Internet Access',
  description: 'Buy hotspot packages securely with mobile money and get connected instantly.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
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
      <body className="bg-[#020817] text-slate-100 antialiased">
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_34%),radial-gradient(circle_at_bottom,_rgba(14,165,233,0.08),_transparent_28%),linear-gradient(180deg,_#07101f,_#020817)]">
          <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6">
            {children}
            <p className="pb-20 pt-10 text-center text-xs tracking-[0.18em] text-slate-500 sm:pb-6">
              Powered by AROSOFT Innovations Ltd
            </p>
          </div>
        </main>
      </body>
    </html>
  )
}
