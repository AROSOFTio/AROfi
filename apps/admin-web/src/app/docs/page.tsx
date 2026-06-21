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
  Coins, 
  ShieldAlert,
  Building,
  DollarSign
} from 'lucide-react'

// Define the categorized documentation pages
const categories = [
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
        title: 'How to Setup MTN MoMo & Airtel Money WiFi Billing',
        slug: 'setup-mtn-airtel-wifi-billing',
        badge: 'Technical Guide',
        keywords: 'setup mtn wifi billing, airtel mobile money billing, mikrotik momo'
      }
    ]
  },
  {
    title: 'Getting Started & Hardware',
    description: 'Set up your MikroTik router and connect it to AROFi cloud billing.',
    icon: Wifi,
    pages: [
      { title: 'Getting started checklist', slug: 'getting-started', keywords: 'register mikrotik, first setup, connection guide' },
      { title: 'Winbox setup & login configuration', slug: 'winbox-setup', keywords: 'winbox download, routeros terminal, change admin password' },
      { title: 'Router onboarding step-by-step', slug: 'router-onboarding', keywords: 'router api port, secure api, register routeros' }
    ]
  },
  {
    title: 'Billing & Mobile Money',
    description: 'Accept MTN MoMo and Airtel Money, manage wallets and payouts.',
    icon: CreditCard,
    pages: [
      { title: 'Payments system overview', slug: 'payments', keywords: 'payment status checks, automated activation, redirect gateway' },
      { title: 'MTN MoMo payments configuration', slug: 'mtn-payments', keywords: 'momo api client, subscription key, target environment' },
      { title: 'Airtel Money integration guide', slug: 'airtel-payments', keywords: 'airtel developer client, client secret, public key' },
      { title: 'Disbursements & vendor withdrawals', slug: 'disbursements', keywords: 'disburse to phone, wallet withdraw, payout limits' },
      { title: 'Commissions and platform rates', slug: 'commissions', keywords: 'agent commission, platform fee, accrued revenue' }
    ]
  },
  {
    title: 'Captive Portal & Management',
    description: 'Customize the user checkout screen and hotspot packages.',
    icon: Settings,
    pages: [
      { title: 'Captive portal customization', slug: 'captive-portal', keywords: 'walled garden hosts, pesapal testing, light shell loading' },
      { title: 'Packages and voucher printing', slug: 'packages-and-vouchers', keywords: 'speed limits, data limits, print pdf vouchers, voucher batch' }
    ]
  },
  {
    title: 'Support & Troubleshooting',
    description: 'Diagnose connection failures, accounting logs, and offline routers.',
    icon: ShieldAlert,
    pages: [
      { title: 'Troubleshooting guide', slug: 'troubleshooting', keywords: 'paid but not connected, dns resolving error, status check fail' },
      { title: 'Frequently Asked Questions (FAQ)', slug: 'faq', keywords: 'winbox password lost, check callback url, radius server host' }
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
    <main className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-blue-500 selection:text-white pb-20">
      {/* Background Dot grid effect */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Navigation Header */}
      <nav className="relative z-10 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">AROFi Systems Live</span>
          </div>
        </div>
      </nav>

      {/* Hero Banner Section */}
      <header className="relative z-10 mx-auto max-w-4xl text-center px-6 pt-16 pb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-400 mb-6">
          <BookOpen className="w-3.5 h-3.5" />
          Technical Documentation Portal
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-blue-400 bg-clip-text text-transparent">
          WiFi Billing, Payments &amp; MikroTik Setup
        </h1>
        <p className="mt-4 text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Learn how to set up automated MTN MoMo &amp; Airtel Money billing, configure MikroTik RADIUS servers, print vouchers, and start a profitable wireless hotspot business in Uganda.
        </p>

        {/* Live Client Search bar */}
        <div className="mt-8 max-w-lg mx-auto relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-400 transition-colors">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            placeholder="Search guides (e.g. MTN setup, start wifi, vouchers)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition shadow-lg"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-300 px-2 py-1 bg-slate-700/50 rounded"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* Main Categories Section */}
      <section className="relative z-10 mx-auto max-w-5xl px-6">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-16 bg-slate-800/40 rounded-2xl border border-slate-800">
            <HelpCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-300">No guides found matching &quot;{searchQuery}&quot;</h3>
            <p className="text-slate-500 text-sm mt-1">Try searching for alternative terms like &quot;MTN&quot;, &quot;Airtel&quot;, &quot;Router&quot;, or &quot;Voucher&quot;.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {filteredCategories.map((category) => {
              const Icon = category.icon
              return (
                <div key={category.title} className="bg-slate-800/30 rounded-2xl border border-slate-800/80 p-6 md:p-8 backdrop-blur-sm">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">{category.title}</h2>
                      <p className="text-sm text-slate-400 mt-1">{category.description}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {category.pages.map((page) => (
                      <Link 
                        key={page.slug} 
                        href={`/docs/${page.slug}`} 
                        className="group flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm hover:border-blue-500/40 hover:bg-slate-900 transition duration-200"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            {page.badge && (
                              <span className="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full">
                                {page.badge}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-slate-200 group-hover:text-white transition">
                            {page.title}
                          </h3>
                        </div>
                        <div className="mt-4 flex items-center text-xs font-semibold text-blue-400 group-hover:text-blue-300 transition">
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

      {/* SEO Uganda Search Keywords Section (Hidden to normal view, fully crawlable) */}
      <div className="sr-only" aria-hidden="true">
        <h2>Start WiFi Internet Hotspot Business in Kampala, Uganda</h2>
        <p>
          AROFi makes starting a WiFi reseller business simple. Register a free account, connect your MikroTik router (RB951, hEX S, CCR2004) to our cloud platform using a single console command. Sell WiFi vouchers and collect money automatically via MTN MoMo and Airtel Money.
        </p>
        <h3>How to Setup MikroTik Mobile Money Billing</h3>
        <p>
          Integrate MTN Mobile Money collection APIs with your MikroTik HotSpot captive portal. Customers type their telephone numbers, complete USSD STK PIN popups, and get authenticated via AROFi RADIUS servers automatically.
        </p>
      </div>
    </main>
  )
}

