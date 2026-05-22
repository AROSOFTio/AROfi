'use client'

import { useEffect, useState } from 'react'
import type { RouterItem, RouterOverviewResponse } from '@/lib/admin-types'
import { clientFetchApi } from '@/lib/client-api'

function formatRouterSignal(router?: RouterItem | null) {
  if (!router?.lastSignalSource || typeof router.secondsSinceLastSignal !== 'number') {
    return 'Waiting for a real router signal.'
  }
  if (router.secondsSinceLastSignal < 3) {
    return `${router.lastSignalSource} just now`
  }
  if (router.secondsSinceLastSignal < 60) {
    return `${router.lastSignalSource} ${router.secondsSinceLastSignal}s ago`
  }
  return `${router.lastSignalSource} ${Math.floor(router.secondsSinceLastSignal / 60)}m ago`
}

export default function LiveRouterStatusCard({ initialRouters }: { initialRouters: RouterItem[] }) {
  const [routers, setRouters] = useState(initialRouters)

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const overview = await clientFetchApi<RouterOverviewResponse>('/routers/overview')
        setRouters(overview.routers)
      } catch {
        // Keep the last visible router state until the next poll succeeds.
      }
    }, 2000)

    return () => window.clearInterval(interval)
  }, [])

  const primaryRouter = routers[0]
  const isLive = Boolean(primaryRouter?.isLiveNow || primaryRouter?.liveState === 'LIVE')

  return (
    <div className="card" style={{ borderColor: isLive ? 'var(--green-mid)' : 'var(--border)' }}>
      <div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            className={isLive ? 'live-dot' : undefined}
            style={{
              width: 14,
              height: 14,
              borderRadius: 99,
              background: isLive ? 'var(--success-fg)' : 'var(--danger-fg)',
              boxShadow: isLive ? '0 0 0 4px var(--success-bg)' : '0 0 0 4px var(--danger-bg)',
            }}
          />
          <div>
            <div style={{ color: 'var(--text-1)', fontWeight: 800, fontSize: 16 }}>
              {primaryRouter ? `${primaryRouter.name}: ${isLive ? 'Live' : primaryRouter.liveState === 'PENDING' ? 'Pending' : 'Offline'}` : 'No router connected'}
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
              {primaryRouter ? formatRouterSignal(primaryRouter) : 'Register a MikroTik router under Routers to start live monitoring.'}
            </div>
          </div>
        </div>
        <a href="/routers" className="btn btn-ghost">{routers.length > 0 ? 'Open Routers' : 'Connect Router'}</a>
      </div>
    </div>
  )
}
