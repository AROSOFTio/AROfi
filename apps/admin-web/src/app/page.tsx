'use client'

import { useState } from 'react'
import { Activity, BadgeDollarSign, Router, Ticket, Users, Wifi } from 'lucide-react'
import { LoginModal } from '@/components/LoginModal'
import { RegisterModal } from '@/components/RegisterModal'

const features = [
  { icon: Router, title: 'Manage Routers', text: 'Register MikroTik devices and generate tenant-safe RouterOS scripts.' },
  { icon: Ticket, title: 'Sell Vouchers', text: 'Create packages, batches, and printable access codes for field sales.' },
  { icon: BadgeDollarSign, title: 'Track Revenue', text: 'Monitor mobile money, vouchers, wallets, fees, and settlements.' },
  { icon: Users, title: 'Multi-Tenant', text: 'Give every vendor an isolated branded workspace and customer portal.' },
]

export default function RootPage() {
  const [loginOpen, setLoginOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)

  return (
    <main className="home-shell">
      <nav className="home-nav">
        <div className="home-brand"><span>ARO</span>Fi</div>
        <div className="home-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setLoginOpen(true)}>Sign In</button>
          <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Get Started</button>
        </div>
      </nav>

      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-kicker"><Activity size={16} /> Hotspot Billing OS</div>
          <h1>Power Your WiFi Business</h1>
          <p>
            Launch branded captive portals, sell packages and vouchers, onboard MikroTik routers,
            and track revenue from one operator console.
          </p>
          <div className="home-cta">
            <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Create Workspace</button>
            <button type="button" className="btn btn-ghost" onClick={() => setLoginOpen(true)}>Open Console</button>
          </div>
        </div>
        <div className="home-panel" aria-hidden="true">
          <div className="home-panel-row"><Wifi /> Live captive portal</div>
          <div className="home-panel-metric">UGX 2.8M</div>
          <div className="home-panel-muted">Revenue tracked across vouchers, agents, and mobile money.</div>
          <div className="home-panel-grid">
            <span>Routers online</span><strong>42</strong>
            <span>Active sessions</span><strong>1,284</strong>
            <span>Packages sold</span><strong>8,920</strong>
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

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </main>
  )
}
