'use client'

import { useEffect, useRef } from 'react'

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

type SharedSubscriber = {
  types: Set<RealtimeEventType>
  onEvent: (event: RealtimeEvent) => void
  onStatus?: (state: RealtimeConnectionState) => void
}

const sharedSubscribers = new Set<SharedSubscriber>()
let sharedSource: EventSource | null = null
let sharedState: RealtimeConnectionState = 'connecting'

function publishSharedStatus(state: RealtimeConnectionState) {
  sharedState = state
  for (const subscriber of sharedSubscribers) {
    subscriber.onStatus?.(state)
  }
}

function publishSharedEvent(raw: MessageEvent) {
  try {
    const event = JSON.parse(raw.data) as RealtimeEvent
    for (const subscriber of sharedSubscribers) {
      if (subscriber.types.has(event.type)) {
        subscriber.onEvent(event)
      }
    }
  } catch {
    // Malformed frame — skip.
  }
}

function ensureSharedSource() {
  if (sharedSource || typeof window === 'undefined') return

  publishSharedStatus('connecting')
  const source = new EventSource(`${apiBase}/events/stream`, { withCredentials: true })
  sharedSource = source
  source.onopen = () => publishSharedStatus('open')
  source.onerror = () => publishSharedStatus('error')

  for (const type of REALTIME_EVENT_TYPES) {
    source.addEventListener(type, publishSharedEvent)
  }
}

function subscribeSharedRealtime(subscriber: SharedSubscriber) {
  sharedSubscribers.add(subscriber)
  ensureSharedSource()
  subscriber.onStatus?.(sharedState)

  return () => {
    sharedSubscribers.delete(subscriber)
    if (sharedSubscribers.size === 0 && sharedSource) {
      sharedSource.close()
      sharedSource = null
      sharedState = 'connecting'
    }
  }
}

// All realtime consumers in a browser tab share one authenticated EventSource.
// Subscribers still receive only the event types they requested, but opening a
// focused page no longer creates another SSE connection and another auth path.
export function useRealtimeEvents(
  onEvent: (event: RealtimeEvent) => void,
  types: readonly RealtimeEventType[] = REALTIME_EVENT_TYPES,
  onStatus?: (state: RealtimeConnectionState) => void,
) {
  const handlerRef = useRef(onEvent)
  const statusRef = useRef(onStatus)
  handlerRef.current = onEvent
  statusRef.current = onStatus
  const typesKey = types.join(',')

  useEffect(() => {
    const subscriber: SharedSubscriber = {
      types: new Set(typesKey.split(',').filter(Boolean) as RealtimeEventType[]),
      onEvent: (event) => handlerRef.current(event),
      onStatus: (state) => statusRef.current?.(state),
    }
    return subscribeSharedRealtime(subscriber)
  }, [typesKey])
}

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
