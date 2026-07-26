import Link from 'next/link'
import type { Metadata } from 'next'
import { BadgeDollarSign, Check, Copy, Link2, Radio, ShieldCheck, Users, Wallet } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import { getAppLoginUrl } from '@/lib/admin-session'

const SITE_URL = 'https://arofi.net'

export const metadata: Metadata = {
  title: 'Referral Programme',
  description: 'Earn referral commission by inviting WiFi businesses to AROFi. Share your link, help operators register, and get paid when qualifying Pro subscriptions are confirmed.',
  alternates: {
    canonical: `${SITE_URL}/referral-program`,
  },
  openGraph: {
    title: 'AROFi Referral Programme',
    description: 'Invite WiFi operators to AROFi and earn from qualifying Pro subscriptions.',
    url: `${SITE_URL}/referral-program`,
    type: 'website',
  },
}

const steps = [
  { icon: Link2, title: 'Share your link', text: 'Every registered referral partner gets a unique link and code from the dashboard.' },
  { icon: Users, title: 'A WiFi business joins', text: 'The operator registers with your link or referral code and sets up their workspace.' },
  { icon: BadgeDollarSign, title: 'They activate Pro', text: 'Commission is calculated when a qualifying Pro subscription payment is confirmed.' },
  { icon: Wallet, title: 'Withdraw earnings', text: 'Move approved referral earnings to your registered payout number using your secret PIN.' },
]

const highlights = [
  'Clear referral link and code in your AROFi dashboard',
  'Live tracking for referrals, commissions, wallet balance and withdrawals',
  'Works for WiFi operators, agents, installers, sales teams and resellers',
  'Built-in fraud checks and partner controls to protect the programme',
]

export default function ReferralProgramPage() {
  const programmeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'AROFi Referral Programme',
    url: `${SITE_URL}/referral-program`,
    description: 'AROFi referral programme for partners who invite WiFi businesses to the hotspot billing platform.',
  }

  return (
    <main className="home-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(programmeJsonLd) }} />
      <nav className="home-nav" aria-label="Primary">
        <Link href="/" className="home-brand">
          <img src="/logo.png" alt="AROFi" />
          <span className="home-brand-text" aria-hidden="true">AROFi</span>
        </Link>
        <div className="home-nav-links">
          <Link href="/#features">Features</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/referral-program">Referral</Link>
          <Link href="/#faq">FAQ</Link>
          <Link href="/blog">Blog</Link>
        </div>
        <div className="home-actions">
          <a href={getAppLoginUrl()} className="btn btn-ghost">Sign In</a>
          <Link href="/?register=1" className="btn btn-primary">Join AROFi</Link>
        </div>
      </nav>

      <section className="home-hero referral-hero">
        <div className="home-hero-copy">
          <div className="home-kicker"><Radio size={15} /> Referral Programme</div>
          <h1>Earn by bringing WiFi businesses to AROFi.</h1>
          <p>
            Share AROFi with hotspot operators, installers, agents and resellers.
            When a referred business completes a qualifying Pro subscription payment,
            your referral commission is recorded automatically.
          </p>
          <div className="home-cta">
            <Link href="/?register=1" className="btn btn-primary">Join the Programme</Link>
            <a href={getAppLoginUrl()} className="btn btn-ghost">Open Dashboard</a>
          </div>
        </div>

        <div className="home-console referral-card" aria-label="Referral programme summary">
          <div className="home-console-bar">
            <span className="home-console-dot" /><span className="home-console-dot" /><span className="home-console-dot" />
            <div className="home-console-title"><Copy size={14} /> Partner console</div>
          </div>
          <div className="home-console-body">
            <div className="home-panel-row">
              <span>Your link</span>
              <strong>arofi.net/register?ref=CODE</strong>
            </div>
            <div className="home-panel-grid">
              <div><span>Commission</span><strong>Qualifying Pro payments</strong></div>
              <div><span>Wallet</span><strong>Tracked live</strong></div>
            </div>
            <ul className="home-pricing-list referral-list">
              {highlights.map((item) => (
                <li key={item}><Check size={16} /> {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="home-section" aria-labelledby="how-it-works-title">
        <div className="home-section-head">
          <div className="home-kicker"><ShieldCheck size={15} /> How It Works</div>
          <h2 id="how-it-works-title">Simple enough to explain in one minute.</h2>
          <p>Partners get a clear referral flow, businesses get a real billing system, and commissions are tied to confirmed Pro payments.</p>
        </div>
        <div className="home-feature-grid">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <article className="home-feature" key={step.title}>
                <Icon size={22} />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="home-section home-contact" aria-labelledby="referral-contact-title">
        <div className="home-contact-card">
          <div className="home-contact-copy">
            <div className="home-kicker"><Users size={15} /> Ready</div>
            <h2 id="referral-contact-title">Start as a WiFi operator or referral partner.</h2>
            <p>Register free, choose your account type, and your referral workspace will show your code, link, commissions and withdrawals.</p>
          </div>
          <div className="home-contact-grid">
            <Link href="/?register=1" className="home-contact-item">
              <Users size={20} />
              <div><span className="home-contact-label">Register</span><strong>Create free account</strong></div>
            </Link>
            <a href={getAppLoginUrl()} className="home-contact-item">
              <Wallet size={20} />
              <div><span className="home-contact-label">Existing user</span><strong>Open dashboard</strong></div>
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
