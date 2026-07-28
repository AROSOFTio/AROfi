'use client'
import { useEffect, useState } from 'react'

type ModeTheme = 'light' | 'dark'
type AccentTheme = 'blue' | 'green' | 'gold'

const accentThemes: Array<{ key: AccentTheme; label: string; description: string; swatch: string }> = [
  { key: 'blue', label: 'Blue', description: 'Blue buttons, links, navigation, and logo.', swatch: '#2563eb' },
  { key: 'green', label: 'Green', description: 'Green buttons, links, navigation, and logo.', swatch: '#20a53a' },
  { key: 'gold', label: 'Gold', description: 'Warm premium gold accents for buttons and navigation.', swatch: '#b7791f' },
]

export default function ThemeToggle() {
  const [mode, setMode] = useState<ModeTheme>('light')
  const [accent, setAccent] = useState<AccentTheme>('blue')
  const [savedMode, setSavedMode] = useState<ModeTheme>('light')
  const [savedAccent, setSavedAccent] = useState<AccentTheme>('blue')
  const [mounted, setMounted] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    const cookieValues = document.cookie.split('; ').reduce<Record<string, string>>((values, item) => {
      const [key, ...parts] = item.split('=')
      values[key] = parts.join('=')
      return values
    }, {})
    let saved: string | null = null
    let savedAccent: string | null = null
    try {
      saved = localStorage.getItem('arofi-theme')
      savedAccent = localStorage.getItem('arofi-accent-theme')
    } catch {
      // Cookie persistence below still works when browser storage is restricted.
    }
    saved ||= cookieValues['arofi-theme'] ?? null
    savedAccent ||= cookieValues['arofi-accent-theme'] ?? null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const nextMode: ModeTheme = saved === 'dark' || saved === 'light' ? saved : prefersDark ? 'dark' : 'light'
    const nextAccent: AccentTheme = savedAccent === 'green' || savedAccent === 'gold' || savedAccent === 'blue' ? savedAccent : 'blue'
    setMode(nextMode)
    setAccent(nextAccent)
    setSavedMode(nextMode)
    setSavedAccent(nextAccent)
    setMounted(true)
    document.documentElement.setAttribute('data-theme', nextMode)
    document.documentElement.setAttribute('data-accent-theme', nextAccent)
  }, [])

  function saveTheme(nextMode = mode, nextAccent = accent) {
    let localStorageAvailable = true
    try {
      localStorage.setItem('arofi-theme', nextMode)
      localStorage.setItem('arofi-accent-theme', nextAccent)
    } catch {
      localStorageAvailable = false
    }
    document.cookie = `arofi-theme=${nextMode}; Max-Age=31536000; Path=/; SameSite=Lax`
    document.cookie = `arofi-accent-theme=${nextAccent}; Max-Age=31536000; Path=/; SameSite=Lax`
    document.documentElement.setAttribute('data-theme', nextMode)
    document.documentElement.setAttribute('data-accent-theme', nextAccent)
    setMode(nextMode)
    setAccent(nextAccent)
    setSavedMode(nextMode)
    setSavedAccent(nextAccent)
    setSavedMessage(localStorageAvailable
      ? 'Theme saved for the public website and dashboard.'
      : 'Theme saved with browser cookies for this device.')
  }

  const hasUnsavedChanges = mounted && (mode !== savedMode || accent !== savedAccent)

  return (
    <div className="appearance-settings">
        <div>
          <div className="form-subheading">Mode</div>
          <div className="theme-switch appearance-mode-switch" role="group" aria-label="Admin color mode">
            <button
              type="button"
              className={`theme-switch-option ${mounted && mode === 'light' ? 'active' : ''}`}
              aria-pressed={mounted && mode === 'light'}
              onClick={() => { setMode('light'); setSavedMessage('') }}
            >
              <SunIcon />
              <span>Light</span>
            </button>
            <button
              type="button"
              className={`theme-switch-option ${mounted && mode === 'dark' ? 'active' : ''}`}
              aria-pressed={mounted && mode === 'dark'}
              onClick={() => { setMode('dark'); setSavedMessage('') }}
            >
              <MoonIcon />
              <span>Dark</span>
            </button>
          </div>
        </div>

        <div>
          <div className="form-subheading">Accent</div>
          <div className="appearance-accent-grid" role="group" aria-label="Admin accent theme">
            {accentThemes.map((theme) => (
              <button
                key={theme.key}
                type="button"
                className={`appearance-accent-card ${mounted && accent === theme.key ? 'active' : ''}`}
                aria-pressed={mounted && accent === theme.key}
                onClick={() => { setAccent(theme.key); setSavedMessage('') }}
              >
                <span className="appearance-accent-swatch" style={{ background: theme.swatch }} />
                <span>
                  <strong>{theme.label}</strong>
                  <small>{theme.description}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="appearance-actions">
          <button type="button" className="btn btn-primary" onClick={() => saveTheme()} disabled={!hasUnsavedChanges}>
            Save theme
          </button>
          <p className="appearance-save-status" role="status" aria-live="polite">
            {savedMessage || (hasUnsavedChanges ? 'Unsaved changes.' : 'Saved theme loaded.')}
          </p>
        </div>
    </div>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}
