import { Injectable, Logger } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'
import { randomUUID } from 'crypto'

// Every state change the admin dashboard cares about flows through this bus.
// Publishers are the payment/voucher/RADIUS/router lifecycle services; the
// single consumer is the SSE controller (events.controller.ts), which fans
// events out to connected admin browsers within milliseconds. Polling remains
// only as a fallback — this bus is the primary realtime mechanism.
export type RealtimeEventType =
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.amount_mismatch'
  | 'activation.created'
  | 'activation.expired'
  | 'activation.quota_exhausted'
  | 'voucher.redeemed'
  | 'session.started'
  | 'session.updated'
  | 'session.stopped'
  | 'radius.auth'
  | 'router.heartbeat'
  | 'router.online'
  | 'router.stale'
  | 'router.offline'
  | 'disconnect.requested'
  | 'disconnect.succeeded'
  | 'disconnect.failed'
  | 'alert'

export type RealtimeEvent = {
  id: string
  type: RealtimeEventType
  // null = platform-wide event, visible to platform admins only.
  tenantId: string | null
  routerId: string | null
  at: string
  data: Record<string, unknown>
}

const REPLAY_BUFFER_SIZE = 200

@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name)
  private readonly subject = new Subject<RealtimeEvent>()
  // Short replay buffer so an SSE client that reconnects with Last-Event-ID
  // (network blip, mobile radio sleep) does not miss events in the gap.
  private readonly buffer: RealtimeEvent[] = []

  publish(
    type: RealtimeEventType,
    input: {
      tenantId?: string | null
      routerId?: string | null
      data?: Record<string, unknown>
    } = {},
  ): RealtimeEvent {
    const event: RealtimeEvent = {
      id: randomUUID(),
      type,
      tenantId: input.tenantId ?? null,
      routerId: input.routerId ?? null,
      at: new Date().toISOString(),
      data: input.data ?? {},
    }

    this.buffer.push(event)
    if (this.buffer.length > REPLAY_BUFFER_SIZE) {
      this.buffer.splice(0, this.buffer.length - REPLAY_BUFFER_SIZE)
    }

    try {
      this.subject.next(event)
    } catch (error) {
      // A broken subscriber must never break the publishing code path
      // (payment activation, expiry worker, etc).
      this.logger.warn(
        `Realtime event fan-out failed for ${type}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return event
  }

  stream(): Observable<RealtimeEvent> {
    return this.subject.asObservable()
  }

  // Events published after the given event id (exclusive). Used for SSE
  // Last-Event-ID resume. Returns an empty list when the id is unknown
  // (fell out of the buffer) — the client falls back to its poll refresh.
  eventsSince(lastEventId: string): RealtimeEvent[] {
    const index = this.buffer.findIndex((event) => event.id === lastEventId)
    if (index === -1) {
      return []
    }
    return this.buffer.slice(index + 1)
  }
}
