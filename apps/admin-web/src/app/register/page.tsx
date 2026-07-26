'use client'

import { useEffect, useState } from 'react'
import { Activity, BadgeDollarSign, Router, Ticket, Users, Wifi } from 'lucide-react'
import { RegisterModal } from '@/components/RegisterModal'
import { getAppLoginUrl } from '@/lib/admin-session'

const features = [
  { icon: Router, title: 'Manage Routers', text: 'Generate MikroTik scripts and verify real live signals.' },
  { icon: Ticket, title: 'Sell Vouchers', text: 'Create packages, batches, and customer access codes.' },
  { icon: BadgeDollarSign, title: 'Track Money', text: 'Monitor collections, wallets, commissions, and payouts.' },
  { icon: Users, title: 'Business Workspace', text: 'Create an isolated business console with guided onboarding.' },
]

export default function RegisterPage() {
  const [registerOpen, setRegisterOpen] = useState(true)
  const [signupPlan, setSignupPlan] = useState<'FREE' | 'PRO' | null>(null)

  useEffect(() => {
    const plan = new URLSearchParams(window.location.search).get('plan')?.toUpperCase()
    setSignupPlan(plan === 'PRO' ? 'PRO' : plan === 'FREE' ? 'FREE' : null)
    setRegisterOpen(true)
  }, [])

  return (
    <main className="home-shell">
      <nav className="home-nav">
        <div className="home-brand">
          <img src="/logo.png" alt="AROFi" />
          <span>AROFi</span>
        </div>
        <div className="home-actions">
          <a href={getAppLoginUrl()} className="btn btn-ghost">Sign In</a>
          <button type="button" className="btn btn-primary" onClick={() => { setSignupPlan('FREE'); setRegisterOpen(true) }}>Get Started</button>
        </div>
      </nav>

      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-kicker"><Activity size={16} /> Hotspot Billing OS</div>
          <h1>Power Your WiFi Business</h1>
          <p>
            Create your business workspace through the guided setup form, then add routers,
            packages, vouchers, and payment settings from the console.
          </p>
          <div className="home-cta">
            <button type="button" className="btn btn-primary" onClick={() => { setSignupPlan('FREE'); setRegisterOpen(true) }}>Create Workspace</button>
            <a href={getAppLoginUrl()} className="btn btn-ghost">Open Console</a>
          </div>
        </div>
        <div className="home-panel" aria-hidden="true">
          <div className="home-panel-row"><Wifi /> Guided setup</div>
          <div className="home-panel-metric">4 steps</div>
          <div className="home-panel-muted">Business, owner, security, then dashboard.</div>
          <div className="home-panel-grid">
            <span>Business</span><strong>Created</strong>
            <span>Router group</span><strong>Ready</strong>
            <span>Wallet</span><strong>Enabled</strong>
          </div>
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

      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} initialPlan={signupPlan} />
    </main>
  )
}
