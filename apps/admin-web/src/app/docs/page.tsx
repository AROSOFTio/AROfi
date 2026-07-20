'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  Search,
  Wifi,
  CreditCard,
  ArrowLeft,
  HelpCircle,
  Settings,
  ShieldAlert,
  Building,
  ShieldCheck,
} from 'lucide-react'

type DocLink = {
  title: string
  slug: string
  keywords: string
  badge?: string
}

type DocCategory = {
  title: string
  description: string
  icon: typeof Building
  pages: DocLink[]
}

// Define the categorized documentation pages. Keep this in sync with the
// `docs` object in [slug]/page.tsx — every slug here must exist there, and
// every slug there should be reachable from here (or intentionally hidden).
const categories: DocCategory[] = [
  {
    title: 'WiFi Business & Startups',
    description: 'Learn how to launch and scale a wireless hotspot business in Uganda.',
    icon: Building,
    pages: [
      {
        title: 'How to Start a WiFi Hotspot Business in Uganda (Complete 2026 Guide)',
        slug: 'how-to-start-wifi-business-uganda',
        badge: 'Recommended',
        keywords: 'start wifi business uganda, sell internet kampala, hotspot business guide'
      },
      {
        title: 'How to Accept MTN MoMo & Airtel Money on Your Hotspot',
        slug: 'setup-mtn-airtel-wifi-billing',
        badge: 'Billing Guide',
        keywords: 'setup mtn wifi billing, airtel mobile money billing, mikrotik momo, withdraw wallet'
      },
      {
        title: 'How to Block Hotspot Sharing/Tethering on MikroTik RouterOS',
        slug: 'block-hotspot-sharing-tethering',
        badge: 'Security',
        keywords: 'block hotspot sharing, prevent tethering, mikrotik change ttl, anti tethering'
      }
    ]
  },
  {
    title: 'Getting Started & Hardware',
    description: 'Set up your MikroTik router and connect it to AROFi cloud billing.',
    icon: Wifi,
    pages: [
      { title: 'Getting started checklist', slug: 'getting-started', keywords: 'register mikrotik, first setup, connection guide' },
      { title: 'Remote WinBox Access', slug: 'remote-winbox', keywords: 'remote winbox, open port, remote setup' },
      { title: 'Winbox setup & login configuration', slug: 'winbox-setup', keywords: 'winbox download, routeros terminal, change admin password' },
    ]
  },
  {
    title: 'Billing & Mobile Money',
    description: 'Accept Mobile Money, manage wallets, withdrawals, and commissions.',
    icon: CreditCard,
    pages: [
      { title: 'Payments system overview', slug: 'payments', keywords: 'payment status checks, automated activation, yo uganda, radius disconnect' },
      { title: 'Disbursements & business withdrawals', slug: 'disbursements', keywords: 'disburse to phone, wallet withdraw, payout limits, withdrawal secret' },
      { title: 'Commissions and platform rates', slug: 'commissions', keywords: 'agent commission, platform fee, accrued revenue' }
    ]
  },
  {
    title: 'Compliance & Operations',
    description: 'Business verification, reseller point of sale, notifications, and reports.',
    icon: ShieldCheck,
    pages: [
      { title: 'Business Compliance', slug: 'business-compliance', keywords: 'kyc, business verification, compliance review, approved rejected' },
      { title: 'Agent PoS & Resellers', slug: 'agent-pos', keywords: 'register agent, sell voucher, point of sale, reseller commission' },
      { title: 'Notifications', slug: 'notifications', keywords: 'notification bell, attachments, dev admin broadcast' },
      { title: 'Reports', slug: 'reports', keywords: 'export csv excel pdf, sales report, disbursement report, voucher report' }
    ]
  },
  {
    title: 'Captive Portal & Management',
    description: 'Customize the user checkout screen and hotspot packages.',
    icon: Settings,
    pages: [
      { title: 'Captive portal customization', slug: 'captive-portal', keywords: 'walled garden hosts, light shell loading' },
      { title: 'Packages and voucher printing', slug: 'packages-and-vouchers', keywords: 'speed limits, data limits, print pdf vouchers, voucher batch' }
    ]
  },
  {
    title: 'Support & Troubleshooting',
    description: 'Diagnose connection failures, accounting logs, and offline routers.',
    icon: ShieldAlert,
    pages: [
      { title: 'Troubleshooting guide', slug: 'troubleshooting', keywords: 'paid but not connected, dns resolving error, status check fail, stuck logged in' },
      { title: 'Frequently Asked Questions (FAQ)', slug: 'faq', keywords: 'winbox password lost, check callback url, radius server host, withdrawal blocked' }
    ]
  }
]

export default function DocsIndexPage() {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter categories and pages based on search input
  const filteredCategories = categories.map(category => {
    const matchingPages = category.pages.filter(page => 
      page.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (page.keywords && page.keywords.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    return { ...category, pages: matchingPages }
  }).filter(category => category.pages.length > 0)

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white pb-20 relative overflow-hidden">
      {/* Background Dot grid effect - light mode compatible */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Navigation Header */}
      <nav className="relative z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">AROFi Systems Live</span>
          </div>
        </div>
      </nav>

      {/* Hero Banner Section */}
      <header className="relative z-10 mx-auto max-w-4xl text-center px-6 pt-16 pb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-blue-600 mb-6">
          <BookOpen className="w-3.5 h-3.5" />
          Technical Documentation Portal
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
          WiFi Billing, Payments &amp; MikroTik Setup
        </h1>
        <p className="mt-4 text-base md:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Learn how automated Mobile Money billing, MikroTik RADIUS setup, voucher printing, business compliance, and reseller point of sale actually work on AROFi.
        </p>

        {/* Search bar */}
        <div className="mt-8 max-w-lg mx-auto relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            placeholder="Search guides (e.g. MTN setup, start wifi, vouchers)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition shadow-sm"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 bg-slate-100 rounded"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* Main Categories Section */}
      <section className="relative z-10 mx-auto max-w-5xl px-6">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <HelpCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">No guides found matching &quot;{searchQuery}&quot;</h3>
            <p className="text-slate-500 text-sm mt-1">Try searching for alternative terms like &quot;MTN&quot;, &quot;Airtel&quot;, &quot;Router&quot;, or &quot;Voucher&quot;.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredCategories.map((category) => {
              const Icon = category.icon
              return (
                <div key={category.title} className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{category.title}</h2>
                      <p className="text-sm text-slate-500 mt-1">{category.description}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {category.pages.map((page) => (
                      <Link 
                        key={page.slug} 
                        href={`/docs/${page.slug}`} 
                        className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-5 hover:border-blue-500 hover:bg-white transition duration-200"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            {page.badge && (
                              <span className="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-blue-50 border border-blue-100 text-blue-600 rounded-full">
                                {page.badge}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-slate-800 group-hover:text-blue-600 transition">
                            {page.title}
                          </h3>
                        </div>
                        <div className="mt-4 flex items-center text-xs font-bold text-blue-600 group-hover:text-blue-700 transition">
                          Read Guide &rarr;
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* SEO Uganda Search Keywords Section */}
      <div className="sr-only" aria-hidden="true">
        <h2>Start a WiFi Internet Hotspot Business in Kampala, Uganda</h2>
        <p>
          AROFi makes starting a WiFi hotspot business simple. Register a free account, connect your MikroTik router (RB951, hEX S, CCR2004) to AROFi using a single generated setup command, then sell WiFi access and collect payment automatically via MTN Mobile Money and Airtel Money.
        </p>
        <h3>How to Set Up MikroTik Mobile Money Billing</h3>
        <p>
          AROFi connects Mobile Money collection to your MikroTik HotSpot captive portal. Customers enter their phone number, confirm on a Mobile Money PIN prompt, and are connected to the internet automatically once payment is confirmed.
        </p>
      </div>
    </main>
  )
}
