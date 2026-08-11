'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Map, PackagePlus, Router, Ticket, X } from 'lucide-react'
import { clientFetchApi } from '@/lib/client-api'
import type { RouterOverviewResponse } from '@/lib/admin-types'

const DISMISS_KEY = 'arofi-router-nudge-dismissed'

export default function RouterOnboardingNudge({ enabled }: { enabled: boolean }) {
  const [routerCount, setRouterCount] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

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

  return (
    <div className="router-nudge" role="status" aria-live="polite">
      <button type="button" className="router-nudge-close" onClick={close} aria-label="Hide router setup reminder">
        <X size={14} />
      </button>
      <div className="router-nudge-head">
        <span><Map size={15} /> Setup tour</span>
        <strong>Add your first router to go live</strong>
      </div>
      <div className="router-nudge-steps">
        <Link href="/admin/settings/routers?add=true"><Router size={15} /> Add router</Link>
        <Link href="/packages"><PackagePlus size={15} /> Create packages</Link>
        <Link href="/vouchers"><Ticket size={15} /> Create vouchers</Link>
      </div>
    </div>
  )
}
