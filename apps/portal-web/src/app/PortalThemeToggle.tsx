'use client'

import { useEffect, useState } from 'react'

type Preference = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

function readPreference(): Preference {
  let saved: string | null = null
  try {
    saved = localStorage.getItem('arofi-theme')
  } catch {}

  if (!saved) {
    const cookies = document.cookie.split('; ').reduce<Record<string, string>>((values, item) => {
      const [key, ...parts] = item.split('=')
      values[key] = parts.join('=')
      return values
    }, {})
    saved = cookies['arofi-theme'] ?? null
  }

  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

function resolveTheme(preference: Preference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(preference: Preference) {
  const resolved = resolveTheme(preference)
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.setAttribute('data-accent-theme', 'green')
  document.documentElement.style.colorScheme = resolved
  try {
    localStorage.setItem('arofi-theme', preference)
  } catch {}
  document.cookie = `arofi-theme=${preference}; Max-Age=31536000; Path=/; SameSite=Lax`
  return resolved
}

export default function PortalThemeToggle() {
  const [preference, setPreference] = useState<Preference>('system')
  const [resolved, setResolved] = useState<ResolvedTheme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const initial = readPreference()
    setPreference(initial)
    setResolved(applyTheme(initial))
    setMounted(true)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (readPreference() === 'system') setResolved(applyTheme('system'))
    }
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])

  function choose(next: Preference) {
    setPreference(next)
    setResolved(applyTheme(next))
  }

  return (
    <div className="portal-theme-toggle" role="group" aria-label="AroFi portal appearance">
      {(['system', 'light', 'dark'] as Preference[]).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mounted && preference === option}
          title={option === 'system' ? `Auto (${resolved})` : option}
          onClick={() => choose(option)}
        >
          {option === 'system' ? 'Auto' : option === 'light' ? 'Light' : 'Dark'}
        </button>
      ))}
    </div>
  )
}
