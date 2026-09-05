'use client'

import Link from 'next/link'
import { ArrowRight, Check, Radio } from 'lucide-react'
import './premium-hero.css'
import './premium-hero-responsive.css'

type PremiumHeroProps = {
  revenue: number
  sessions: number
  routers: number
  totalRouters: number
  activeFeedIndex: number
  loginUrl: string
  onStartFree: () => void
}

export default function PremiumHero({ loginUrl, onStartFree }: PremiumHeroProps) {
  return (
    <section className="ph-hero" aria-labelledby="ph-hero-title">
      <div className="ph-copy">
        <div className="ph-eyebrow">
          <span className="ph-eyebrow-icon"><Radio size={15} /></span>
          Networking operations for African WiFi &amp; ISP businesses
        </div>

        <h1 id="ph-hero-title">
          Build, bill and manage your network.<br />
          <span>Grow across Africa.</span>
        </h1>

        <p className="ph-lead">
          AroFi brings hotspot billing, RADIUS access, router management, internet packages,
          vouchers, customers, wallets and live sessions into one cloud console. Start in Uganda
          and expand across Kenya, Nigeria, Ghana, Rwanda, Tanzania, Zambia, Malawi, Botswana,
          South Africa and more African markets as local support becomes available.
        </p>

        <div className="ph-actions">
          <button type="button" className="ph-btn ph-btn-primary" onClick={onStartFree}>
            Create Free Account <ArrowRight size={17} />
          </button>
          <a href="#features" className="ph-btn ph-btn-secondary">Explore Features</a>
          <a href={loginUrl} className="ph-btn ph-btn-secondary">Open Console</a>
        </div>

        <div className="ph-proof" aria-label="AroFi platform benefits">
          <div><span><Check size={12} /></span><strong>Easy setup</strong><small>Go live in minutes</small></div>
          <div><span><Check size={12} /></span><strong>Secure &amp; reliable</strong><small>Isolated business workspaces</small></div>
          <div><span><Check size={12} /></span><strong>Payments ready</strong><small>Local rails as markets are enabled</small></div>
          <div><span><Check size={12} /></span><strong>Built for Africa</strong><small>Scale across multiple markets</small></div>
        </div>

        <div className="ph-status-strip">
          <span className="ph-status-live"><Radio size={13} /> LIVE</span>
          <span>RADIUS &amp; hotspot</span>
          <span>Router management</span>
          <span>Vouchers &amp; billing</span>
        </div>
      </div>

      <div
        className="ph-stage"
        role="img"
        aria-label="Modern wireless router and connected devices representing AroFi network management"
      />
    </section>
  )
}
