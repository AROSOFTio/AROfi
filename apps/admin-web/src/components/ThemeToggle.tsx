'use client'
import { useEffect, useState } from 'react'

type ModeTheme = 'light' | 'dark'
type AccentTheme = 'blue' | 'green' | 'white'
type Variant = 'icon' | 'segmented' | 'settings'

const accentThemes: Array<{ key: AccentTheme; label: string; description: string; swatch: string }> = [
  { key: 'blue', label: 'Blue', description: 'Blue buttons, links, navigation, and logo.', swatch: '#2563eb' },
  { key: 'green', label: 'Green', description: 'Green buttons, links, navigation, and logo.', swatch: '#20a53a' },
  { key: 'white', label: 'Neutral', description: 'Black, white, and grey throughout.', swatch: '#3a424d' },
]

export default function ThemeToggle({ variant = 'icon' }: { variant?: Variant }) {
  const [mode, setMode] = useState<ModeTheme>('light')
  const [accent, setAccent] = useState<AccentTheme>('blue')
  const [mounted, setMounted] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('arofi-theme')
    const savedAccent = localStorage.getItem('arofi-accent-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const nextMode: ModeTheme = saved === 'dark' || saved === 'light' ? saved : prefersDark ? 'dark' : 'light'
    const nextAccent: AccentTheme = savedAccent === 'green' || savedAccent === 'white' || savedAccent === 'blue' ? savedAccent : 'blue'
    setMode(nextMode)
    setAccent(nextAccent)
    setMounted(true)
    document.documentElement.setAttribute('data-theme', nextMode)
    document.documentElement.setAttribute('data-accent-theme', nextAccent)
  }, [])

  function applyMode(nextMode: ModeTheme) {
    setMode(nextMode)
    document.documentElement.setAttribute('data-theme', nextMode)
    localStorage.setItem('arofi-theme', nextMode)
    showSaved()
  }

  function applyAccent(nextAccent: AccentTheme) {
    setAccent(nextAccent)
    document.documentElement.setAttribute('data-accent-theme', nextAccent)
    localStorage.setItem('arofi-accent-theme', nextAccent)
    showSaved()
  }

  function showSaved() {
    setSavedMessage('Saved. This theme now applies to the website and dashboard.')
    window.setTimeout(() => setSavedMessage(''), 3500)
  }

  if (variant === 'settings') {
    return (
      <div className="appearance-settings">
        <div>
          <div className="form-subheading">Mode</div>
          <div className="theme-switch appearance-mode-switch" role="group" aria-label="Admin color mode">
            <button
              type="button"
              className={`theme-switch-option ${mounted && mode === 'light' ? 'active' : ''}`}
              aria-pressed={mounted && mode === 'light'}
              onClick={() => applyMode('light')}
            >
              <SunIcon />
              <span>Light</span>
            </button>
            <button
              type="button"
              className={`theme-switch-option ${mounted && mode === 'dark' ? 'active' : ''}`}
              aria-pressed={mounted && mode === 'dark'}
              onClick={() => applyMode('dark')}
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
                onClick={() => applyAccent(theme.key)}
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
        <p className="appearance-save-status" role="status" aria-live="polite">
          {savedMessage || 'Changes save automatically on this device.'}
        </p>
      </div>
    )
  }

  if (variant === 'segmented') {
    return (
      <div className="theme-switch" role="group" aria-label="Admin color mode">
        <button
          type="button"
          className={`theme-switch-option ${mounted && mode === 'light' ? 'active' : ''}`}
          aria-pressed={mounted && mode === 'light'}
          onClick={() => applyMode('light')}
        >
          <SunIcon />
          <span>Light</span>
        </button>
        <button
          type="button"
          className={`theme-switch-option ${mounted && mode === 'dark' ? 'active' : ''}`}
          aria-pressed={mounted && mode === 'dark'}
          onClick={() => applyMode('dark')}
        >
          <MoonIcon />
          <span>Dark</span>
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => applyMode(mode === 'dark' ? 'light' : 'dark')}
      className="theme-toggle"
      title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
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
