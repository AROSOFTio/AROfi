'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Map, Router, X } from 'lucide-react'
import { clientFetchApi } from '@/lib/client-api'
import type { RouterOverviewResponse } from '@/lib/admin-types'

const DISMISS_KEY = 'arofi-router-nudge-dismissed'

export default function RouterOnboardingNudge({ enabled }: { enabled: boolean }) {
  const [routerCount, setRouterCount] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [tourStep, setTourStep] = useState(0)

  useEffect(() => {
    if (!enabled) return
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1')
    clientFetchApi<RouterOverviewResponse>('/routers/overview')
      .then((overview) => setRouterCount(overview.summary.totalRouters ?? overview.routers.length))
      .catch(() => setRouterCount(null))
  }, [enabled])

  if (!enabled || dismissed || routerCount !== 0) {
    return null
  }

  const close = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const steps = [
    {
      title: 'Welcome to AROFi',
      message: 'Use the menu to manage your hotspot business. This guide is optional and never blocks your work.',
    },
    {
      title: 'Connect your router',
      message: 'When you are ready, add a MikroTik router and run the generated setup script.',
    },
    {
      title: 'Sell when you choose',
      message: 'Internet plans and vouchers are optional tools under Sell Internet. Create them only when you are ready to sell.',
    },
  ]
  const step = steps[tourStep]

  return (
    <div className="router-nudge" role="status" aria-live="polite">
      <button type="button" className="router-nudge-close" onClick={close} aria-label="Hide router setup reminder">
        <X size={14} />
      </button>
      <div className="router-nudge-head">
        <span><Map size={15} /> Setup tour</span>
        <strong>{step.title}</strong>
      </div>
      <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.45 }}>{step.message}</p>
      <div className="router-nudge-steps">
        {tourStep === 1 && <Link href="/admin/settings/routers?add=true"><Router size={15} /> Add router</Link>}
        <button type="button" className="btn btn-ghost" onClick={() => setTourStep((current) => Math.max(0, current - 1))} disabled={tourStep === 0} aria-label="Previous tour step"><ArrowLeft size={15} /></button>
        <button type="button" className="btn btn-ghost" onClick={() => setTourStep((current) => Math.min(steps.length - 1, current + 1))} disabled={tourStep === steps.length - 1} aria-label="Next tour step"><ArrowRight size={15} /></button>
      </div>
    </div>
  )
}
