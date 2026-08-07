'use client'

import { useEffect, useRef } from 'react'

// All event types published by the API realtime bus
// (apps/api/src/modules/events/realtime-events.service.ts). SSE named events
// require one listener per type on the EventSource.
export const REALTIME_EVENT_TYPES = [
  'payment.completed',
  'payment.failed',
  'payment.amount_mismatch',
  'activation.created',
  'activation.expired',
  'activation.quota_exhausted',
  'voucher.redeemed',
  'session.started',
  'session.updated',
  'session.stopped',
  'radius.auth',
  'router.heartbeat',
  'router.online',
  'router.stale',
  'router.offline',
  'disconnect.requested',
  'disconnect.succeeded',
  'disconnect.failed',
  'alert',
] as const

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number]
export type RealtimeConnectionState = 'connecting' | 'open' | 'error'

export type RealtimeEvent = {
  id: string
  type: RealtimeEventType
  tenantId: string | null
  routerId: string | null
  at: string
  data: Record<string, unknown>
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

// Subscribes to the admin realtime event stream. Authentication is the
// HttpOnly admin session cookie, which EventSource sends automatically on
// same-origin requests. EventSource reconnects on its own (resuming from
// Last-Event-ID), so a network blip self-heals.
export function useRealtimeEvents(
  onEvent: (event: RealtimeEvent) => void,
  types: readonly RealtimeEventType[] = REALTIME_EVENT_TYPES,
  onStatus?: (state: RealtimeConnectionState) => void,
) {
  const handlerRef = useRef(onEvent)
  const statusRef = useRef(onStatus)
  handlerRef.current = onEvent
  statusRef.current = onStatus

  // Keying the effect on the type LIST content (not array identity) avoids
  // tearing the connection down every render when callers pass literals.
  const typesKey = types.join(',')

  useEffect(() => {
    statusRef.current?.('connecting')
    const source = new EventSource(`${apiBase}/events/stream`, { withCredentials: true })

    const listener = (raw: MessageEvent) => {
      try {
        const event = JSON.parse(raw.data) as RealtimeEvent
        handlerRef.current(event)
      } catch {
        // Malformed frame — skip.
      }
    }

    source.onopen = () => statusRef.current?.('open')
    source.onerror = () => statusRef.current?.('error')

    for (const type of typesKey.split(',').filter(Boolean)) {
      source.addEventListener(type, listener)
    }

    return () => {
      source.close()
    }
  }, [typesKey])
}

// Convenience wrapper for pages that just re-fetch server data when anything
// relevant changes: invokes `refresh` debounced so an event burst (e.g. one
// accounting sweep touching 30 sessions) causes one refresh, not 30.
export function useRealtimeRefresh(
  refresh: () => void,
  types: readonly RealtimeEventType[] = REALTIME_EVENT_TYPES,
  debounceMs = 400,
) {
  const timerRef = useRef<number | null>(null)
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useRealtimeEvents(() => {
    if (timerRef.current !== null) {
      return
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      refreshRef.current()
    }, debounceMs)
  }, types)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])
}
