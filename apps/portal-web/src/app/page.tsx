import Link from 'next/link'
import type { ReactNode } from 'react'
import { Wifi, ShieldCheck, Router, ArrowRight } from 'lucide-react'

export default function PortalPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl flex-col justify-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <img src="/logo.png" alt="AROFi" className="h-9 w-auto" />
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
          AROFi WiFi Billing
        </p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
          Open your WiFi login page from the hotspot network.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
          This public page does not show tenant packages. Customer packages load only from a tenant link,
          QR code, or MikroTik captive portal such as <span className="font-semibold text-slate-900">tenantname.wifi/login</span>.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <InfoCard icon={<Wifi className="h-5 w-5" />} title="Customers" text="Connect to the WiFi network and open the login screen shown by the router." />
          <InfoCard icon={<Router className="h-5 w-5" />} title="Operators" text="Use your AROFi dashboard to manage routers, packages, vouchers, and payments." />
          <InfoCard icon={<ShieldCheck className="h-5 w-5" />} title="Safe Routing" text="AROFi will not guess a tenant catalog on the public portal URL." />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href="https://arofi.net" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
            Visit AROFi Website
            <ArrowRight className="h-4 w-4" />
          </a>
          <Link href="/login" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            Customer Login
          </Link>
        </div>
      </section>
    </main>
  )
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{icon}</div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}
