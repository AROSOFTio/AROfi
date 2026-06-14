'use client'
import { useEffect, useState } from 'react'

export default function ThemeToggle({ variant = 'icon' }: { variant?: 'icon' | 'segmented' }) {
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('arofi-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved ? saved === 'dark' : prefersDark
    setDark(isDark)
    setMounted(true)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [])

  function apply(next: boolean) {
    setDark(next)
    const theme = next ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('arofi-theme', theme)
  }

  if (variant === 'segmented') {
    return (
      <div className="theme-switch" role="group" aria-label="Color theme">
        <button
          type="button"
          className={`theme-switch-option ${mounted && !dark ? 'active' : ''}`}
          aria-pressed={mounted && !dark}
          onClick={() => apply(false)}
        >
          <SunIcon />
          <span>Light</span>
        </button>
        <button
          type="button"
          className={`theme-switch-option ${mounted && dark ? 'active' : ''}`}
          aria-pressed={mounted && dark}
          onClick={() => apply(true)}
        >
          <MoonIcon />
          <span>Dark</span>
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => apply(!dark)}
      className="theme-toggle"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
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
