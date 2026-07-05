import { Controller, MessageEvent, Req, Sse, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { Observable, concat, from, interval, merge } from 'rxjs'
import { filter, map } from 'rxjs/operators'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { RealtimeEvent, RealtimeEventsService } from './realtime-events.service'

const KEEPALIVE_INTERVAL_MS = 15_000

@Controller('events')
export class EventsController {
  constructor(
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  // Primary realtime channel for the admin UI. EventSource authenticates via
  // the HttpOnly admin cookie (JwtStrategy's cookie extractor), so no token
  // ever needs to be readable from JavaScript.
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.sessionsRead)
  @Sse('stream')
  stream(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Req() request: Request,
  ): Observable<MessageEvent> {
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    const isSuperAdmin = this.accessScope.isSuperAdmin(user)

    const visible = (event: RealtimeEvent) => {
      if (isSuperAdmin) {
        return true
      }
      // Tenant admins only see their own tenant's events; platform-wide
      // events (tenantId null) stay with platform admins.
      return event.tenantId !== null && event.tenantId === scopedTenantId
    }

    const lastEventId = this.readLastEventId(request)
    const replayed = lastEventId
      ? this.realtimeEvents.eventsSince(lastEventId).filter(visible)
      : []

    const live = this.realtimeEvents.stream().pipe(filter(visible))

    const events = concat(from(replayed), live).pipe(
      map((event): MessageEvent => ({
        id: event.id,
        type: event.type,
        data: JSON.stringify(event),
      })),
    )

    // Keep intermediaries (nginx, Coolify proxy) from closing the idle
    // connection: emit a ping event on a fixed interval.
    const keepalive = interval(KEEPALIVE_INTERVAL_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: JSON.stringify({ at: new Date().toISOString() }) })),
    )

    return merge(events, keepalive)
  }

  private readLastEventId(request: Request): string | null {
    const header = request.headers['last-event-id']
    if (Array.isArray(header)) {
      return header[0] ?? null
    }
    return header ?? null
  }
}
