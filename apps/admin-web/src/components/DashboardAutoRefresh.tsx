'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeRefresh, type RealtimeEventType } from '@/lib/realtime'

// Only events that materially change dashboard-level information should trigger
// a full server render. High-frequency telemetry such as router heartbeats,
// RADIUS auth and session.updated is intentionally excluded; those signals are
// handled by their focused pages and would otherwise fan out into many API/DB
// calls for every open dashboard.
const DASHBOARD_EVENT_TYPES: readonly RealtimeEventType[] = [
  'payment.completed',
  'payment.failed',
  'payment.amount_mismatch',
  'activation.created',
  'activation.expired',
  'activation.quota_exhausted',
  'voucher.redeemed',
  'session.started',
  'session.stopped',
  'router.online',
  'router.stale',
  'router.offline',
  'disconnect.succeeded',
  'disconnect.failed',
  'alert',
]

const MIN_REFRESH_GAP_MS = 5_000

// Server-rendered dashboard pages are deliberately quiet. Realtime bursts are
// coalesced for 10 seconds, and the timer is only a low-frequency safety net.
// Hidden tabs do not keep a polling timer alive or execute realtime-triggered
// refreshes. When a tab becomes visible again we refresh once if the shared
// dedupe window allows it, then restart the fallback timer from that point.
export function DashboardAutoRefresh({
  intervalMs = 180_000,
  eventTypes = DASHBOARD_EVENT_TYPES,
}: {
  intervalMs?: number
  eventTypes?: readonly RealtimeEventType[]
}) {
  const router = useRouter()
  const lastRefreshAtRef = useRef(0)

  const refreshIfVisible = useCallback(() => {
    if (document.visibilityState !== 'visible') return false

    const now = Date.now()
    if (now - lastRefreshAtRef.current < MIN_REFRESH_GAP_MS) return false

    lastRefreshAtRef.current = now
    router.refresh()
    return true
  }, [router])

  useRealtimeRefresh(() => refreshIfVisible(), eventTypes, 10_000)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const clearRefreshTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const scheduleRefresh = () => {
      clearRefreshTimer()
      if (document.visibilityState !== 'visible') return

      timeoutId = setTimeout(() => {
        refreshIfVisible()
        scheduleRefresh()
      }, intervalMs)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Use the same minimum gap as timer/realtime refreshes so a quick tab
        // switch cannot force a duplicate full server render immediately after
        // another dashboard refresh.
        refreshIfVisible()
        scheduleRefresh()
      } else {
        clearRefreshTimer()
      }
    }

    scheduleRefresh()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearRefreshTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [intervalMs, refreshIfVisible])

  return null
}
