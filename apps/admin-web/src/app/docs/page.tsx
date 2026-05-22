import Link from 'next/link'

const pages = [
  ['Getting started', 'getting-started'],
  ['Payments', 'payments'],
  ['MTN payments', 'mtn-payments'],
  ['Airtel payments', 'airtel-payments'],
  ['Disbursements', 'disbursements'],
  ['Commissions', 'commissions'],
  ['Router onboarding', 'router-onboarding'],
  ['Winbox setup', 'winbox-setup'],
  ['Captive portal', 'captive-portal'],
  ['Packages and vouchers', 'packages-and-vouchers'],
  ['Troubleshooting', 'troubleshooting'],
  ['FAQ', 'faq'],
]

export default function DocsIndexPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">AROfi Docs</p>
        <h1 className="mt-3 text-4xl font-bold">WiFi billing, payments, and MikroTik setup</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          AROfi sells hotspot packages through a captive portal, collects MTN and Airtel Mobile Money, activates internet only after confirmed payment, and supports vendor payouts through approved disbursements.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map(([title, slug]) => (
            <Link key={slug} href={`/docs/${slug}`} className="rounded-lg border border-slate-200 bg-white p-4 font-semibold text-slate-800 shadow-sm hover:border-emerald-400">
              {title}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
