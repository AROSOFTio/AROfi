import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { CheckCircle2, Globe, Smartphone, Terminal, Wifi } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import DocsCommandBlock from '@/components/DocsCommandBlock'

export const metadata: Metadata = {
  // Per-router capability link — never index this.
  robots: { index: false, follow: false },
}

type MobileSetupSummary = {
  routerName: string
  tenantName: string
  host: string
  oneRunCommand: string
}

export default async function MobileSetupPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const summary = await fetchApi<MobileSetupSummary>(`/mikrotik/mobile-setup/${key}`)

  if (!summary) {
    notFound()
  }

  const webfigUrl = `http://${summary.host}`

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
          <Smartphone className="h-4 w-4" />
          Phone setup — no laptop needed
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{summary.routerName}</h1>
        <p className="mt-1 text-sm text-slate-500">{summary.tenantName}</p>

        <ol className="mt-8 space-y-7">
          <Step number={1} icon={<Wifi className="h-4 w-4" />} title="Connect to the router">
            Join this router&apos;s WiFi, or connect your phone to its network. If it&apos;s brand new with no WiFi broadcasting yet, you&apos;ll need a USB-to-Ethernet adapter for your phone.
          </Step>

          <Step number={2} icon={<Globe className="h-4 w-4" />} title="Open WebFig">
            <a
              href={webfigUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm active:scale-[0.98]"
            >
              Open {webfigUrl}
            </a>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              If that doesn&apos;t load, try{' '}
              <span className="font-mono text-slate-700">http://192.168.88.1</span> — the
              factory-default address on a brand-new router. Log in with the router&apos;s admin
              username and password.
            </p>
          </Step>

          <Step number={3} icon={<Terminal className="h-4 w-4" />} title="Open Terminal, paste this">
            <DocsCommandBlock title="One-run setup command" commands={[summary.oneRunCommand]} />
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              In WebFig&apos;s left menu, find <span className="font-semibold text-slate-700">Terminal</span> (usually
              near the bottom, under System). Tap the command above to copy it, paste it into
              the terminal, and press Enter.
            </p>
          </Step>

          <Step number={4} icon={<CheckCircle2 className="h-4 w-4" />} title="Wait for confirmation">
            The router prints its own progress and ends with a success line. Nothing else to do
            on this device after that.
          </Step>
        </ol>

        <div className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
          Prefer a laptop?{' '}
          <Link href="/docs/start-here" className="font-semibold text-blue-600 underline">
            See the WinBox guide
          </Link>
        </div>
      </div>
    </main>
  )
}

function Step({
  number,
  icon,
  title,
  children,
}: {
  number: number
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex gap-3">
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
        {number}
      </div>
      <div className="flex-1 pt-0.5">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          {icon}
          {title}
        </div>
        <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{children}</div>
      </div>
    </li>
  )
}
