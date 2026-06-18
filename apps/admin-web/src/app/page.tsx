'use client'

import { useEffect, useRef, useState } from 'react'
import { Activity, BadgeDollarSign, Radio, Router, Ticket, Users, Wifi } from 'lucide-react'
import { LoginModal } from '@/components/LoginModal'
import { RegisterModal } from '@/components/RegisterModal'

const features = [
  { icon: Router, title: 'MikroTik Hotspot Billing', text: 'One RouterOS command to onboard. No lockouts, no console diving. Any MikroTik model.' },
  { icon: Ticket, title: 'WiFi Packages & Vouchers', text: 'Sell hourly & daily bundles, print voucher batches for field agents — all from one place.' },
  { icon: BadgeDollarSign, title: 'MTN MoMo & Airtel Money', text: 'Auto-collect mobile money. Wallets, settlements and reconciliation built-in.' },
  { icon: Users, title: 'Multi-Tenant · Self-Onboard', text: 'Every operator gets an isolated branded portal. No IT team needed.' },
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
  const [loginOpen, setLoginOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [feedIndex, setFeedIndex] = useState(0)

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
      setLoginOpen(true)
      window.history.replaceState(null, '', '/')
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
        <div className="home-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setLoginOpen(true)}>Sign In</button>
          <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Get Started Free</button>
        </div>
      </nav>

      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-kicker"><Activity size={15} /> Free WiFi Billing · Uganda</div>
          <h1>Run your WiFi<br />like a business.</h1>
          <p>MikroTik hotspot billing with MTN MoMo &amp; Airtel Money. Self-onboarding, no IT team, free to start.</p>
          <div className="home-cta">
            <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Start for Free</button>
            <button type="button" className="btn btn-ghost" onClick={() => setLoginOpen(true)}>Sign In</button>
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

      <section className="home-feature-grid">
        {features.map((feature) => (
          <article key={feature.title} className="home-feature">
            <feature.icon size={20} />
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
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

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </main>
  )
}
