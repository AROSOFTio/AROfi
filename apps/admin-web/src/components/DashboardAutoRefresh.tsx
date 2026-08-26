'use client'

import { useEffect } from 'react'
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

// Server-rendered dashboard pages are deliberately quiet. Realtime bursts are
// coalesced for 10 seconds, and the timer is only a low-frequency safety net.
// This keeps dashboards useful without continuously re-running their expensive
// server-side API fan-out.
export function DashboardAutoRefresh({
  intervalMs = 180_000,
  eventTypes = DASHBOARD_EVENT_TYPES,
}: {
  intervalMs?: number
  eventTypes?: readonly RealtimeEventType[]
}) {
  const router = useRouter()

  useRealtimeRefresh(() => router.refresh(), eventTypes, 10_000)

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
