import Link from 'next/link'

const CONTACT_PHONE = '256787726388'
const CONTACT_PHONE_DISPLAY = '+256 787 726 388'
const CONTACT_EMAIL = 'support@arofi.net'

// Shared public-site footer (homepage, blog index, blog articles, legal pages).
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand-col">
          <div className="site-footer-brand">
            <img src="/logo.png" alt="AROFi" />
            <span>AROFi</span>
          </div>
          <p>
            WiFi hotspot billing for authorised operators, licensed ISPs and compliant hotspot
            businesses across Uganda and East Africa. Built by AROSOFT Innovations Ltd, Kampala.
          </p>
        </div>
        <div className="site-footer-col">
          <h4>Product</h4>
          <Link href="/#features">Features</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/docs">Documentation</Link>
          <Link href="/blog">Blog</Link>
        </div>
        <div className="site-footer-col">
          <h4>Company</h4>
          <Link href="/#faq">FAQ</Link>
          <Link href="/#contact">Contact</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </div>
        <div className="site-footer-col">
          <h4>Support</h4>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <a href={`tel:+${CONTACT_PHONE}`}>{CONTACT_PHONE_DISPLAY}</a>
          <a href={`https://wa.me/${CONTACT_PHONE}`} target="_blank" rel="noreferrer">WhatsApp Support</a>
          <a href="https://arosoftlabs.com" target="_blank" rel="noreferrer">AROSOFT Innovations</a>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} AROSOFT Innovations Ltd. All rights reserved.</span>
        <span>AROFi — WiFi billing for authorised and compliant operators.</span>
      </div>
    </footer>
  )
}
