'use client'

import { useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'

const MODE_KEY = 'arofi-theme'

export default function PublicAppearanceDock() {
  const pathname = usePathname()

  const visible = useMemo(() => {
    if (!pathname) return false
    return pathname === '/' || [
      '/docs', '/blog', '/referral-program', '/privacy', '/terms', '/contact', '/about',
    ].some((prefix) => pathname.startsWith(prefix))
  }, [pathname])

  useEffect(() => {
    const cookies = document.cookie.split('; ').reduce<Record<string, string>>((values, item) => {
      const [key, ...parts] = item.split('=')
      values[key] = parts.join('=')
      return values
    }, {})

    let saved: string | null = null
    try {
      saved = localStorage.getItem(MODE_KEY)
    } catch {
      // Cookie persistence remains available when local storage is restricted.
    }
    saved ||= cookies[MODE_KEY] ?? null
    const nextMode = saved === 'dark' || saved === 'light'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

    applyMode(nextMode)
  }, [])

  function applyMode(nextMode: 'light' | 'dark') {
    document.documentElement.setAttribute('data-theme', nextMode)
    document.documentElement.style.colorScheme = nextMode
    try {
      localStorage.setItem(MODE_KEY, nextMode)
    } catch {
      // Cookie persistence below is the fallback.
    }
    document.cookie = `${MODE_KEY}=${nextMode}; Max-Age=31536000; Path=/; SameSite=Lax`
  }

  return (
    <>
      {visible ? null : null}

      <style jsx global>{`
        :root,
        :root[data-accent-theme='blue'] {
          --arofi-accent: #2563eb;
          --arofi-accent-strong: #1d4ed8;
          --arofi-accent-soft: rgba(37, 99, 235, .11);
          --arofi-accent-line: rgba(37, 99, 235, .28);
          --arofi-logo: url('/brand/arofi-logo-blue.svg');
          --arofi-mark: url('/brand/arofi-mark-blue.svg');
          --green: #2563eb;
          --green-dark: #1d4ed8;
          --green-light: #eff6ff;
          --green-mid: #bfdbfe;
          --green-soft: #dbeafe;
          --brand: #2563eb;
          --brand-2: #1d4ed8;
          --primary: 221 83% 53%;
          --ring: 221 83% 53%;
        }
        :root[data-accent-theme='green'] {
          --arofi-accent: #2C963F;
          --arofi-accent-strong: #22723B;
          --arofi-accent-soft: rgba(44, 150, 63, .11);
          --arofi-accent-line: rgba(44, 150, 63, .28);
          --arofi-logo: url('/brand/arofi-logo-green.svg');
          --arofi-mark: url('/brand/arofi-mark-green.svg');
          --green: #2C963F;
          --green-dark: #22723B;
          --green-light: #eaf7ed;
          --green-mid: #adddb8;
          --green-soft: #f3faf5;
          --brand: #2C963F;
          --brand-2: #22723B;
          --primary: 130 55% 38%;
          --ring: 130 55% 38%;
        }
        :root[data-accent-theme='gold'] {
          --arofi-accent: #d59a24;
          --arofi-accent-strong: #a96913;
          --arofi-accent-soft: rgba(213, 154, 36, .13);
          --arofi-accent-line: rgba(213, 154, 36, .32);
          --arofi-logo: url('/brand/arofi-logo-gold.svg');
          --arofi-mark: url('/brand/arofi-mark-gold.svg');
          --green: #d59a24;
          --green-dark: #a96913;
          --green-light: #fff8e7;
          --green-mid: #f4d58a;
          --green-soft: #fdf0c8;
          --brand: #d59a24;
          --brand-2: #a96913;
          --primary: 40 67% 49%;
          --ring: 40 67% 49%;
        }

        :root[data-theme='light'] {
          color-scheme: light;
          --bg-app: #f4f6f8;
          --bg-card: #ffffff;
          --bg-sidebar: #ffffff;
          --bg-hover: #edf1f5;
          --border: #d8e0e8;
          --border-soft: #e7ecf1;
          --text-1: #111827;
          --text-2: #4b5563;
          --text-3: #6b7280;
          --glass-bg: rgba(255,255,255,.94);
          --glass-border: rgba(15,23,42,.10);
          --glass-blur: 12px;
          --shadow-sm: 0 1px 2px rgba(15,23,42,.05);
          --shadow-md: 0 12px 32px rgba(15,23,42,.08);
        }
        :root[data-theme='dark'] {
          color-scheme: dark;
          --bg-app: #0b0f14;
          --bg-card: #121820;
          --bg-sidebar: #0f141b;
          --bg-hover: #1a222d;
          --border: #293442;
          --border-soft: #202a36;
          --text-1: #f3f6f9;
          --text-2: #b2bdc9;
          --text-3: #8592a2;
          --glass-bg: rgba(18,24,32,.96);
          --glass-border: rgba(148,163,184,.16);
          --glass-blur: 12px;
          --shadow-sm: 0 1px 3px rgba(0,0,0,.28);
          --shadow-md: 0 16px 36px rgba(0,0,0,.34);
          --background: 216 29% 6%;
          --foreground: 210 20% 96%;
          --card: 215 28% 10%;
          --card-foreground: 210 20% 96%;
          --popover: 215 28% 10%;
          --popover-foreground: 210 20% 96%;
          --secondary: 215 24% 15%;
          --secondary-foreground: 210 20% 96%;
          --muted: 215 24% 15%;
          --muted-foreground: 215 12% 67%;
          --border: 215 21% 21%;
          --input: 215 21% 21%;
        }
        :root[data-theme='dark'][data-accent-theme='blue'] {
          --arofi-accent:#60a5fa;--arofi-accent-strong:#3b82f6;--green:#60a5fa;--green-dark:#93c5fd;
          --green-light:rgba(59,130,246,.14);--green-mid:rgba(96,165,250,.30);--green-soft:rgba(59,130,246,.10);--brand:#60a5fa;--brand-2:#3b82f6;
        }
        :root[data-theme='dark'][data-accent-theme='green'] {
          --arofi-accent:#2C963F;--arofi-accent-strong:#22723B;--green:#2C963F;--green-dark:#8bd99a;
          --green-light:rgba(44,150,63,.16);--green-mid:rgba(44,150,63,.36);--green-soft:rgba(44,150,63,.10);--brand:#2C963F;--brand-2:#22723B;
        }
        :root[data-theme='dark'][data-accent-theme='gold'] {
          --arofi-accent:#f2bd58;--arofi-accent-strong:#d59a24;--green:#f2bd58;--green-dark:#f7cf7b;
          --green-light:rgba(213,154,36,.15);--green-mid:rgba(242,189,88,.30);--green-soft:rgba(213,154,36,.11);--brand:#f2bd58;--brand-2:#d59a24;
        }

        body { background: var(--bg-app) !important; color: var(--text-1); }
        :root[data-theme='dark'] body { background-image: none !important; }

        .home-shell { background: var(--bg-app) !important; color: var(--text-1) !important; }
        .home-nav {
          background: color-mix(in srgb, var(--bg-card) 94%, transparent) !important;
          border-color: var(--border) !important;
          box-shadow: 0 6px 22px rgba(15,23,42,.05) !important;
        }
        :root[data-theme='dark'] .home-nav { box-shadow: 0 8px 24px rgba(0,0,0,.24) !important; }
        .home-brand { min-width: 112px !important; display:flex !important; align-items:center !important; }
        .home-brand::before { display:none !important; content:none !important; }
        .home-brand img {
          content: var(--arofi-logo) !important;
          opacity: 1 !important;
          display:block !important;
          width: 108px !important;
          height: 42px !important;
          object-fit: contain !important;
          object-position:left center !important;
        }
        .home-brand-text { display:none !important; }
        .home-hero::before, .home-hero::after, .home-shell::before, .home-shell::after { display:none !important; }
        .home-console, .home-why-card, .home-feature, .home-preview-card, .home-faq-item, .pricing-card, .home-contact-card {
          background: var(--bg-card) !important;
          border-color: var(--border) !important;
          box-shadow: var(--shadow-md) !important;
        }
        :root[data-theme='dark'] .home-console,
        :root[data-theme='dark'] .home-why-card,
        :root[data-theme='dark'] .home-feature,
        :root[data-theme='dark'] .home-preview-card,
        :root[data-theme='dark'] .home-faq-item,
        :root[data-theme='dark'] .pricing-card,
        :root[data-theme='dark'] .home-contact-card { background-image:none !important; }
        .home-kicker, .home-feature > svg, .home-live, .home-feed-amount { color:var(--arofi-accent) !important; }
        .home-bar { background:var(--arofi-accent) !important; }
        .home-shell .btn-primary {
          background:var(--arofi-accent-strong) !important;
          border-color:var(--arofi-accent-strong) !important;
          box-shadow:none !important;
        }
        .home-shell .btn-ghost { background:var(--bg-card) !important;color:var(--text-1) !important;border-color:var(--border) !important; }
        .home-nav a,.home-section-head p,.home-feature p,.home-why-card p,.home-faq-item p { color:var(--text-2) !important; }

        .book-brand { position:relative;min-width:184px; }
        .book-brand::before { display:none !important;content:none !important; }
        .book-brand img {
          content:var(--arofi-logo) !important;
          opacity:1 !important;
          width:82px !important;
          height:34px !important;
          object-fit:contain !important;
        }
        :root[data-theme='dark'] .docs-book-shell { background:#0b0f14 !important;color:#eef2f7 !important; }
        :root[data-theme='dark'] .book-topbar,
        :root[data-theme='dark'] .book-contents { background:#111821 !important;border-color:#293442 !important;box-shadow:0 16px 34px rgba(0,0,0,.30) !important; }
        :root[data-theme='dark'] .book-page { background:#151c25 !important;color:#eef2f7 !important;border-color:#303c4b !important;box-shadow:0 22px 48px rgba(0,0,0,.34) !important; }
        :root[data-theme='dark'] .book-page h1,
        :root[data-theme='dark'] .book-page h2,
        :root[data-theme='dark'] .book-page h3,
        :root[data-theme='dark'] .book-brand { color:#f5f7fa !important; }
        :root[data-theme='dark'] .book-page p,
        :root[data-theme='dark'] .book-page li,
        :root[data-theme='dark'] .book-brand small { color:#aab5c3 !important; }
        :root[data-theme='dark'] .contents-item,
        :root[data-theme='dark'] .contents-search input,
        :root[data-theme='dark'] .book-top-actions a,
        :root[data-theme='dark'] .book-top-actions button { background:#151d27 !important;color:#dbe3ec !important;border-color:#2a3644 !important; }
        .contents-item.active { border-color:var(--arofi-accent-line) !important;background:var(--arofi-accent-soft) !important; }

        /* Remove the obsolete shield logo from sign-in and Aria. */
        .login-logo {
          content:var(--arofi-logo) !important;
          width:150px !important;
          height:58px !important;
          object-fit:contain !important;
          border:0 !important;
          border-radius:0 !important;
          background:transparent !important;
          box-shadow:none !important;
        }
        @media (max-width:760px) {
          .home-brand { min-width:92px !important; }
          .home-brand img { width:92px !important;height:38px !important; }
        }
      `}</style>
    </>
  )
}
