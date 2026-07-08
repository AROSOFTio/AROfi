'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  BadgeDollarSign,
  Bell,
  Check,
  ChevronDown,
  Clock,
  Layers,
  Mail,
  MapPin,
  Phone,
  QrCode,
  Radio,
  Router,
  ShieldCheck,
  Ticket,
  Timer,
  Users,
  Wifi,
  Zap,
} from 'lucide-react'
import { RegisterModal } from '@/components/RegisterModal'
import { getAppLoginUrl } from '@/lib/admin-session'

const SHOW_PRICING = true

const whyPoints = [
  { stat: 'UGX 0', label: 'To get started', text: 'Register free and start billing today — no setup fee, no contract.' },
  { stat: '<5 min', label: 'Router onboarding', text: 'Paste one RouterOS command and your hotspot is billing customers.' },
  { stat: '24/7', label: 'Automated collection', text: 'MTN MoMo & Airtel Money payments post to your wallet around the clock.' },
  { stat: '256', label: 'Built for Uganda', text: 'Local mobile money rails, local support, local currency — no workarounds.' },
]

const features = [
  { icon: BadgeDollarSign, title: 'MTN MoMo & Airtel Money', text: 'Customers pay straight from their phone. Payments post to your wallet automatically.' },
  { icon: Ticket, title: 'Beautiful Voucher Templates', text: 'Branded, print-ready voucher batches for field agents and walk-in customers.' },
  { icon: QrCode, title: 'QR Code Scan & Connect', text: 'Guests scan a QR code to connect and pay — no typing WiFi passwords.' },
  { icon: Clock, title: '24/7 Support', text: 'Real people on chat, WhatsApp, phone and email — every day, all day.' },
  { icon: Bell, title: 'Instant Alerts', text: 'Get an email the moment a router goes offline, so you fix it before customers notice.' },
  { icon: Layers, title: 'Multi-Device Bundles', text: 'Sell packages that cover several devices per customer on one payment.' },
  { icon: ShieldCheck, title: 'Bank-Grade Security', text: 'Encrypted payments, isolated tenants, and secret-key protected withdrawals.' },
  { icon: Zap, title: 'Instant Withdrawals', text: 'Cash out to your approved mobile money number the moment you need it.' },
  { icon: Router, title: 'Add Multiple Routers', text: 'Run one hotspot or fifty — every MikroTik router lives in one dashboard.' },
  { icon: Wifi, title: 'Remote Router Access', text: 'Reach any router from anywhere over our secure VPN tunnel — no port forwarding, no static IP.' },
  { icon: Timer, title: 'Live Session Tracking', text: 'See who is online, for how long, and how much they have paid — in real time.' },
  { icon: Users, title: 'Multi-Tenant · Self-Onboard', text: 'Every operator gets an isolated branded portal. No IT team needed.' },
]

const faqs = [
  {
    q: 'Is AROFi really free to start?',
    a: 'Yes. The Starter plan has no monthly fee and no setup cost — you only ever pay a small percentage on payments that actually go through. There is no free trial that expires; Starter stays free.',
  },
  {
    q: 'How do I get paid?',
    a: 'Every sale — mobile money or voucher — lands in your AROFi wallet automatically. Withdraw to your approved MTN or Airtel number whenever you like; approved withdrawals are processed instantly.',
  },
  {
    q: 'Which routers work with AROFi?',
    a: 'Any MikroTik RouterOS device — RB951Ui, hAP ac², CCR, CHR and more. Paste one setup command from your dashboard and the router starts authenticating and billing through AROFi.',
  },
  {
    q: 'Can I manage a router that isn’t on-site?',
    a: 'Yes — every router connects out to AROFi over a secure VPN tunnel, so you can reach its WinBox console remotely (e.g. arofi.net:3081) without opening ports or needing a static IP.',
  },
  {
    q: 'What happens if my router goes offline?',
    a: 'You get an instant email notification so you can act before customers complain. Router health is also visible live on your dashboard.',
  },
  {
    q: 'Is my money and customer data safe?',
    a: 'Every tenant is fully isolated, payments are encrypted end-to-end, and withdrawals require a separate secret code on top of your login — so a leaked password alone can’t move funds.',
  },
  {
    q: 'How many routers or hotspot sites can I run?',
    a: 'Starter supports up to 5 routers, Pro up to 10, and Enterprise is unlimited. You can upgrade anytime as you grow.',
  },
  {
    q: 'Do you support vouchers as well as mobile money?',
    a: 'Yes — print branded voucher batches for agents or walk-in customers, redeemable by code or QR scan, alongside live MTN MoMo and Airtel Money collection.',
  },
]

const CONTACT_PHONE = '256787726388'
const CONTACT_PHONE_DISPLAY = '+256 787 726 388'
const CONTACT_EMAIL = 'support@arofi.net'

// Mirrors SUBSCRIPTION_PLAN_CATALOG in apps/api/src/modules/subscription/subscription.service.ts
// — keep these in sync if the plans/commission rates ever change there.
const pricingTiers = [
  {
    key: 'FREE',
    name: 'Starter',
    priceUgx: 0,
    period: null,
    commissionSummary: '8% Mobile Money · 2% Voucher',
    routerLimit: 'Up to 5 Routers/Hotspots',
    features: ['Cloud WinBox Tunnels', 'Free Analytics', 'AROFi branding'],
    featured: false,
  },
  {
    key: 'PRO',
    name: 'Pro',
    priceUgx: 20000,
    period: '/month',
    commissionSummary: '4% Mobile Money · 0% Voucher',
    routerLimit: 'Up to 10 Routers/Hotspots',
    features: ['Cloud WinBox Tunnels', 'Custom Branding', '30-day analytics history'],
    featured: true,
  },
  {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    priceUgx: 70000,
    period: '/month',
    commissionSummary: '1.6% MM gateway fee · 0% platform fee',
    routerLimit: 'Unlimited Routers/Hotspots',
    features: ['Cloud WinBox Tunnels', 'Custom Domains & SSL', 'Custom SMS Gateway API', 'Priority Support'],
    featured: false,
  },
]

// Decorative, illustrative figures for the hero preview — not live data.
const demoBars = [38, 52, 41, 64, 58, 79, 92]
const demoFeed = [
  { who: 'MoMo payment', plan: '4 HR', amount: 'UGX 1,500' },
  { who: 'Voucher redeemed', plan: '1 HR', amount: 'UGX 500' },
  { who: 'New session', plan: 'Mutungo Hill', amount: 'live' },
  { who: 'Airtel payment', plan: '24 HR', amount: 'UGX 4,000' },
  { who: 'Router online', plan: 'RB951Ui', amount: 'healthy' },
]

function useCountUp(target: number, durationMs = 1400) {
  const [value, setValue] = useState(0)
  const raf = useRef<number | undefined>(undefined)
  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, durationMs])
  return value
}

export default function RootPage() {
  const [registerOpen, setRegisterOpen] = useState(false)
  const [feedIndex, setFeedIndex] = useState(0)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const revenue = useCountUp(284500)
  const sessions = useCountUp(126)
  const routers = useCountUp(18)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('register') === '1') {
      setRegisterOpen(true)
      window.history.replaceState(null, '', '/')
    }
    if (params.get('login') === '1') {
      window.location.href = getAppLoginUrl()
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setFeedIndex((i) => (i + 1) % demoFeed.length), 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <main className="home-shell">
      <nav className="home-nav">
        {/* Logo only — hide text when logo is present */}
        <div className="home-brand">
          <img src="/logo.png" alt="AROFi" />
          <span className="home-brand-text" aria-hidden="true">AROFi</span>
        </div>
        <div className="home-nav-links">
          <a href="#features">Features</a>
          {SHOW_PRICING && <a href="#pricing">Pricing</a>}
          <a href="#faq">FAQ</a>
          <a href="#contact">Contact</a>
          <Link href="/blog">Blog</Link>
        </div>
        <div className="home-actions">
          <Link href="/docs" className="btn btn-ghost">Docs</Link>
          <a href={getAppLoginUrl()} className="btn btn-ghost">Sign In</a>
          <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Register Free</button>
        </div>
      </nav>

      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-kicker"><Activity size={15} /> Free WiFi Billing · Uganda</div>
          <h1>Run your WiFi<br />like a business.</h1>
          <p>MikroTik hotspot billing with MTN MoMo &amp; Airtel Money. Self-onboarding, no IT team, free to start.</p>
          <div className="home-cta">
            <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Create Your WiFi Business</button>
            <Link href="/docs" className="btn btn-ghost">Documentation</Link>
            <a href={getAppLoginUrl()} className="btn btn-ghost">Sign In</a>
          </div>
          <div className="home-trust">
            <span><Radio size={13} className="pulse-dot" /> RADIUS auth</span>
            <span>MTN MoMo &amp; Airtel</span>
            <span>Vouchers &amp; wallets</span>
            <span>Uganda-wide</span>
          </div>
        </div>

        {/* Illustrative live console preview (decorative) */}
        <div className="home-console" aria-hidden="true">
          <div className="home-console-bar">
            <span className="home-console-dot" /><span className="home-console-dot" /><span className="home-console-dot" />
            <div className="home-console-title"><Wifi size={14} /> Operator console</div>
            <span className="home-live"><span className="pulse-dot" /> LIVE</span>
          </div>
          <div className="home-console-body">
            <div className="home-metric-row">
              <div className="home-metric">
                <span>Today&apos;s revenue</span>
                <strong>UGX {revenue.toLocaleString()}</strong>
              </div>
              <div className="home-metric">
                <span>Active sessions</span>
                <strong>{sessions}</strong>
              </div>
              <div className="home-metric">
                <span>Routers online</span>
                <strong>{routers}/20</strong>
              </div>
            </div>

            <div className="home-chart">
              {demoBars.map((h, i) => (
                <span key={i} className="home-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.09}s` }} />
              ))}
            </div>

            <div className="home-feed">
              {demoFeed.map((row, i) => (
                <div key={row.who} className={`home-feed-row ${i === feedIndex ? 'active' : ''}`}>
                  <span className="home-feed-dot" />
                  <span className="home-feed-who">{row.who}</span>
                  <span className="home-feed-plan">{row.plan}</span>
                  <span className="home-feed-amount">{row.amount}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="home-console-foot">Illustrative preview · real figures appear after sign-in</div>
        </div>
      </section>

      <section className="home-why">
        {whyPoints.map((point) => (
          <div key={point.label} className="home-why-card">
            <strong>{point.stat}</strong>
            <span className="home-why-label">{point.label}</span>
            <p>{point.text}</p>
          </div>
        ))}
      </section>

      <section className="home-section" id="features">
        <div className="home-section-head">
          <div className="home-kicker"><Zap size={15} /> Features</div>
          <h2>Everything a WiFi business needs.</h2>
          <p>From getting paid to keeping routers online — AROFi covers the whole operation, not just billing.</p>
        </div>
        <div className="home-feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="home-feature">
              <feature.icon size={20} />
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section" id="screenshots">
        <div className="home-section-head">
          <div className="home-kicker"><Wifi size={15} /> Inside AROFi</div>
          <h2>Your whole operation, in one dashboard.</h2>
          <p>A preview of what you get after sign-in — sales, vouchers, routers and payouts, all live.</p>
        </div>
        <div className="home-preview-grid">
          <PreviewCard title="Sales Dashboard" tone="blue">
            <div className="preview-mini-metric-row">
              <span>Today</span><strong>UGX 284,500</strong>
            </div>
            <div className="home-chart mini">
              {[38, 62, 44, 71, 55, 83, 90].map((h, i) => (
                <span key={i} className="home-bar" style={{ height: `${h}%` }} />
              ))}
            </div>
          </PreviewCard>
          <PreviewCard title="Voucher Batches" tone="green">
            <div className="preview-voucher">
              <div className="preview-voucher-code">AR7X-K92M</div>
              <span className="mini-badge green">1 HR · UGX 500</span>
            </div>
            <div className="preview-voucher">
              <div className="preview-voucher-code">QP4T-L03R</div>
              <span className="mini-badge blue">24 HR · UGX 4,000</span>
            </div>
          </PreviewCard>
          <PreviewCard title="Router Fleet" tone="amber">
            {['Mutungo Hill', 'Ntinda Office', 'Kireka Junction'].map((name, i) => (
              <div key={name} className="preview-router-row">
                <span className={`preview-dot ${i === 2 ? 'offline' : 'online'}`} />
                <span>{name}</span>
                <span className="preview-router-status">{i === 2 ? 'Offline' : 'Online'}</span>
              </div>
            ))}
          </PreviewCard>
          <PreviewCard title="Wallet & Payouts" tone="blue">
            <div className="preview-mini-metric-row">
              <span>Available</span><strong>UGX 612,000</strong>
            </div>
            <div className="preview-router-row">
              <span className="preview-dot online" />
              <span>Withdrawal to 0788***388</span>
              <span className="preview-router-status">Sent</span>
            </div>
          </PreviewCard>
        </div>
        <p className="home-preview-note">Illustrative previews · your real dashboard appears after sign-in.</p>
      </section>

      {SHOW_PRICING && (
        <section className="home-pricing" id="pricing">
          <div className="home-pricing-head">
            <div className="home-kicker"><BadgeDollarSign size={15} /> Pricing</div>
            <h2>Register free. Upgrade when it pays for itself.</h2>
            <p>All plans include MTN MoMo &amp; Airtel Money collection, vouchers, and RADIUS-billed hotspots — AROFi only earns when you do.</p>
          </div>
          <div className="home-pricing-grid">
            {pricingTiers.map((tier) => (
              <article key={tier.key} className={`home-pricing-card ${tier.featured ? 'featured' : ''}`}>
                {tier.featured && <div className="home-pricing-badge">Most Popular</div>}
                <h3>{tier.name}</h3>
                <div className="home-pricing-price">
                  <strong>UGX {tier.priceUgx.toLocaleString()}</strong>
                  {tier.period && <span>{tier.period}</span>}
                </div>
                <div className="home-pricing-commission">{tier.commissionSummary}</div>
                <div className="home-pricing-routers">{tier.routerLimit}</div>
                <ul className="home-pricing-list">
                  {tier.features.map((feature) => (
                    <li key={feature}><Check size={15} /> {feature}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`btn ${tier.featured ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setRegisterOpen(true)}
                >
                  {tier.priceUgx === 0 ? 'Register Free' : 'Get Started'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="home-section home-faq" id="faq">
        <div className="home-section-head">
          <div className="home-kicker"><Activity size={15} /> FAQ</div>
          <h2>Questions, answered.</h2>
          <p>Can&apos;t find what you&apos;re looking for? <a href="#contact">Talk to us</a> directly.</p>
        </div>
        <div className="home-faq-list">
          {faqs.map((item, i) => {
            const open = openFaq === i
            return (
              <div key={item.q} className={`home-faq-item ${open ? 'open' : ''}`}>
                <button type="button" className="home-faq-question" onClick={() => setOpenFaq(open ? null : i)} aria-expanded={open}>
                  <span>{item.q}</span>
                  <ChevronDown size={18} className="home-faq-chevron" />
                </button>
                {open && <p className="home-faq-answer">{item.a}</p>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="home-section home-contact" id="contact">
        <div className="home-contact-card">
          <div className="home-contact-copy">
            <div className="home-kicker"><Radio size={15} /> Contact &amp; Support</div>
            <h2>We&apos;re here every day of the week.</h2>
            <p>Questions about billing, routers, or getting paid — reach the AROFi team directly, or open the chat in the corner of your screen.</p>
          </div>
          <div className="home-contact-grid">
            <a href={`tel:+${CONTACT_PHONE}`} className="home-contact-item">
              <Phone size={20} />
              <div>
                <span className="home-contact-label">Call or WhatsApp</span>
                <strong>{CONTACT_PHONE_DISPLAY}</strong>
              </div>
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className="home-contact-item">
              <Mail size={20} />
              <div>
                <span className="home-contact-label">Email</span>
                <strong>{CONTACT_EMAIL}</strong>
              </div>
            </a>
            <div className="home-contact-item">
              <Clock size={20} />
              <div>
                <span className="home-contact-label">Support hours</span>
                <strong>24/7, every day</strong>
              </div>
            </div>
            <div className="home-contact-item">
              <MapPin size={20} />
              <div>
                <span className="home-contact-label">Based in</span>
                <strong>Kampala, Uganda</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <a
          href="https://arosoftlabs.com"
          target="_blank"
          rel="noreferrer"
          className="home-footer-brand"
          aria-label="Powered by AROSOFT"
        >
          <img src="/logo.png" alt="" aria-hidden="true" className="home-footer-logo" />
          <span>AROSOFT</span>
        </a>
        <div className="home-footer-links">
          <Link href="/docs">Docs</Link>
          <Link href="/blog">Blog</Link>
          <a href="#faq">FAQ</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <a href={`tel:+${CONTACT_PHONE}`}>{CONTACT_PHONE_DISPLAY}</a>
        </div>
      </footer>

      {/* SEO-only content — hidden from visual users, fully indexed by crawlers & AI agents */}
      <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
        <h2>Best WiFi Hotspot Billing Software in Uganda</h2>
        <p>AROFi is Uganda&apos;s leading cloud-based WiFi hotspot billing and management platform built by AROSOFT Innovations Ltd, headquartered in Kampala. Designed for MikroTik router operators, ISPs, cyber cafés, hotels, schools, and community networks across Uganda and East Africa.</p>
        <h3>Accept MTN MoMo &amp; Airtel Money for WiFi Payments</h3>
        <p>AROFi natively integrates with MTN Mobile Money (MoMo) and Airtel Money Uganda — your customers pay directly from their phones. No cash handling, no manual reconciliation.</p>
        <h3>MikroTik Hotspot Billing Made Easy</h3>
        <p>Paste one RouterOS command and AROFi handles RADIUS authentication, captive portal redirect, session tracking, and billing automatically. Works with RB951Ui, hAP ac², CCR, CHR, and all RouterOS-based devices.</p>
        <h3>How to Start a WiFi Business in Uganda</h3>
        <p>Register free → Add your MikroTik router → Set packages → Start collecting MTN MoMo and Airtel Money. No upfront cost. AROFi earns a small commission only when you do.</p>
        <h3>Multi-Tenant WiFi for Operators &amp; Resellers Kampala Uganda</h3>
        <p>Run a WiFi reseller business across Kampala and Uganda. Each tenant gets their own isolated dashboard, branded captive portal, wallet, and mobile money collection. Agents self-onboard — no IT team needed. free wifi billing software Uganda free hotspot billing system MikroTik billing Uganda MTN MoMo wifi Airtel Money hotspot best wifi software Uganda 2024 2025.</p>
      </div>

      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </main>
  )
}

function PreviewCard({ title, tone, children }: { title: string; tone: 'blue' | 'green' | 'amber'; children: React.ReactNode }) {
  return (
    <div className={`preview-card ${tone}`}>
      <div className="preview-card-head">{title}</div>
      <div className="preview-card-body">{children}</div>
    </div>
  )
}
