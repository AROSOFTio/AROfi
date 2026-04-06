import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AROFi Portal – High-speed Internet Access',
  description: 'Buy hotspot packages securely and get connected instantly.',
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
        <main className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111827] rounded-2xl shadow-xl border border-[#1f2d45] p-8">
            <div className="flex justify-center mb-6">
              <img src="/logo.png" alt="AROFi" className="h-12 w-auto" />
            </div>
            {children}
          </div>
          <p className="mt-8 text-slate-500 text-sm text-center">
            Powered by AROSOFT Innovations Ltd
          </p>
        </main>
      </body>
    </html>
  )
}
