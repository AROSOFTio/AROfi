import Link from 'next/link'
import type { Metadata } from 'next'
import { getAppLoginUrl } from '@/lib/admin-session'
import SiteFooter from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for the AROFi WiFi hotspot billing platform by AROSOFT Innovations Ltd.',
  alternates: { canonical: 'https://arofi.net/terms' },
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <nav className="home-nav" style={{ padding: '24px 24px 0' }}>
        <Link href="/" className="home-brand">
          <img src="/logo.png" alt="AROFi" />
          <span className="home-brand-text" aria-hidden="true">AROFi</span>
        </Link>
        <div className="home-nav-links">
          <Link href="/#features">Features</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#faq">FAQ</Link>
          <Link href="/#contact">Contact</Link>
        </div>
        <div className="home-actions">
          <Link href="/docs" className="btn btn-ghost">Docs</Link>
          <a href={getAppLoginUrl()} className="btn btn-ghost">Sign In</a>
          <Link href="/?register=1" className="btn btn-primary">Register Free</Link>
        </div>
      </nav>

      <div className="legal-page">
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: 8 July 2026</p>

        <div className="blog-post-content">
          <p>
            These terms govern use of the AROFi platform (&quot;the Service&quot;), operated by AROSOFT Innovations Ltd,
            Kampala, Uganda. By registering an account you agree to them.
          </p>

          <h2>1. The Service</h2>
          <p>
            AROFi provides hotspot billing tools for WiFi operators: router integration, package and voucher sales,
            mobile money collection, wallets, and withdrawals. AROFi is a billing platform — it is not an internet
            service provider and does not supply internet connectivity.
          </p>

          <h2>2. Compliance and lawful use</h2>
          <p>
            The Service is built for authorised WiFi operators, licensed ISPs, approved resellers and compliant hotspot
            businesses. Public internet service provision in Uganda is regulated by the Uganda Communications Commission
            (UCC). You are responsible for holding any authorisation, licence, or ISP agreement your operation requires,
            and for complying with the laws of every jurisdiction where you operate. We may request business and
            compliance information, limit features while a submission is under review, and suspend accounts used for
            unlawful or unauthorised service provision.
          </p>

          <h2>3. Fees</h2>
          <p>
            Plan pricing and applicable gateway/voucher fees are shown on the pricing page and inside your dashboard.
            Fees on payments are deducted automatically when a transaction completes. Subscription fees for paid plans
            are billed monthly in advance and are non-refundable once the period starts.
          </p>

          <h2>4. Wallets and withdrawals</h2>
          <p>
            Sales proceeds accumulate in your AROFi wallet and can be withdrawn to your verified mobile money number
            protected by your withdrawal secret code. Keep that code private — withdrawals authorised with it are deemed
            authorised by you. Suspicious activity may place withdrawals under review for your protection.
          </p>

          <h2>5. Your responsibilities</h2>
          <ul>
            <li>Provide accurate registration and compliance information and keep it current.</li>
            <li>Safeguard your login credentials, OTPs, and withdrawal secret.</li>
            <li>Operate your hotspot lawfully, including any customer notice or data obligations that apply to you.</li>
            <li>Do not use the Service for fraud, network abuse, or resale of connectivity you are not authorised to resell.</li>
          </ul>

          <h2>6. Availability and liability</h2>
          <p>
            We aim for high availability but the Service is provided &quot;as is&quot; without warranty of uninterrupted operation.
            To the maximum extent permitted by law, AROSOFT&apos;s total liability for any claim is limited to the platform fees
            you paid in the three months preceding the claim. We are not liable for losses caused by your ISP, power,
            router hardware, mobile money network outages, or regulatory action against your business.
          </p>

          <h2>7. Termination</h2>
          <p>
            You may close your account at any time; wallet balances are paid out to your verified number subject to
            standard checks. We may suspend or terminate accounts that breach these terms, with notice where practicable.
          </p>

          <h2>8. Changes</h2>
          <p>
            We may update these terms; material changes will be announced in the dashboard or by email. Continued use
            after a change takes effect constitutes acceptance.
          </p>

          <h2>Contact</h2>
          <p>
            AROSOFT Innovations Ltd, Kampala, Uganda ·{' '}
            <a href="mailto:support@arofi.net">support@arofi.net</a> · +256 787 726 388
          </p>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
