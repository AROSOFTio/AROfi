import { RealtimeEventsService } from './realtime-events.service'

describe('RealtimeEventsService', () => {
  it('delivers published events to subscribers immediately', () => {
    const service = new RealtimeEventsService()
    const received: string[] = []
    const sub = service.stream().subscribe((event) => received.push(event.type))

    service.publish('payment.completed', { tenantId: 'tenant-1', data: { paymentId: 'p1' } })
    service.publish('session.started', { tenantId: 'tenant-1', routerId: 'router-1' })

    expect(received).toEqual(['payment.completed', 'session.started'])
    sub.unsubscribe()
  })

  it('stamps events with tenant, router, id and timestamp', () => {
    const service = new RealtimeEventsService()
    const event = service.publish('router.offline', {
      tenantId: 'tenant-2',
      routerId: 'router-9',
      data: { secondsSinceLastSignal: 45 },
    })

    expect(event.id).toEqual(expect.any(String))
    expect(event.tenantId).toBe('tenant-2')
    expect(event.routerId).toBe('router-9')
    expect(Date.parse(event.at)).not.toBeNaN()
    expect(event.data).toEqual({ secondsSinceLastSignal: 45 })
  })

  it('replays events after a known Last-Event-ID for SSE resume', () => {
    const service = new RealtimeEventsService()
    const first = service.publish('router.heartbeat', { tenantId: 't' })
    const second = service.publish('session.updated', { tenantId: 't' })
    const third = service.publish('session.stopped', { tenantId: 't' })

    const replayed = service.eventsSince(first.id)
    expect(replayed.map((event) => event.id)).toEqual([second.id, third.id])
  })

  it('returns nothing for an unknown Last-Event-ID (client falls back to refetch)', () => {
    const service = new RealtimeEventsService()
    service.publish('alert', { tenantId: 't' })
    expect(service.eventsSince('unknown-id')).toEqual([])
  })
})
