'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeRefresh, type RealtimeEventType, REALTIME_EVENT_TYPES } from '@/lib/realtime'

// A router heartbeat arrives every second, even when nothing changed. Refreshing
// the entire server dashboard for every beat wastes CPU and can make genuine
// count changes appear delayed behind overlapping requests. Heartbeat handling
// publishes session.updated whenever the router's active-user count changes, so
// refresh on state changes and router transitions, not on unchanged beats.
const DASHBOARD_EVENT_TYPES = REALTIME_EVENT_TYPES.filter(
  (type): type is RealtimeEventType => type !== 'router.heartbeat',
)

// Server-rendered pages (dashboard, routers, sessions, observability) go
// realtime through this component: the PRIMARY update path is the SSE event
// stream — any relevant event soft-refreshes the server data (no full page
// flash, client state preserved) within roughly 1–2 seconds. The interval
// refresh remains only as a fallback for when the stream is unavailable.
export function DashboardAutoRefresh({
  intervalMs = 5000,
  eventTypes = DASHBOARD_EVENT_TYPES,
}: {
  intervalMs?: number
  eventTypes?: readonly RealtimeEventType[]
}) {
  const router = useRouter()

  useRealtimeRefresh(() => router.refresh(), eventTypes, 150)

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
