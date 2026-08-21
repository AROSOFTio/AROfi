'use client'

import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  CircleDollarSign,
  LayoutDashboard,
  Radio,
  Router,
  Ticket,
  Users,
  Wallet,
  Wifi,
} from 'lucide-react'
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

const activityRows = [
  { title: 'Live payment received', meta: 'just now', value: '+UGX 2,000', tone: 'green' },
  { title: 'New session started', meta: 'Kira Road', value: '+1 user', tone: 'blue' },
  { title: 'MoMo payment', meta: '4 min ago', value: 'UGX 1,500', tone: 'blue' },
  { title: 'Voucher redeemed', meta: '12 min ago', value: 'UGX 500', tone: 'violet' },
  { title: 'Airtel payment', meta: '24 min ago', value: 'UGX 4,000', tone: 'red' },
  { title: 'Router online', meta: 'Mutungo Hill', value: 'healthy', tone: 'green' },
  { title: 'Wallet updated', meta: 'live', value: '+UGX 6,500', tone: 'blue' },
]

function formatUgx(value: number) {
  return `UGX ${value.toLocaleString()}`
}

export default function PremiumHero({
  revenue,
  sessions,
  routers,
  totalRouters,
  activeFeedIndex,
  loginUrl,
  onStartFree,
}: PremiumHeroProps) {
  const walletBalance = Math.max(1245800, revenue * 2 + 193800)

  return (
    <section className="ph-hero" aria-labelledby="ph-hero-title">
      <div className="ph-grid-glow ph-grid-glow-one" aria-hidden="true" />
      <div className="ph-grid-glow ph-grid-glow-two" aria-hidden="true" />

      <div className="ph-copy">
        <div className="ph-eyebrow">
          <span className="ph-eyebrow-icon"><Activity size={15} /></span>
          Built for ISPs &amp; hotspot operators
        </div>

        <h1 id="ph-hero-title">
          Run your WiFi network.<br />
          Grow your <span>business.</span>
        </h1>

        <p className="ph-lead">
          Hotspot billing for MikroTik and other supported gateways, with MTN MoMo, Airtel Money, vouchers, wallets and live router control.
          Everything you need to launch, manage and scale — in minutes.
        </p>

        <div className="ph-actions">
          <button type="button" className="ph-btn ph-btn-primary" onClick={onStartFree}>
            Start Free <ArrowRight size={17} />
          </button>
          <Link href="/docs" className="ph-btn ph-btn-secondary">Docs</Link>
          <a href={loginUrl} className="ph-btn ph-btn-secondary">Sign In</a>
        </div>

        <div className="ph-proof" aria-label="AROFi platform benefits">
          <div><span><Check size={12} /></span><strong>Easy setup</strong><small>Go live in minutes</small></div>
          <div><span><Check size={12} /></span><strong>Secure &amp; reliable</strong><small>Isolated workspaces</small></div>
          <div><span><Check size={12} /></span><strong>Payments made easy</strong><small>MoMo, Airtel &amp; more</small></div>
          <div><span><Check size={12} /></span><strong>Built for growth</strong><small>Scale without limits</small></div>
        </div>

        <div className="ph-status-strip">
          <span className="ph-status-live"><Radio size={13} /> LIVE</span>
          <span>RADIUS billing</span>
          <span>MTN MoMo &amp; Airtel</span>
          <span>Vouchers &amp; wallets</span>
        </div>
      </div>

      <div className="ph-stage" aria-label="AROFi dashboard preview on laptop and phone">
        <div className="ph-orbit ph-orbit-a" aria-hidden="true" />
        <div className="ph-orbit ph-orbit-b" aria-hidden="true" />
        <div className="ph-float-chip ph-float-chip-payment" aria-hidden="true">
          <span><CircleDollarSign size={15} /></span>
          <div><small>Payment received</small><strong>+ UGX 4,000</strong></div>
        </div>
        <div className="ph-float-chip ph-float-chip-router" aria-hidden="true">
          <span><Router size={15} /></span>
          <div><small>Router status</small><strong>92% healthy</strong></div>
        </div>

        <div className="ph-laptop-wrap">
          <div className="ph-laptop">
            <div className="ph-laptop-lid">
              <div className="ph-camera" />
              <div className="ph-desktop-screen">
                <aside className="ph-dash-sidebar">
                  <div className="ph-dash-brand"><Wifi size={18} /><b>AROFi</b></div>
                  <nav>
                    <span className="active"><LayoutDashboard size={13} /> Overview</span>
                    <span><Users size={13} /> Sessions</span>
                    <span><Router size={13} /> Routers</span>
                    <span><Ticket size={13} /> Vouchers</span>
                    <span><CircleDollarSign size={13} /> Payments</span>
                    <span><Wallet size={13} /> Wallets</span>
                    <span><BarChart3 size={13} /> Reports</span>
                  </nav>
                  <div className="ph-sidebar-card">
                    <span className="ph-dot ph-dot-green" />
                    <small>Network health</small>
                    <strong>Excellent</strong>
                  </div>
                </aside>

                <div className="ph-dash-main">
                  <header className="ph-dash-topbar">
                    <div>
                      <strong>Operator Console</strong>
                      <small>Business overview</small>
                    </div>
                    <div className="ph-dash-top-actions">
                      <span className="ph-mini-live"><i /> Live</span>
                      <Bell size={14} />
                      <span className="ph-avatar">OP</span>
                    </div>
                  </header>

                  <div className="ph-metrics">
                    <div><small>Today&apos;s Revenue</small><strong>{formatUgx(revenue)}</strong><em>▲ 12.5% vs yesterday</em></div>
                    <div><small>Active Sessions</small><strong>{sessions}</strong><em>▲ 8.2% vs yesterday</em></div>
                    <div><small>Routers Online</small><strong>{routers} / {totalRouters}</strong><em>{Math.round((routers / Math.max(totalRouters, 1)) * 100)}% online</em></div>
                    <div><small>Wallet Balance</small><strong>{formatUgx(walletBalance)}</strong><em>Available to withdraw</em></div>
                  </div>

                  <div className="ph-dash-grid">
                    <div className="ph-panel ph-revenue-panel">
                      <div className="ph-panel-head"><strong>Revenue Overview</strong><span>Today</span></div>
                      <div className="ph-line-chart">
                        <svg viewBox="0 0 500 160" preserveAspectRatio="none" role="img" aria-label="Revenue trend line chart">
                          <defs>
                            <linearGradient id="phArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="currentColor" stopOpacity=".22" />
                              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path className="ph-area" d="M0 132 C45 126 58 112 90 118 S138 64 170 88 S222 116 252 76 S302 47 332 73 S376 99 404 57 S456 29 500 42 L500 160 L0 160 Z" />
                          <path className="ph-line" d="M0 132 C45 126 58 112 90 118 S138 64 170 88 S222 116 252 76 S302 47 332 73 S376 99 404 57 S456 29 500 42" />
                        </svg>
                        <div className="ph-chart-grid" aria-hidden="true"><i /><i /><i /><i /></div>
                        <div className="ph-chart-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
                      </div>
                    </div>

                    <div className="ph-panel ph-breakdown-panel">
                      <div className="ph-panel-head"><strong>Payment Breakdown</strong><span>Live</span></div>
                      <div className="ph-donut-wrap">
                        <div className="ph-donut"><span><small>Total</small><strong>{formatUgx(revenue)}</strong></span></div>
                        <div className="ph-legend">
                          <span><i className="mtn" /> MTN MoMo <b>60%</b></span>
                          <span><i className="airtel" /> Airtel <b>25%</b></span>
                          <span><i className="voucher" /> Vouchers <b>10%</b></span>
                          <span><i className="wallet" /> Wallets <b>5%</b></span>
                        </div>
                      </div>
                    </div>

                    <div className="ph-panel ph-activity-panel">
                      <div className="ph-panel-head"><strong>Recent Activity</strong><span>Auto-updating</span></div>
                      <div className="ph-activity-list">
                        {activityRows.slice(0, 5).map((row, index) => (
                          <div key={row.title} className={index === activeFeedIndex % 5 ? 'is-active' : ''}>
                            <i className={`ph-activity-dot ${row.tone}`} />
                            <span>{row.title}</span>
                            <small>{row.meta}</small>
                            <b>{row.value}</b>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="ph-panel ph-router-panel">
                      <div className="ph-panel-head"><strong>Top Routers</strong><span>View all</span></div>
                      {[
                        ['Kira Road', '32 / 40'],
                        ['Mutungo Hill', '24 / 30'],
                        ['Naalya Center', '18 / 25'],
                      ].map(([name, users]) => (
                        <div className="ph-router-row" key={name}>
                          <span><i />{name}</span><small>{users}</small><b>Online</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="ph-laptop-base"><span className="ph-trackpad" /></div>
            <div className="ph-laptop-shadow" />
          </div>
        </div>

        <div className="ph-phone-wrap">
          <div className="ph-phone">
            <div className="ph-phone-island" />
            <div className="ph-phone-screen">
              <header>
                <div className="ph-phone-brand"><Wifi size={15} /><b>AROFi</b></div>
                <Bell size={13} />
              </header>
              <div className="ph-phone-title"><strong>Overview</strong><span><i /> Live</span></div>
              <div className="ph-phone-metrics">
                <div><small>Revenue</small><strong>{formatUgx(revenue)}</strong><em>▲ 12.5%</em></div>
                <div><small>Sessions</small><strong>{sessions}</strong><em>▲ 8.2%</em></div>
                <div><small>Routers</small><strong>{routers}/{totalRouters}</strong><em>Healthy</em></div>
                <div><small>Wallet</small><strong>{formatUgx(walletBalance)}</strong><em>Available</em></div>
              </div>
              <div className="ph-phone-chart-card">
                <div><strong>Revenue</strong><span>Today</span></div>
                <svg viewBox="0 0 240 80" preserveAspectRatio="none" aria-hidden="true">
                  <path className="ph-phone-area" d="M0 68 C22 64 28 55 48 58 S78 32 98 43 S128 60 145 35 S174 23 190 34 S216 14 240 19 L240 80 L0 80 Z" />
                  <path className="ph-phone-line" d="M0 68 C22 64 28 55 48 58 S78 32 98 43 S128 60 145 35 S174 23 190 34 S216 14 240 19" />
                </svg>
              </div>
              <div className="ph-phone-activity">
                <div className="ph-phone-section-head"><strong>Recent Activity</strong><span>Live</span></div>
                {activityRows.slice(0, 3).map((row, index) => (
                  <div className={index === activeFeedIndex % 3 ? 'is-active' : ''} key={row.title}>
                    <i className={`ph-activity-dot ${row.tone}`} />
                    <span>{row.title}</span>
                    <b>{row.value}</b>
                  </div>
                ))}
              </div>
              <nav className="ph-phone-nav">
                <span className="active"><LayoutDashboard size={12} />Overview</span>
                <span><Users size={12} />Sessions</span>
                <span><CircleDollarSign size={12} />Payments</span>
                <span><Router size={12} />Routers</span>
              </nav>
            </div>
          </div>
          <div className="ph-phone-shadow" />
        </div>
      </div>
    </section>
  )
}
