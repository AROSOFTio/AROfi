import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AROFi Admin Dashboard',
  description: 'Hotspot Billing & Network Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-50">
          {/* Sidebar */}
          <aside className="w-64 bg-slate-800 border-r border-slate-700 hidden md:flex flex-col">
            <div className="p-6">
              <h1 className="text-2xl font-bold tracking-wider text-blue-500">AROFi</h1>
              <p className="text-xs text-slate-400">Admin Portal</p>
            </div>
            <nav className="flex-1 px-4 space-y-2 mt-4">
              <a href="#" className="block px-4 py-2 rounded bg-blue-600/20 text-blue-400 font-medium">Dashboard</a>
              <a href="#" className="block px-4 py-2 rounded hover:bg-slate-700/50 text-slate-300">Hotspots</a>
              <a href="#" className="block px-4 py-2 rounded hover:bg-slate-700/50 text-slate-300">Users</a>
              <a href="#" className="block px-4 py-2 rounded hover:bg-slate-700/50 text-slate-300">Billing</a>
            </nav>
          </aside>
          
          {/* Main content */}
          <main className="flex-1 overflow-y-auto w-full">
            <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center px-6">
              <h2 className="text-lg font-semibold">Dashboard</h2>
            </header>
            <div className="p-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}
