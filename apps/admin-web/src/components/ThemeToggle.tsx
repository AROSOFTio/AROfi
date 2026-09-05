'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'

type ThemePreference = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

const options: Array<{ key: ThemePreference; label: string; icon: typeof Sun }> = [
  { key: 'system', label: 'Auto', icon: Monitor },
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
]

function readPreference(): ThemePreference {
  let saved: string | null = null
  try {
    saved = localStorage.getItem('arofi-theme')
  } catch {
    // Cookies are used as a fallback below.
  }
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

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference)
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.style.colorScheme = resolved
  // Core AROFi actions are green. Tenant-uploaded branding remains separate.
  document.documentElement.setAttribute('data-accent-theme', 'green')
  try {
    localStorage.setItem('arofi-theme', preference)
    localStorage.setItem('arofi-accent-theme', 'green')
  } catch {
    // Cookie persistence below remains available when storage is restricted.
  }
  document.cookie = `arofi-theme=${preference}; Max-Age=31536000; Path=/; SameSite=Lax`
  document.cookie = 'arofi-accent-theme=green; Max-Age=31536000; Path=/; SameSite=Lax'
  return resolved
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [preference, setPreference] = useState<ThemePreference>('system')
  const [resolved, setResolved] = useState<ResolvedTheme>('light')
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initial = readPreference()
    setPreference(initial)
    setResolved(applyTheme(initial))
    setMounted(true)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemThemeChange = () => {
      if (readPreference() === 'system') setResolved(applyTheme('system'))
    }
    media.addEventListener?.('change', onSystemThemeChange)
    return () => media.removeEventListener?.('change', onSystemThemeChange)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function choose(nextPreference: ThemePreference) {
    setPreference(nextPreference)
    setResolved(applyTheme(nextPreference))
    setOpen(false)
  }

  const ActiveIcon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun

  if (compact) {
    return (
      <div className="topbar-theme" ref={rootRef}>
        <button
          type="button"
          className="topbar-theme-trigger"
          aria-label={`Theme: ${options.find((option) => option.key === preference)?.label ?? 'Auto'}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ActiveIcon size={15} />
          <span>{mounted ? options.find((option) => option.key === preference)?.label : 'Auto'}</span>
        </button>
        {open && (
          <div className="theme-menu" role="menu" aria-label="Theme">
            {options.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={preference === option.key}
                  className={`theme-menu-option ${preference === option.key ? 'active' : ''}`}
                  onClick={() => choose(option.key)}
                >
                  <Icon size={15} />
                  <span style={{ flex: 1 }}>{option.label}</span>
                  {preference === option.key && <Check size={14} />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="appearance-settings">
      <div className="form-subheading">Mode</div>
      <div className="theme-switch appearance-mode-switch" role="group" aria-label="Dashboard colour mode">
        {options.map((option) => {
          const Icon = option.icon
          return (
            <button
              key={option.key}
              type="button"
              className={`theme-switch-option ${mounted && preference === option.key ? 'active' : ''}`}
              aria-pressed={mounted && preference === option.key}
              onClick={() => choose(option.key)}
            >
              <Icon size={16} />
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
      <p className="appearance-save-status" role="status" aria-live="polite" style={{ marginTop: 10 }}>
        {preference === 'system'
          ? `Automatically follows this device (${resolved}).`
          : `${preference === 'dark' ? 'Dark' : 'Light'} mode is saved for this device.`}
      </p>
    </div>
  )
}
