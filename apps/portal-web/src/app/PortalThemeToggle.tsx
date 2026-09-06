'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'

type Preference = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

const options: Array<{ key: Preference; label: string; icon: typeof Sun }> = [
  { key: 'system', label: 'Auto', icon: Monitor },
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
]

function readPreference(): Preference {
  let saved: string | null = null
  try { saved = localStorage.getItem('arofi-theme') } catch {}
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
  try { localStorage.setItem('arofi-theme', preference) } catch {}
  document.cookie = `arofi-theme=${preference}; Max-Age=31536000; Path=/; SameSite=Lax`
  return resolved
}

export default function PortalThemeToggle() {
  const [preference, setPreference] = useState<Preference>('system')
  const [resolved, setResolved] = useState<ResolvedTheme>('light')
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function choose(next: Preference) {
    setPreference(next)
    setResolved(applyTheme(next))
    setOpen(false)
  }

  const ActiveIcon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun

  return (
    <div className="portal-theme-menu" ref={rootRef}>
      <button
        type="button"
        className="portal-theme-trigger"
        aria-label={`Theme: ${options.find((option) => option.key === preference)?.label ?? 'Auto'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ActiveIcon size={15} />
        <span>{mounted ? options.find((option) => option.key === preference)?.label : 'Auto'}</span>
      </button>
      {open && (
        <div className="portal-theme-popover" role="menu" aria-label="Theme">
          {options.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.key}
                type="button"
                role="menuitemradio"
                aria-checked={preference === option.key}
                className={preference === option.key ? 'active' : ''}
                onClick={() => choose(option.key)}
              >
                <Icon size={15} />
                <span>{option.label}</span>
                {preference === option.key && <Check size={14} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
