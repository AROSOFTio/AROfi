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
      <body className="antialiased">
        <main className="min-h-screen bg-[#050914] bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_38%),linear-gradient(180deg,_#081120,_#050914)] flex flex-col items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-xl rounded-[28px] border border-[#1f2d45] bg-[#0f172a]/90 p-6 shadow-2xl backdrop-blur sm:p-8">
            <div className="mb-6 flex justify-center">
              <img src="/logo.png" alt="AROFi" className="h-12 w-auto" />
            </div>
            {children}
          </div>
          <p className="mt-8 text-center text-sm text-slate-500">
            Powered by AROSOFT Innovations Ltd
          </p>
        </main>
      </body>
    </html>
  )
}
