import { Injectable, Logger } from '@nestjs/common'
import {
  RadiusEventType,
  RouterOnboardingStatus,
  RouterStatus,
  SessionStatus,
} from '@prisma/client'
import type { RadAcct, RadPostAuth, Router } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { RealtimeEventsService } from '../events/realtime-events.service'
import { accountingLiveCutoff, isLiveAccountingRow } from './accounting-liveness'

// Converts FreeRADIUS SQL rows (radacct / radpostauth, written by rlm_sql)
// into AROFi state: NetworkSession upserts, RadiusEvent records, router
// health signals and realtime dashboard events.
//
// Two entry points share the exact same row logic:
//   • processAcctRowById / processPostAuthRowById — called by
//     RadiusDbListenerService the instant Postgres NOTIFYs about a new row
//     (primary path, sub-second dashboard latency).
//   • syncRecent — polling sweep run by AccessLifecycleService as the
//     fallback when the LISTEN connection is down or events were missed.
@Injectable()
export class RadiusSignalSyncService {
  private readonly logger = new Logger(RadiusSignalSyncService.name)
  private hasRunInitialCatchup = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async processAcctRowById(radacctid: bigint | number) {
    const row = await this.prisma.radAcct.findUnique({
      where: { radacctid: typeof radacctid === 'bigint' ? radacctid : BigInt(radacctid) },
    })
    if (row) {
      await this.processAcctRow(row)
    }
  }

  async processPostAuthRowById(id: number) {
    const row = await this.prisma.radPostAuth.findUnique({
      where: { id },
    })
    if (row) {
      await this.processPostAuthRow(row)
    }
  }

  // Fallback polling sweep. First run after boot catches up on the last 24h;
  // subsequent runs only look at a short recent window because the LISTEN
  // bridge already handled everything in realtime.
  async syncRecent() {
    const windowMinutes = this.hasRunInitialCatchup
      ? Number.parseInt(process.env.RADIUS_SQL_SYNC_WINDOW_MINUTES ?? '15', 10)
      : 24 * 60
    this.hasRunInitialCatchup = true
    const recentSince = new Date(Date.now() - windowMinutes * 60 * 1000)

    const acctRows = await this.prisma.radAcct.findMany({
      where: {
        OR: [
          { acctstarttime: { gte: recentSince } },
          { acctupdatetime: { gte: recentSince } },
          { acctstoptime: { gte: recentSince } },
        ],
      },
      orderBy: { radacctid: 'desc' },
      take: 500,
    })

    for (const row of acctRows) {
      try {
        await this.processAcctRow(row)
      } catch (error) {
        this.logger.warn(
          `syncRecent: acct row ${row.radacctid} failed: ${error instanceof Error ? error.message : error}`,
        )
      }
    }

    const postAuthRows = await this.prisma.radPostAuth.findMany({
      where: { authdate: { gte: recentSince } },
      orderBy: { id: 'desc' },
      take: 500,
    })

    for (const row of postAuthRows) {
      try {
        await this.processPostAuthRow(row)
      } catch (error) {
        this.logger.warn(
          `syncRecent: postauth row ${row.id} failed: ${error instanceof Error ? error.message : error}`,
        )
      }
    }
  }

  async processAcctRow(row: RadAcct) {
    const nasIp = row.nasipaddress?.toString() ?? null
    const router = await this.resolveRouter(nasIp, row.username)
    if (!router) {
      return
    }

    const tenantId = router.tenantId
    const radiusSessionId = row.acctsessionid
    if (!radiusSessionId) {
      return
    }

    const now = new Date()
    const username = row.username ?? ''
    const macAddress = row.callingstationid
      ? row.callingstationid.trim().toUpperCase().replace(/-/g, ':')
      : null
    const ipAddress = row.framedipaddress?.toString() ?? null
    const inputOctets = row.acctinputoctets ?? BigInt(0)
    const outputOctets = row.acctoutputoctets ?? BigInt(0)
    const sessionTimeSeconds = row.acctsessiontime ?? 0
    const isStopped = row.acctstoptime != null
    const isLive = isLiveAccountingRow(row, now)
    const sessionStatus = isStopped ? SessionStatus.CLOSED : isLive ? SessionStatus.ACTIVE : SessionStatus.STALE
    const startedAt = row.acctstarttime ?? now
    const lastAccountingAt = row.acctupdatetime ?? row.acctstarttime ?? now

    const activation = username
      ? await this.prisma.packageActivation.findFirst({
          where: { radiusUsername: { equals: username, mode: 'insensitive' } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, voucherRedemptionId: true },
        })
      : null

    // Change detection keeps the polling sweep from republishing the same
    // state every cycle: only genuinely new information reaches the
    // dashboard event stream (and the DB write path).
    const existing = await this.prisma.networkSession.findUnique({
      where: { tenantId_radiusSessionId: { tenantId, radiusSessionId } },
      select: {
        id: true,
        status: true,
        inputOctets: true,
        outputOctets: true,
        lastAccountingAt: true,
        endedAt: true,
      },
    })

    const changed =
      !existing ||
      existing.status !== sessionStatus ||
      existing.inputOctets !== inputOctets ||
      existing.outputOctets !== outputOctets ||
      (existing.lastAccountingAt?.getTime() ?? 0) !== lastAccountingAt.getTime()

    if (changed) {
      try {
        await this.prisma.networkSession.upsert({
          where: { tenantId_radiusSessionId: { tenantId, radiusSessionId } },
          update: {
            status: sessionStatus,
            inputOctets,
            outputOctets,
            sessionTimeSeconds,
            lastAccountingAt,
            ...(macAddress ? { macAddress } : {}),
            ...(ipAddress ? { ipAddress } : {}),
            nasIpAddress: nasIp ?? undefined,
            endedAt: isStopped ? (row.acctstoptime ?? now) : isLive ? null : lastAccountingAt,
            ...(activation ? { activationId: activation.id } : {}),
            ...(activation?.voucherRedemptionId
              ? { voucherRedemptionId: activation.voucherRedemptionId }
              : {}),
            routerId: router.id,
          },
          create: {
            tenantId,
            routerId: router.id,
            radiusSessionId,
            status: sessionStatus,
            username,
            macAddress,
            ipAddress,
            nasIpAddress: nasIp,
            inputOctets,
            outputOctets,
            sessionTimeSeconds,
            startedAt,
            lastAccountingAt,
            endedAt: isStopped ? (row.acctstoptime ?? now) : isLive ? null : lastAccountingAt,
            activationId: activation?.id ?? null,
            voucherRedemptionId: activation?.voucherRedemptionId ?? null,
          },
        })
      } catch (err) {
        this.logger.warn(
          `processAcctRow: session upsert failed for ${radiusSessionId}: ${err instanceof Error ? err.message : err}`,
        )
        return
      }

      // Router.activeSessionCount is a cached column the dashboard/router-list
      // pages read directly (a live COUNT on every page load would be fine for
      // one router but doesn't scale). Nothing was keeping it in sync with
      // reality: it was only ever written by the health-check probe and the
      // stale-session sweep, NEITHER of which fires when a brand-new session
      // goes ACTIVE. That's why a device could be connected, tracked, and
      // billed correctly while the dashboard's "Active Users" stayed at 0
      // forever. Recompute it here whenever a session's ACTIVE/CLOSED status
      // actually changes, so it reflects reality within one accounting cycle.
      if (!existing || existing.status !== sessionStatus) {
        const liveCount = await this.prisma.networkSession.count({
          where: { routerId: router.id, status: SessionStatus.ACTIVE, lastAccountingAt: { gte: accountingLiveCutoff(now) } },
        })
        await this.prisma.router.update({
          where: { id: router.id },
          data: { activeSessionCount: liveCount },
        })
      }

      const eventType = !existing && sessionStatus === SessionStatus.ACTIVE
        ? 'session.started'
        : (isStopped && existing?.status !== SessionStatus.CLOSED) ||
            (sessionStatus === SessionStatus.STALE && existing?.status === SessionStatus.ACTIVE)
          ? 'session.stopped'
          : 'session.updated'
      this.realtimeEvents.publish(eventType, {
        tenantId,
        routerId: router.id,
        data: {
          radiusSessionId,
          username,
          macAddress,
          ipAddress,
          activationId: activation?.id ?? null,
          inputOctets: inputOctets.toString(),
          outputOctets: outputOctets.toString(),
          sessionTimeSeconds,
        },
      })
    }

    // 2. Synthesise a radiusEvent (idempotent per acctuniqueid) for the
    //    observability pages / live checks.
    const acctEventType = isStopped
      ? RadiusEventType.ACCOUNTING_STOP
      : row.acctupdatetime
        ? RadiusEventType.ACCOUNTING_INTERIM
        : RadiusEventType.ACCOUNTING_START
    const acctMarker = `syn-acct:${row.acctuniqueid}`
    const existingAcctEvent = await this.prisma.radiusEvent.findFirst({
      where: { tenantId, message: acctMarker },
      select: { id: true },
    })
    if (!existingAcctEvent) {
      try {
        await this.prisma.radiusEvent.create({
          data: {
            tenantId,
            routerId: router.id,
            eventType: acctEventType,
            username: username || null,
            macAddress,
            ipAddress,
            nasIpAddress: nasIp,
            message: acctMarker,
          },
        })
      } catch (err) {
        this.logger.warn(
          `processAcctRow: radiusEvent create failed for ${row.acctuniqueid}: ${err instanceof Error ? err.message : err}`,
        )
      }
    }

    // 3. Router health — driven by the ROW's own timestamps, never by "now".
    //    Re-processing an old row (polling sweep) must not make an offline
    //    router look freshly alive.
    const signalAt = row.acctupdatetime ?? row.acctstoptime ?? row.acctstarttime ?? null
    if (signalAt && signalAt.getTime() > (router.lastAccountingSignalAt?.getTime() ?? 0)) {
      await this.prisma.router.update({
        where: { id: router.id },
        data: {
          status: RouterStatus.HEALTHY,
          onboardingStatus: RouterOnboardingStatus.VERIFIED_ONLINE,
          verificationStatus: 'VERIFIED',
          lastSeenAt: signalAt,
          lastRadiusSignalAt: signalAt,
          lastAccountingSignalAt: signalAt,
          verifiedAt: router.verifiedAt ?? signalAt,
          ...(nasIp && !router.radiusNasIpAddress ? { radiusNasIpAddress: nasIp } : {}),
        },
      })
    }

    // 4. Keep the activation's usedBytes aggregate in sync (data quota
    //    enforcement reads this).
    if (changed && activation) {
      const agg = await this.prisma.networkSession.aggregate({
        where: { activationId: activation.id },
        _sum: { inputOctets: true, outputOctets: true },
      })
      const usedBytes = (agg._sum.inputOctets ?? BigInt(0)) + (agg._sum.outputOctets ?? BigInt(0))
      await this.prisma.packageActivation.update({
        where: { id: activation.id },
        data: { usedBytes },
      })
    }
  }

  async processPostAuthRow(row: RadPostAuth) {
    if (!row.username) {
      return
    }

    const cred = await this.prisma.radiusCredential.findFirst({
      where: { username: row.username },
      select: { username: true, tenantId: true, routerId: true },
    })

    const activation =
      cred?.tenantId
        ? null
        : await this.prisma.packageActivation.findFirst({
            where: { radiusUsername: { equals: row.username, mode: 'insensitive' } },
            select: { tenantId: true, routerId: true },
          })

    const tenantId = cred?.tenantId ?? activation?.tenantId ?? null
    const routerId = cred?.routerId ?? activation?.routerId ?? null

    if (!tenantId) {
      return // Cannot attribute to a tenant — skip
    }

    const isAccept = (row.reply ?? '').toLowerCase().includes('accept')
    const eventType = isAccept ? RadiusEventType.ACCESS_ACCEPT : RadiusEventType.ACCESS_REJECT

    // Idempotency: one radiusEvent per radpostauth row, keyed by row id.
    const authMarker = `syn-auth:${row.id}`
    const existingAuthEvent = await this.prisma.radiusEvent.findFirst({
      where: { tenantId, message: authMarker },
      select: { id: true },
    })
    if (existingAuthEvent) {
      return
    }

    try {
      await this.prisma.radiusEvent.create({
        data: {
          tenantId,
          routerId,
          eventType,
          username: row.username,
          authMethod: 'PAP',
          responseCode: isAccept ? '2' : '3',
          message: authMarker,
          createdAt: row.authdate,
        },
      })
    } catch (err) {
      this.logger.warn(
        `processPostAuthRow: radiusEvent create failed for radpostauth.id=${row.id}: ${err instanceof Error ? err.message : err}`,
      )
      return
    }

    this.realtimeEvents.publish('radius.auth', {
      tenantId,
      routerId,
      data: {
        username: row.username,
        accepted: isAccept,
        at: row.authdate.toISOString(),
      },
    })

    if (isAccept && routerId) {
      await this.prisma.router.updateMany({
        where: {
          id: routerId,
          OR: [{ lastAuthSignalAt: null }, { lastAuthSignalAt: { lt: row.authdate } }],
        },
        data: { lastRadiusSignalAt: row.authdate, lastAuthSignalAt: row.authdate },
      })
    }
  }

  // NAS IP → router, with a credential-based fallback for CGNAT'd routers
  // whose NAS-IP-Address doesn't match anything we know. When the fallback
  // hits, the real NAS IP is learned so future lookups take the fast path.
  private async resolveRouter(nasIp: string | null, username: string | null): Promise<Router | null> {
    if (nasIp) {
      const router = await this.prisma.router.findFirst({
        where: {
          OR: [
            { radiusNasIpAddress: nasIp },
            { host: nasIp },
            { radiusClient: { ipAddress: nasIp } },
          ],
        },
      })
      if (router) {
        return router
      }
    }

    if (!username) {
      return null
    }

    const normalizedUsername = username.trim()
    const cred = await this.prisma.radiusCredential.findFirst({
      where: { username: normalizedUsername },
      select: { routerId: true, tenantId: true, activationId: true },
    })
    const activationFromUsername =
      cred
        ? null
        : await this.prisma.packageActivation.findFirst({
            where: { radiusUsername: { equals: normalizedUsername, mode: 'insensitive' } },
            select: { id: true, tenantId: true, routerId: true },
          })

    const tenantId = cred?.tenantId ?? activationFromUsername?.tenantId ?? null

    let routerId = cred?.routerId ?? activationFromUsername?.routerId ?? null

    // QR-scan/portal redemptions often have no routerKey, so the credential
    // carries routerId=null. Fall back to the activation's router.
    if (!routerId && cred?.activationId) {
      const activation = await this.prisma.packageActivation.findUnique({
        where: { id: cred.activationId },
        select: { routerId: true },
      })
      routerId = activation?.routerId ?? null
    }

    // Router-generated accounting rows sometimes use the router UUID as the
    // username (for example, when MikroTik reports this as a NAS client).
    // In that case, the row still belongs to the router that originated it,
    // even if there is no RadiusCredential row.
    if (!routerId && normalizedUsername.startsWith('router-')) {
      const routerByUsername = await this.prisma.router.findFirst({
        where: { id: normalizedUsername.slice('router-'.length) },
        select: { id: true },
      })
      routerId = routerByUsername?.id ?? null
    }

    // Last resort: if the credential's tenant has exactly ONE router, the
    // session can only belong to it. This is what keeps live users working
    // when the stored NAS IP is the router's WAN address (self-reported by the
    // provisioning callback) while MikroTik stamps accounting with its LAN IP
    // — the mismatch that silently blanked live users/data on the dashboard.
    if (!routerId) {
      const tenantRouters = await this.prisma.router.findMany({
        where: tenantId ? { tenantId } : undefined,
        select: { id: true },
        take: 2,
      })
      if (tenantRouters.length === 1) {
        routerId = tenantRouters[0].id
      }
    }

    if (!routerId) {
      this.logger.warn(
        `resolveRouter: cannot map username "${username}" (nasIp=${nasIp ?? 'none'}, tenant=${tenantId ?? 'unknown'}) to a router — accounting row dropped`,
      )
      return null
    }

    const router = await this.prisma.router.findUnique({ where: { id: routerId } })
    if (router && nasIp && !router.radiusNasIpAddress) {
      try {
        await this.prisma.router.update({
          where: { id: router.id },
          data: { radiusNasIpAddress: nasIp },
        })
        return { ...router, radiusNasIpAddress: nasIp }
      } catch {
        // Non-fatal
      }
    }
    return router
  }
}
