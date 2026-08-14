#!/usr/bin/env python3
"""Replace the public homepage's conflicting mobile nav layers with one drawer.

The landing page accumulated several generations of <=760px CSS. The current
menu is split across separately positioned `.home-nav-links` and `.home-actions`
blocks, which can detach from each other and leave the close control outside the
visible drawer. This guarded build patch adds one explicit mobile drawer with an
in-drawer close button and appends final CSS authority for the public nav only.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "apps/admin-web/src/app/page.tsx"
CSS = ROOT / "apps/admin-web/src/app/globals.css"

DRAWER_MARKER = 'className="home-mobile-drawer"'
CSS_MARKER = "/* AROFi public mobile drawer authority — guarded build patch */"


def patch_page() -> None:
    source = PAGE.read_text(encoding="utf-8")
    updated = source

    # Escape should always close the mobile drawer, including when keyboard
    # focus is inside a link/button in the drawer.
    old_effect = '''  useEffect(() => {
    document.body.classList.toggle('home-nav-locked', mobileNavOpen)
    return () => document.body.classList.remove('home-nav-locked')
  }, [mobileNavOpen])

  const closeMobileNav = () => setMobileNavOpen(false)'''
    new_effect = '''  useEffect(() => {
    document.body.classList.toggle('home-nav-locked', mobileNavOpen)
    return () => document.body.classList.remove('home-nav-locked')
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileNavOpen])

  const closeMobileNav = () => setMobileNavOpen(false)'''

    if old_effect in updated:
        updated = updated.replace(old_effect, new_effect, 1)
    elif new_effect not in updated:
        raise RuntimeError("Public homepage mobile-nav effect anchor not found; refusing unsafe patch.")

    if DRAWER_MARKER not in updated:
        anchor = '''        </button>
        <div className="home-nav-links">'''
        replacement = '''        </button>

        <button
          type="button"
          className="home-public-nav-backdrop"
          aria-label="Close navigation menu"
          tabIndex={-1}
          onClick={closeMobileNav}
        />

        <aside
          className="home-mobile-drawer"
          aria-label="Mobile navigation"
          aria-hidden={!mobileNavOpen}
        >
          <div className="home-mobile-drawer-head">
            <Link href="/" className="home-mobile-drawer-brand" onClick={closeMobileNav} aria-label="AROFi home">
              <img src="/logo.png" alt="AROFi" />
            </Link>
            <button
              type="button"
              className="home-mobile-drawer-close"
              aria-label="Close navigation menu"
              onClick={closeMobileNav}
            >
              <X size={24} />
            </button>
          </div>

          <div className="home-mobile-drawer-links">
            <a href="#features" onClick={closeMobileNav}>Features</a>
            {SHOW_PRICING && <a href="#pricing" onClick={closeMobileNav}>Pricing</a>}
            <Link href="/referral-program" onClick={closeMobileNav}>Referral</Link>
            <a href="#faq" onClick={closeMobileNav}>FAQ</a>
            <a href="#contact" onClick={closeMobileNav}>Contact</a>
            <Link href="/blog" onClick={closeMobileNav}>Blog</Link>
          </div>

          <div className="home-mobile-drawer-actions">
            <div className="home-mode-toggle" role="group" aria-label="Website appearance">
              <button type="button" aria-pressed={mode === 'light'} onClick={() => chooseMode('light')}>
                <Sun size={15} />
                <span>Light</span>
              </button>
              <button type="button" aria-pressed={mode === 'dark'} onClick={() => chooseMode('dark')}>
                <Moon size={15} />
                <span>Dark</span>
              </button>
            </div>
            <Link href="/docs" className="btn btn-ghost" onClick={closeMobileNav}>Docs</Link>
            <a href={getAppLoginUrl()} className="btn btn-ghost" onClick={closeMobileNav}>Sign In</a>
            <button type="button" className="btn btn-primary" onClick={() => { closeMobileNav(); openRegister('FREE') }}>Register Free</button>
          </div>
        </aside>

        <div className="home-nav-links">'''

        if anchor not in updated:
            raise RuntimeError("Public homepage nav markup anchor not found; refusing unsafe patch.")
        updated = updated.replace(anchor, replacement, 1)

    if updated != source:
        PAGE.write_text(updated, encoding="utf-8")
        print("Public homepage mobile drawer markup updated.")
    else:
        print("Public homepage mobile drawer markup already current.")


def patch_css() -> None:
    css = CSS.read_text(encoding="utf-8")
    if CSS_MARKER in css:
        print("Public mobile drawer CSS authority already present.")
        return

    css += r'''

/* AROFi public mobile drawer authority — guarded build patch */
.home-public-nav-backdrop,
.home-mobile-drawer {
  display: none;
}

@media (max-width: 760px) {
  /* Disable every older two-piece mobile-menu implementation. */
  .home-nav > .home-nav-links,
  .home-nav > .home-actions {
    display: none !important;
    position: static !important;
    inset: auto !important;
    width: auto !important;
    min-height: 0 !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    transform: none !important;
  }

  .home-nav::before {
    content: none !important;
    display: none !important;
  }

  .home-public-nav-backdrop {
    display: block !important;
    position: fixed !important;
    inset: 0 !important;
    z-index: 9980 !important;
    width: 100vw !important;
    height: 100dvh !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: rgba(15, 23, 42, 0.48) !important;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 180ms ease, visibility 180ms ease;
  }

  .home-mobile-drawer {
    display: flex !important;
    position: fixed !important;
    top: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    left: auto !important;
    z-index: 9990 !important;
    box-sizing: border-box !important;
    width: min(320px, calc(100vw - 44px)) !important;
    max-width: calc(100vw - 44px) !important;
    height: 100dvh !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    flex-direction: column;
    background: var(--bg-card) !important;
    border: 0 !important;
    border-left: 1px solid var(--border) !important;
    border-radius: 0 !important;
    box-shadow: -18px 0 46px rgba(15, 23, 42, 0.24) !important;
    overflow: hidden !important;
    overscroll-behavior: contain;
    transform: translate3d(102%, 0, 0);
    visibility: hidden;
    pointer-events: none;
    transition: transform 220ms cubic-bezier(.2,.8,.2,1), visibility 220ms ease;
  }

  .home-nav.home-nav-open .home-public-nav-backdrop {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .home-nav.home-nav-open .home-mobile-drawer {
    transform: translate3d(0, 0, 0);
    visibility: visible;
    pointer-events: auto;
  }

  .home-mobile-drawer-head {
    position: relative;
    z-index: 2;
    flex: 0 0 auto;
    min-height: calc(64px + env(safe-area-inset-top));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: max(10px, env(safe-area-inset-top)) 12px 10px 14px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
  }

  .home-mobile-drawer-brand {
    display: inline-flex;
    align-items: center;
    min-width: 0;
  }

  .home-mobile-drawer-brand img {
    display: block;
    width: 40px !important;
    height: 40px !important;
    max-width: 40px !important;
    object-fit: contain;
    border-radius: 10px;
  }

  .home-mobile-drawer-close {
    display: inline-grid !important;
    place-items: center !important;
    flex: 0 0 44px !important;
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    min-height: 44px !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 1px solid var(--border) !important;
    border-radius: 10px !important;
    background: var(--bg-card) !important;
    color: var(--text-1) !important;
    box-shadow: none !important;
    cursor: pointer;
  }

  .home-mobile-drawer-close svg {
    width: 24px;
    height: 24px;
  }

  .home-mobile-drawer-links {
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 8px 14px 12px;
    background: var(--bg-card);
  }

  .home-mobile-drawer-links a {
    flex: 0 0 auto;
    min-height: 48px;
    display: flex;
    align-items: center;
    padding: 0 2px;
    border-bottom: 1px solid var(--border-soft);
    color: var(--text-1) !important;
    font-size: 14px;
    font-weight: 650;
    line-height: 1.25;
    text-decoration: none;
  }

  .home-mobile-drawer-actions {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 12px 14px calc(14px + env(safe-area-inset-bottom));
    background: var(--bg-card);
    border-top: 1px solid var(--border);
  }

  .home-mobile-drawer-actions .home-mode-toggle {
    grid-column: 1 / -1;
    width: 100%;
  }

  .home-mobile-drawer-actions .home-mode-toggle button {
    flex: 1 1 0;
    min-height: 38px !important;
  }

  .home-mobile-drawer-actions .btn {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 42px !important;
    padding: 8px 10px !important;
    justify-content: center;
    text-align: center;
    white-space: nowrap;
  }

  .home-mobile-drawer-actions .btn-primary {
    grid-column: 1 / -1;
  }
}

@media (max-width: 360px) {
  .home-mobile-drawer {
    width: calc(100vw - 32px) !important;
    max-width: calc(100vw - 32px) !important;
  }
}
'''

    CSS.write_text(css, encoding="utf-8")
    print("Public mobile drawer CSS authority appended.")


def main() -> None:
    patch_page()
    patch_css()


if __name__ == "__main__":
    main()
