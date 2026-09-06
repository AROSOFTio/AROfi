'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'

export default function PublicAppearanceDock() {
  const pathname = usePathname()
  const [themeTarget, setThemeTarget] = useState<HTMLElement | null>(null)

  const visible = useMemo(() => {
    if (!pathname) return false
    return pathname === '/' || [
      '/docs', '/blog', '/referral-program', '/privacy', '/terms', '/contact', '/about',
    ].some((prefix) => pathname.startsWith(prefix))
  }, [pathname])

  useEffect(() => {
    if (!visible) {
      setThemeTarget(null)
      return
    }
    document.documentElement.setAttribute('data-accent-theme', 'green')
    try { localStorage.setItem('arofi-accent-theme', 'green') } catch {}
    document.cookie = 'arofi-accent-theme=green; Max-Age=31536000; Path=/; SameSite=Lax'

    const findTarget = () => setThemeTarget(document.querySelector('.home-actions') as HTMLElement | null)
    findTarget()
    const id = window.setTimeout(findTarget, 80)
    return () => window.clearTimeout(id)
  }, [visible, pathname])

  if (!visible) return null

  return (
    <>
      {themeTarget
        ? createPortal(<ThemeToggle compact />, themeTarget)
        : <div className="public-theme-fallback"><ThemeToggle compact /></div>}

      <style jsx global>{`
        /* Public pages use the exact same AroFi green and light/dark surfaces
           as the internal dashboard. Blue remains informational only. */
        :root {
          --arofi-accent: #22A53A;
          --arofi-accent-strong: #1E9134;
          --arofi-accent-soft: #EAF7ED;
          --arofi-accent-line: #B9E7C2;
          --arofi-logo: url('/brand-assets/arofi-logo');
          --arofi-mark: url('/brand-assets/arofi-app-icon');
          --green: #22A53A;
          --green-dark: #197C2C;
          --green-light: #EAF7ED;
          --green-mid: #B9E7C2;
          --green-soft: #F1FAF3;
          --brand: #22A53A;
          --brand-2: #22A53A;
          --primary: 130 66% 39%;
          --ring: 130 66% 39%;
        }

        :root[data-theme='light'] {
          color-scheme: light;
          --bg-app: #F5F7F9;
          --bg-card: #FFFFFF;
          --bg-sidebar: #FFFFFF;
          --bg-hover: #EAF7ED;
          --border: #E1E6EA;
          --border-soft: #EDF0F2;
          --text-1: #122033;
          --text-2: #596675;
          --text-3: #7F8A96;
          --glass-bg: rgba(255,255,255,.96);
          --glass-border: #E1E6EA;
          --shadow-sm: 0 1px 2px rgba(16,24,40,.035);
          --shadow-md: 0 4px 16px rgba(16,24,40,.055);
        }

        :root[data-theme='dark'] {
          color-scheme: dark;
          --arofi-logo: url('/brand-assets/arofi-logo-dark');
          --arofi-mark: url('/brand-assets/arofi-logo-dark');
          --bg-app: #0B0805;
          --bg-card: #202020;
          --bg-sidebar: #171717;
          --bg-hover: #292929;
          --border: #303030;
          --border-soft: #323232;
          --text-1: #E6E6E6;
          --text-2: #B0B0B0;
          --text-3: #8F8F8F;
          --green: #22A53A;
          --green-dark: #73D083;
          --green-light: rgba(34,165,58,.14);
          --green-mid: rgba(34,165,58,.32);
          --green-soft: rgba(34,165,58,.10);
          --brand: #22A53A;
          --brand-2: #22A53A;
          --glass-bg: rgba(32,32,32,.96);
          --glass-border: #303030;
          --shadow-sm: none;
          --shadow-md: none;
        }

        body { background: var(--bg-app) !important; color: var(--text-1); }
        .home-shell { background: var(--bg-app) !important; color: var(--text-1) !important; }
        .home-nav {
          background: var(--bg-card) !important;
          border-color: var(--border) !important;
          box-shadow: var(--shadow-sm) !important;
        }
        .home-brand { min-width: 122px !important; display:flex !important; align-items:center !important; }
        .home-brand::before { display:none !important; content:none !important; }
        .home-brand img,
        .site-footer-brand img,
        .book-brand img,
        .login-logo {
          content: var(--arofi-logo) !important;
          opacity: 1 !important;
          object-fit: contain !important;
        }
        .home-brand img { width:118px !important; height:44px !important; object-position:left center !important; }
        .home-brand-text,
        .site-footer-brand > span { display:none !important; }

        .home-console,.home-why-card,.home-feature,.home-preview-card,.preview-card,
        .home-faq-item,.home-pricing-card,.pricing-card,.home-contact-card,.home-blog-card {
          background: var(--bg-card) !important;
          border-color: var(--border) !important;
          box-shadow: var(--shadow-sm) !important;
        }
        :root[data-theme='dark'] .home-console,
        :root[data-theme='dark'] .home-why-card,
        :root[data-theme='dark'] .home-feature,
        :root[data-theme='dark'] .home-preview-card,
        :root[data-theme='dark'] .preview-card,
        :root[data-theme='dark'] .home-faq-item,
        :root[data-theme='dark'] .home-pricing-card,
        :root[data-theme='dark'] .pricing-card,
        :root[data-theme='dark'] .home-contact-card,
        :root[data-theme='dark'] .home-blog-card { background-image:none !important; }

        .home-kicker,.home-feature > svg,.home-live,.home-feed-amount,
        .home-pricing-commission,.home-section-head a { color:#22A53A !important; }
        .home-bar { background:#22A53A !important; }
        .home-shell .btn-primary,
        .home-shell .ph-btn-primary {
          background:#22A53A !important;
          border-color:#22A53A !important;
          color:#fff !important;
          box-shadow:none !important;
        }
        .home-shell .btn-primary:hover,
        .home-shell .ph-btn-primary:hover {
          background:#1E9134 !important;
          border-color:#1E9134 !important;
        }
        .home-shell .btn-ghost {
          background:var(--bg-card) !important;
          color:var(--text-1) !important;
          border-color:var(--border) !important;
        }
        .home-nav a,.home-section-head p,.home-feature p,.home-why-card p,.home-faq-item p {
          color:var(--text-2) !important;
        }

        /* Replace the homepage's old two-button mode control with the exact
           compact Auto/Light/Dark dashboard dropdown. */
        .home-mode-toggle { display:none !important; }
        .home-actions > .topbar-theme { order:-1; }
        .home-actions .topbar-theme-trigger { min-height:36px; }
        .public-theme-fallback {
          position:fixed;
          top:14px;
          right:14px;
          z-index:1200;
        }

        @media (max-width:760px) {
          .home-brand { min-width:96px !important; }
          .home-brand img { width:96px !important; height:38px !important; }
          .home-actions > .topbar-theme { width:100%; }
          .home-actions .topbar-theme-trigger { width:100%; justify-content:center; }
          .home-actions .theme-menu { left:0; right:auto; min-width:100%; }
        }
      `}</style>
    </>
  )
}
