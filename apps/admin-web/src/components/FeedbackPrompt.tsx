'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'arofi-feedback-last-prompted-at'
const PROMPT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000
const PROMPT_DELAY_MS = 90 * 1000

export default function FeedbackPrompt({ enabled }: { enabled: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!enabled || pathname === '/feedback' || pathname === '/support') return
    const lastPromptedAt = Number(localStorage.getItem(STORAGE_KEY) ?? 0)
    if (Date.now() - lastPromptedAt < PROMPT_INTERVAL_MS) return
    const timer = window.setTimeout(() => setOpen(true), PROMPT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [enabled, pathname])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
    setOpen(false)
  }

  if (!open) return null

  return <aside aria-label='Product feedback invitation' style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 900, width: 'min(380px, calc(100vw - 32px))', padding: 18, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
    <strong style={{ color: 'var(--text-primary)' }}>What could AROFi improve?</strong>
    <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5, margin: '7px 0 14px' }}>Suggest a feature, recommend a change, or leave a quick product review.</p>
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
      <Link href='/feedback' className='btn btn-primary' onClick={dismiss}>Share Feedback</Link>
      <button type='button' className='btn btn-ghost' onClick={dismiss}>Not now</button>
    </div>
  </aside>
}
