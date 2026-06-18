'use client'

import { useEffect, useRef, useState } from 'react'
import { Activity, BadgeDollarSign, Radio, Router, Ticket, Users, Wifi } from 'lucide-react'
import { LoginModal } from '@/components/LoginModal'
import { RegisterModal } from '@/components/RegisterModal'

const features = [
  { icon: Router, title: 'Onboard MikroTik Routers', text: 'One safe RouterOS terminal command — no lockouts, no console diving. Works with any MikroTik model in Uganda.' },
  { icon: Ticket, title: 'Sell WiFi Packages & Vouchers', text: 'Packages, hourly & daily bundles, printable voucher batches for field agents — all from one dashboard.' },
  { icon: BadgeDollarSign, title: 'MTN MoMo & Airtel Money', text: 'Accept mobile money payments automatically. Wallets, settlements and reconciliation built-in. Zero manual work.' },
  { icon: Users, title: 'Multi-Tenant & Self-Onboarding', text: 'Every WiFi operator gets an isolated branded captive portal. Vendors self-onboard. No IT team required.' },
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
        <div className="home-brand">
          <img src="/logo.png" alt="AROFi" />
          <span>AROFi</span>
        </div>
        <div className="home-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setLoginOpen(true)}>Sign In</button>
          <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Get Started</button>
        </div>
      </nav>

      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-kicker"><Activity size={15} /> #1 WiFi Hotspot Billing System — Uganda</div>
          <h1>Run your WiFi<br />like a business.</h1>
          <p>Uganda&apos;s best hotspot billing software. Onboard MikroTik routers, sell packages and vouchers, collect MTN MoMo &amp; Airtel Money, and track every session — all from one cloud console. <strong>Self-onboarding. No IT team needed.</strong></p>
          <div className="home-cta">
            <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Start Free — Create Workspace</button>
            <button type="button" className="btn btn-ghost" onClick={() => setLoginOpen(true)}>Open console</button>
          </div>
          <div className="home-trust">
            <span><Radio size={13} className="pulse-dot" /> RADIUS-grade auth</span>
            <span>MTN MoMo &amp; Airtel Money</span>
            <span>Vouchers &amp; wallets</span>
            <span>Kampala &amp; Uganda-wide</span>
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
                <span>Today’s revenue</span>
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

      {/* SEO Content Section — visible to crawlers, styled accessibly */}
      <section className="home-seo-section" aria-label="About AROFi WiFi Billing System Uganda">
        <h2>Best WiFi Hotspot Billing Software in Uganda</h2>
        <p>
          AROFi is Uganda&apos;s leading cloud-based WiFi hotspot billing and management platform built by
          <strong> AROSOFT Innovations Ltd</strong>, headquartered in Kampala. Designed for MikroTik router
          operators, ISPs, cyber cafés, hotels, schools, and community networks across Uganda and East Africa.
        </p>
        <h3>Accept MTN MoMo &amp; Airtel Money for WiFi Payments</h3>
        <p>
          AROFi natively integrates with <strong>MTN Mobile Money (MoMo)</strong> and{' '}
          <strong>Airtel Money Uganda</strong> — your customers pay directly from their phones, and you receive
          the funds in your wallet instantly. No cash handling, no manual reconciliation.
        </p>
        <h3>MikroTik Hotspot Billing Made Easy</h3>
        <p>
          Set up your MikroTik hotspot billing in minutes. Paste one RouterOS command and AROFi handles RADIUS
          authentication, captive portal redirect, session tracking, and billing automatically. Works with{' '}
          RB951Ui, hAP ac², CCR, CHR, and all RouterOS-based devices.
        </p>
        <h3>How to Start a WiFi Business in Uganda</h3>
        <p>
          Register on AROFi for free → Add your MikroTik router → Set your WiFi packages → Share the captive
          portal link → Start collecting MTN MoMo and Airtel Money payments. No upfront software cost. AROFi
          earns a small commission only when you do.
        </p>
        <h3>Multi-Tenant WiFi Management for Operators &amp; Resellers</h3>
        <p>
          Run a WiFi reseller business or franchise across Kampala and Uganda. Each tenant gets their own
          isolated dashboard, branded captive portal, wallet, and mobile money collection. Agents can onboard
          themselves — no IT team or technical staff needed.
        </p>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1.5rem' }}>
          AROFi by AROSOFT · WiFi Billing · Hotspot Management · MikroTik Billing · MTN MoMo · Airtel Money ·
          Uganda · Kampala · East Africa · &copy; {new Date().getFullYear()} AROSOFT Innovations Ltd
        </p>
      </section>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </main>
  )
}
