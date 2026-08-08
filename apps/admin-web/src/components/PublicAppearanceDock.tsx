'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

type Mode = 'light' | 'dark'
type Accent = 'blue' | 'green' | 'gold'

const MODE_KEY = 'arofi-theme'
const ACCENT_KEY = 'arofi-accent-theme'

const accents: Array<{ key: Accent; label: string; color: string }> = [
  { key: 'blue', label: 'Blue', color: '#2563eb' },
  { key: 'green', label: 'Green', color: '#059669' },
  { key: 'gold', label: 'Gold', color: '#d59a24' },
]

export default function PublicAppearanceDock() {
  const pathname = usePathname()
  const [mode, setMode] = useState<Mode>('light')
  const [accent, setAccent] = useState<Accent>('blue')
  const [mounted, setMounted] = useState(false)

  const visible = useMemo(() => {
    if (!pathname) return false
    return pathname === '/' || [
      '/docs', '/blog', '/referral-program', '/privacy', '/terms', '/contact', '/about',
    ].some((prefix) => pathname.startsWith(prefix))
  }, [pathname])

  useEffect(() => {
    const cookies = document.cookie.split('; ').reduce<Record<string, string>>((all, item) => {
      const [key, ...value] = item.split('=')
      all[key] = value.join('=')
      return all
    }, {})

    let storedMode: string | null = null
    let storedAccent: string | null = null
    try {
      storedMode = localStorage.getItem(MODE_KEY)
      storedAccent = localStorage.getItem(ACCENT_KEY)
    } catch {
      // Cookies remain available when local storage is restricted.
    }

    storedMode ||= cookies[MODE_KEY] ?? null
    storedAccent ||= cookies[ACCENT_KEY] ?? null
    const nextMode: Mode = storedMode === 'dark' || storedMode === 'light'
      ? storedMode
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const nextAccent: Accent = storedAccent === 'green' || storedAccent === 'gold' || storedAccent === 'blue'
      ? storedAccent
      : 'blue'

    setMode(nextMode)
    setAccent(nextAccent)
    apply(nextMode, nextAccent)
    setMounted(true)
  }, [])

  function apply(nextMode: Mode, nextAccent: Accent) {
    document.documentElement.setAttribute('data-theme', nextMode)
    document.documentElement.setAttribute('data-accent-theme', nextAccent)
    document.documentElement.style.colorScheme = nextMode
    try {
      localStorage.setItem(MODE_KEY, nextMode)
      localStorage.setItem(ACCENT_KEY, nextAccent)
    } catch {
      // Cookie persistence below is the fallback.
    }
    document.cookie = `${MODE_KEY}=${nextMode}; Max-Age=31536000; Path=/; SameSite=Lax`
    document.cookie = `${ACCENT_KEY}=${nextAccent}; Max-Age=31536000; Path=/; SameSite=Lax`
  }

  function chooseMode(nextMode: Mode) {
    setMode(nextMode)
    apply(nextMode, accent)
  }

  function chooseAccent(nextAccent: Accent) {
    setAccent(nextAccent)
    apply(mode, nextAccent)
  }

  return (
    <>
      {visible && mounted ? (
        <aside className="public-appearance-dock" aria-label="Website appearance">
          <img src={`/brand/arofi-badge-${accent}.svg`} alt={`AROFi ${accent} badge`} />
          <div className="public-mode-toggle" role="group" aria-label="Light or dark mode">
            <button type="button" aria-pressed={mode === 'light'} onClick={() => chooseMode('light')} title="Light mode">
              <SunIcon /> <span>Light</span>
            </button>
            <button type="button" aria-pressed={mode === 'dark'} onClick={() => chooseMode('dark')} title="Dark mode">
              <MoonIcon /> <span>Dark</span>
            </button>
          </div>
          <div className="public-accent-toggle" role="group" aria-label="AROFi colour theme">
            {accents.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-label={`${item.label} theme`}
                aria-pressed={accent === item.key}
                title={`${item.label} theme`}
                style={{ '--swatch': item.color } as React.CSSProperties}
                onClick={() => chooseAccent(item.key)}
              />
            ))}
          </div>
        </aside>
      ) : null}

      <style jsx global>{`
        :root,
        :root[data-accent-theme='blue'] {
          --arofi-accent: #2563eb;
          --arofi-accent-strong: #1d4ed8;
          --arofi-accent-soft: rgba(37, 99, 235, .11);
          --arofi-accent-line: rgba(37, 99, 235, .30);
          --arofi-badge: url('/brand/arofi-badge-blue.svg');
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
          --arofi-accent-line: rgba(5, 150, 105, .30);
          --arofi-badge: url('/brand/arofi-badge-green.svg');
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
          --arofi-accent-line: rgba(213, 154, 36, .34);
          --arofi-badge: url('/brand/arofi-badge-gold.svg');
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
          --glass-border: rgba(148,163,184,.17);
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
          --arofi-accent: #60a5fa; --arofi-accent-strong:#3b82f6; --green:#60a5fa; --green-dark:#93c5fd;
          --green-light:rgba(59,130,246,.14); --green-mid:rgba(96,165,250,.30); --green-soft:rgba(59,130,246,.10); --brand:#60a5fa; --brand-2:#3b82f6;
        }
        :root[data-theme='dark'][data-accent-theme='green'] {
          --arofi-accent: #34d399; --arofi-accent-strong:#10b981; --green:#34d399; --green-dark:#6ee7b7;
          --green-light:rgba(16,185,129,.14); --green-mid:rgba(52,211,153,.30); --green-soft:rgba(16,185,129,.10); --brand:#34d399; --brand-2:#10b981;
        }
        :root[data-theme='dark'][data-accent-theme='gold'] {
          --arofi-accent: #f2bd58; --arofi-accent-strong:#d59a24; --green:#f2bd58; --green-dark:#f7cf7b;
          --green-light:rgba(213,154,36,.15); --green-mid:rgba(242,189,88,.30); --green-soft:rgba(213,154,36,.11); --brand:#f2bd58; --brand-2:#d59a24;
        }

        body { background: var(--bg-app) !important; color: var(--text-1); }
        :root[data-theme='dark'] body { background-image: none !important; }

        .home-shell {
          background: var(--bg-app) !important;
          color: var(--text-1) !important;
        }
        .home-nav {
          background: color-mix(in srgb, var(--bg-card) 94%, transparent) !important;
          border-color: var(--border) !important;
          box-shadow: 0 6px 22px rgba(15,23,42,.05) !important;
        }
        :root[data-theme='dark'] .home-nav { box-shadow: 0 8px 24px rgba(0,0,0,.24) !important; }
        .home-brand { position: relative; min-width: 54px; }
        .home-brand img { opacity: 0 !important; width: 48px !important; height: 48px !important; }
        .home-brand::before {
          content: '';
          width: 48px;
          height: 48px;
          position: absolute;
          inset: 50% auto auto 0;
          transform: translateY(-50%);
          background: var(--arofi-badge) center/contain no-repeat;
        }
        .home-brand-text { display: none !important; }
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
        .home-kicker, .home-feature > svg, .home-live, .home-feed-amount, .home-bar { color: var(--arofi-accent) !important; }
        .home-bar { background: var(--arofi-accent) !important; }
        .btn-primary {
          background: var(--arofi-accent-strong) !important;
          border-color: var(--arofi-accent-strong) !important;
          box-shadow: none !important;
        }
        .btn-primary:hover { filter: brightness(1.05); transform: translateY(-1px); }
        .btn-ghost { background: var(--bg-card) !important; color: var(--text-1) !important; border-color: var(--border) !important; }
        .home-nav a, .home-section-head p, .home-feature p, .home-why-card p, .home-faq-item p { color: var(--text-2) !important; }

        .public-appearance-dock {
          position: fixed;
          z-index: 250;
          top: 76px;
          right: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px;
          border: 1px solid var(--border);
          border-radius: 15px;
          background: var(--glass-bg);
          box-shadow: var(--shadow-md);
          backdrop-filter: blur(var(--glass-blur));
        }
        .public-appearance-dock > img { width: 35px; height: 35px; object-fit: contain; }
        .public-mode-toggle { display:flex; padding:3px; gap:2px; border-radius:10px; background:var(--bg-hover); }
        .public-mode-toggle button {
          height:30px; padding:0 8px; display:flex; align-items:center; gap:5px; border:0; border-radius:8px;
          background:transparent; color:var(--text-3); font:700 11px/1 inherit; cursor:pointer;
        }
        .public-mode-toggle button[aria-pressed='true'] { background:var(--bg-card); color:var(--text-1); box-shadow:var(--shadow-sm); }
        .public-accent-toggle { display:flex; align-items:center; gap:5px; padding:0 3px; }
        .public-accent-toggle button {
          width:19px; height:19px; padding:0; border-radius:999px; cursor:pointer; background:var(--swatch);
          border:2px solid var(--bg-card); box-shadow:0 0 0 1px var(--border);
        }
        .public-accent-toggle button[aria-pressed='true'] { box-shadow:0 0 0 2px var(--bg-card),0 0 0 4px var(--arofi-accent); }

        .book-brand { position:relative; }
        .book-brand img { opacity:0 !important; width:39px !important; height:39px !important; }
        .book-brand::before { content:''; position:absolute; left:0; top:50%; width:39px; height:39px; transform:translateY(-50%); background:var(--arofi-badge) center/contain no-repeat; }
        :root[data-theme='dark'] .docs-book-shell { background:#0b0f14 !important; color:#eef2f7 !important; }
        :root[data-theme='dark'] .book-topbar,
        :root[data-theme='dark'] .book-contents { background:#111821 !important; border-color:#293442 !important; box-shadow:0 16px 34px rgba(0,0,0,.30) !important; }
        :root[data-theme='dark'] .book-page { background:#151c25 !important; color:#eef2f7 !important; border-color:#303c4b !important; box-shadow:0 22px 48px rgba(0,0,0,.34) !important; }
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
        :root[data-theme='dark'] .book-top-actions button { background:#151d27 !important; color:#dbe3ec !important; border-color:#2a3644 !important; }
        .contents-item.active { border-color:var(--arofi-accent-line) !important; background:var(--arofi-accent-soft) !important; }

        @media (max-width: 760px) {
          .public-appearance-dock { top:auto; right:auto; left:12px; bottom:12px; padding:6px; }
          .public-appearance-dock > img { width:30px; height:30px; }
          .public-mode-toggle button span { display:none; }
          .public-mode-toggle button { width:30px; justify-content:center; padding:0; }
        }
      `}</style>
    </>
  )
}

function SunIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>
}

function MoonIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 15.1A8.4 8.4 0 0 1 8.9 3.2a8.5 8.5 0 1 0 11.9 11.9Z"/></svg>
}
