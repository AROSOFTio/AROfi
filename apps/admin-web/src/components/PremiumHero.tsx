'use client'

import { ArrowRight } from 'lucide-react'
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
        <div className="ph-eyebrow">AroFi Network Platform</div>
        <h1 id="ph-hero-title">
          Run your network.<br />
          <span>Grow with AroFi.</span>
        </h1>
        <p className="ph-lead">WiFi, hotspot, RADIUS and ISP billing in one platform.</p>
        <div className="ph-actions">
          <button type="button" className="ph-btn ph-btn-primary" onClick={onStartFree}>
            Get Started <ArrowRight size={17} />
          </button>
          <a href={loginUrl} className="ph-btn ph-btn-secondary">Sign In</a>
        </div>
      </div>
    </section>
  )
}
