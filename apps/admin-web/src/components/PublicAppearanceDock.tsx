'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

type Mode = 'light' | 'dark'

const MODE_KEY = 'arofi-theme'

export default function PublicAppearanceDock() {
  const pathname = usePathname()
  const [mode, setMode] = useState<Mode>('light')
  const [mounted, setMounted] = useState(false)

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
    const nextMode: Mode = saved === 'dark' || saved === 'light'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

    setMode(nextMode)
    applyMode(nextMode)
    setMounted(true)
  }, [])

  function applyMode(nextMode: Mode) {
    document.documentElement.setAttribute('data-theme', nextMode)
    document.documentElement.style.colorScheme = nextMode
    try {
      localStorage.setItem(MODE_KEY, nextMode)
    } catch {
      // Cookie persistence below is the fallback.
    }
    document.cookie = `${MODE_KEY}=${nextMode}; Max-Age=31536000; Path=/; SameSite=Lax`
  }

  function chooseMode(nextMode: Mode) {
    setMode(nextMode)
    applyMode(nextMode)
  }

  return (
    <>
      {visible && mounted ? (
        <aside className="public-mode-dock" aria-label="Website appearance">
          <button type="button" aria-label="Light mode" title="Light mode" aria-pressed={mode === 'light'} onClick={() => chooseMode('light')}>
            <SunIcon />
          </button>
          <button type="button" aria-label="Dark mode" title="Dark mode" aria-pressed={mode === 'dark'} onClick={() => chooseMode('dark')}>
            <MoonIcon />
          </button>
        </aside>
      ) : null}

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
          --arofi-accent: #059669;
          --arofi-accent-strong: #047857;
          --arofi-accent-soft: rgba(5, 150, 105, .11);
          --arofi-accent-line: rgba(5, 150, 105, .28);
          --arofi-logo: url('/brand/arofi-logo-green.svg');
          --arofi-mark: url('/brand/arofi-mark-green.svg');
          --green: #059669;
          --green-dark: #047857;
          --green-light: #ecfdf5;
          --green-mid: #a7f3d0;
          --green-soft: #d1fae5;
          --brand: #059669;
          --brand-2: #047857;
          --primary: 160 84% 39%;
          --ring: 160 84% 39%;
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
          --arofi-accent:#34d399;--arofi-accent-strong:#10b981;--green:#34d399;--green-dark:#6ee7b7;
          --green-light:rgba(16,185,129,.14);--green-mid:rgba(52,211,153,.30);--green-soft:rgba(16,185,129,.10);--brand:#34d399;--brand-2:#10b981;
        }
        :root[data-theme='dark'][data-accent-theme='gold'] {
          --arofi-accent:#f2bd58;--arofi-accent-strong:#d59a24;--green:#f2bd58;--green-dark:#f7cf7b;
          --green-light:rgba(213,154,36,.15);--green-mid:rgba(242,189,88,.30);--green-soft:rgba(213,154,36,.11);--brand:#f2bd58;--brand-2:#d59a24;
        }

        body { background: var(--bg-app) !important; color: var(--text-1); }
        :root[data-theme='dark'] body { background-image: none !important; }

        /* Public pages are always AROFi blue. Accent selection remains dashboard-only. */
        .home-shell, .docs-book-shell {
          --arofi-accent: #2563eb;
          --arofi-accent-strong: #1d4ed8;
          --arofi-accent-soft: rgba(37,99,235,.11);
          --arofi-accent-line: rgba(37,99,235,.28);
        }
        :root[data-theme='dark'] .home-shell,
        :root[data-theme='dark'] .docs-book-shell {
          --arofi-accent: #60a5fa;
          --arofi-accent-strong: #3b82f6;
          --arofi-accent-soft: rgba(59,130,246,.14);
          --arofi-accent-line: rgba(96,165,250,.30);
        }
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
          content: url('/brand/arofi-logo-blue.svg') !important;
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

        .public-mode-dock {
          position:fixed;
          z-index:250;
          top:76px;
          right:18px;
          display:flex;
          align-items:center;
          gap:3px;
          padding:3px;
          background:var(--bg-card);
          border:1px solid var(--border);
          border-radius:10px;
          box-shadow:var(--shadow-sm);
        }
        .public-mode-dock button {
          width:32px;
          height:32px;
          display:grid;
          place-items:center;
          padding:0;
          border:0;
          border-radius:7px;
          background:transparent;
          color:var(--text-3);
          cursor:pointer;
        }
        .public-mode-dock button:hover { color:var(--text-1);background:var(--bg-hover); }
        .public-mode-dock button[aria-pressed='true'] { color:#2563eb;background:#eff6ff; }
        :root[data-theme='dark'] .public-mode-dock button[aria-pressed='true'] { color:#60a5fa;background:rgba(59,130,246,.14); }

        .book-brand { position:relative;min-width:184px; }
        .book-brand::before { display:none !important;content:none !important; }
        .book-brand img {
          content:url('/brand/arofi-logo-blue.svg') !important;
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
          content:url('/brand/arofi-logo-blue.svg') !important;
          width:150px !important;
          height:58px !important;
          object-fit:contain !important;
          border:0 !important;
          border-radius:0 !important;
          background:transparent !important;
          box-shadow:none !important;
        }
        .chat-bubble {
          width:58px !important;
          height:58px !important;
          padding:0 !important;
          border:0 !important;
          border-radius:0 !important;
          background:transparent !important;
          box-shadow:none !important;
        }
        .chat-bubble-logo {
          content:url('/brand/arofi-mark-blue.svg') !important;
          width:56px !important;
          height:50px !important;
          object-fit:contain !important;
          border:0 !important;
          border-radius:0 !important;
          background:transparent !important;
          box-shadow:none !important;
        }

        @media (max-width:760px) {
          .public-mode-dock { top:auto;right:12px;bottom:12px; }
          .home-brand { min-width:92px !important; }
          .home-brand img { width:92px !important;height:38px !important; }
        }
      `}</style>
    </>
  )
}

function SunIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>
}

function MoonIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 15.1A8.4 8.4 0 0 1 8.9 3.2a8.5 8.5 0 1 0 11.9 11.9Z"/></svg>
}
