'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeRefresh, type RealtimeEventType, REALTIME_EVENT_TYPES } from '@/lib/realtime'

// Server-rendered pages (dashboard, routers, sessions, observability) go
// realtime through this component: the PRIMARY update path is the SSE event
// stream — any relevant event soft-refreshes the server data (no full page
// flash, client state preserved) within well under 2 seconds. The interval
// refresh remains only as a fallback for when the stream is unavailable.
export function DashboardAutoRefresh({
  intervalMs = 1000,
  eventTypes = REALTIME_EVENT_TYPES,
}: {
  intervalMs?: number
  eventTypes?: readonly RealtimeEventType[]
}) {
  const router = useRouter()

  useRealtimeRefresh(() => router.refresh(), eventTypes, 250)

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
