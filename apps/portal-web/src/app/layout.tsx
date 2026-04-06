import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AROFi Portal',
  description: 'Buy Hotspot Packages Options securely',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen bg-slate-50 flex flex-col items-center py-10">
          <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <h1 className="text-center text-2xl font-bold text-blue-600 mb-6">AROFi Hotspot</h1>
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
