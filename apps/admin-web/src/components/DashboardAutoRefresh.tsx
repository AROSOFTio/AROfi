'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeRefresh, type RealtimeEventType, REALTIME_EVENT_TYPES } from '@/lib/realtime'

// Router heartbeats are intentionally excluded from full dashboard refreshes.
// The heartbeat already updates router/session state server-side, and refreshing
// every dashboard for unchanged beats creates avoidable API/database pressure.
const DASHBOARD_EVENT_TYPES = REALTIME_EVENT_TYPES.filter(
  (type): type is RealtimeEventType => type !== 'router.heartbeat',
)

// Server-rendered dashboard pages refresh from meaningful realtime events.
// Coalesce bursts for 5 seconds so a busy hotspot does not trigger overlapping
// expensive server renders, while live counts still update on a near-live cadence.
// The interval refresh remains only as a fallback when the event stream is unavailable.
export function DashboardAutoRefresh({
  intervalMs = 60_000,
  eventTypes = DASHBOARD_EVENT_TYPES,
}: {
  intervalMs?: number
  eventTypes?: readonly RealtimeEventType[]
}) {
  const router = useRouter()

  useRealtimeRefresh(() => router.refresh(), eventTypes, 5_000)

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
