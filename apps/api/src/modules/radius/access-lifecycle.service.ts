import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  DisconnectionMethod,
  DisconnectionStatus,
  PackageActivationStatus,
  PaymentStatus,
  RadiusCredentialStatus,
  SessionStatus,
  Prisma,
  DisbursementStatus,
  BillingTransactionStatus,
} from '@prisma/client'
import { execSync, spawn } from 'child_process'
import * as Sentry from '@sentry/node'
import { PrismaService } from '../../prisma.service'
import { MailService } from '../mail/mail.service'
import { RealtimeEventsService } from '../events/realtime-events.service'
import { RadiusCredentialService } from './radius-credential.service'
import { RadiusSignalSyncService } from './radius-signal-sync.service'
import { YoUgandaDisbursementService } from '../payments/yo-uganda-disbursement.service'
import { MikrotikService } from '../routers/mikrotik.service'
import { RouterCredentialsService } from '../routers/router-credentials.service'

// Failed CoA/Disconnect-Requests retry with exponential backoff before being
// declared FAILED (which raises an operator alert). Base delay doubles per
// retry: 5s, 10s, 20s, 40s, 80s.
const DISCONNECT_RETRY_BASE_MS = 5_000
const disconnectMaxRetries = () =>
  Math.min(10, Math.max(1, Number.parseInt(process.env.RADIUS_DISCONNECT_MAX_RETRIES ?? '5', 10) || 5))

@Injectable()
export class AccessLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccessLifecycleService.name)
  private timer?: NodeJS.Timeout
  private runInProgress = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly radiusCredentialService: RadiusCredentialService,
    private readonly yoDisbursementService: YoUgandaDisbursementService,
    private readonly mailService: MailService,
    private readonly signalSync: RadiusSignalSyncService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly mikrotikService: MikrotikService,
    private readonly routerCredentialsService: RouterCredentialsService,
  ) { }

  // Best-effort, fire-and-forget: a slow/broken mail server must never delay
  // or fail a withdrawal settlement that already succeeded in the database.
  private async notifyWithdrawalEmail(input: { tenantId: string; status: 'COMPLETED' | 'FAILED'; amountUgx: number; reference: string }) {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: {
          name: true,
          supportEmail: true,
          users: { select: { email: true, firstName: true, lastName: true }, take: 1 },
        },
      })
      const recipientEmail = tenant?.supportEmail ?? tenant?.users[0]?.email
      if (!tenant || !recipientEmail) {
        return
      }

      const recipientName = tenant.users[0]
        ? `${tenant.users[0].firstName ?? ''} ${tenant.users[0].lastName ?? ''}`.trim() || tenant.name
        : tenant.name

      await this.mailService.sendWithdrawalStatusEmail({
        to: recipientEmail,
        tenantName: tenant.name,
        recipientName,
        status: input.status,
        amountUgx: input.amountUgx,
        reference: input.reference,
      })
    } catch (error) {
      this.logger.warn(
        `Failed to send withdrawal ${input.status} email for tenant ${input.tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  onModuleInit() {
    if (process.env.RADIUS_DISCONNECT_ENABLED === 'true') {
      try {
        execSync('which radclient', { stdio: 'ignore' })
      } catch {
        this.logger.error(
          'CRITICAL: RADIUS_DISCONNECT_ENABLED=true but radclient ' +
          'binary is not found in PATH. Active session disconnect will ' +
          'silently fail. Add freeradius-utils to the API Dockerfile.',
        )
      }
    }

    if (process.env.ACCESS_WORKERS_ENABLED === 'false') {
      return
    }

    this.timer = setInterval(() => {
      void this.runScheduledCycle()
    }, Number.parseInt(process.env.ACCESS_WORKER_INTERVAL_MS ?? '5000', 10))
    void this.runScheduledCycle()
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }

  async runOnce() {
    await this.expireActivations()
    await this.cleanupExpiredRadiusCredentials()
    await this.syncRadiusSqlSignals()
    await this.enforceDataQuotas()
    await this.processPendingDisconnects()
    await this.cleanStaleSessions()
    await this.markStuckPendingPayments()
    await this.pollPendingDisbursements()
    await this.reconcileOrphanedPayments()
  }

  private async runScheduledCycle() {
    if (this.runInProgress) {
      return
    }

    this.runInProgress = true
    try {
      await this.runOnce()
    } catch (error) {
      this.logger.error(error)
    } finally {
      this.runInProgress = false
    }
  }

  private async cleanupExpiredRadiusCredentials() {
    const expired = await this.prisma.radiusCredential.findMany({
      where: {
        status: RadiusCredentialStatus.ACTIVE,
        expiresAt: { lte: new Date() },
      },
      take: 100,
    })

    for (const credential of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.radCheck.deleteMany({ where: { username: credential.username } })
        await tx.radReply.deleteMany({ where: { username: credential.username } })
        await tx.radiusCredential.update({
          where: { id: credential.id },
          data: { status: RadiusCredentialStatus.EXPIRED },
        })
      })
    }
  }

  // Polling fallback for the FreeRADIUS→Postgres realtime bridge. The
  // LISTEN/NOTIFY listener (RadiusDbListenerService) is the primary path;
  // this sweep only catches rows missed while that connection was down.
  private async syncRadiusSqlSignals() {
    await this.signalSync.syncRecent()
  }

  private async expireActivations() {
    const expired = await this.prisma.packageActivation.findMany({
      where: {
        status: PackageActivationStatus.ACTIVE,
        endsAt: { lte: new Date() },
      },
      take: 100,
    })

    for (const activation of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.packageActivation.update({
          where: { id: activation.id },
          data: { status: PackageActivationStatus.EXPIRED },
        })
        await this.radiusCredentialService.disableForActivation(
          tx,
          activation.id,
          RadiusCredentialStatus.EXPIRED,
        )
        await this.requestActiveDisconnects(tx, activation.id, 'Activation expired')
        await tx.networkSession.updateMany({
          where: { activationId: activation.id, status: SessionStatus.ACTIVE },
          data: { status: SessionStatus.STALE, endedAt: new Date() },
        })
        await tx.auditLog.create({
          data: {
            tenantId: activation.tenantId,
            action: 'activation.expired',
            entity: 'PackageActivation',
            entityId: activation.id,
            details: { endsAt: activation.endsAt.toISOString() },
          },
        })
      })

      this.realtimeEvents.publish('activation.expired', {
        tenantId: activation.tenantId,
        routerId: activation.routerId ?? null,
        data: {
          activationId: activation.id,
          endsAt: activation.endsAt.toISOString(),
        },
      })
    }

    // Push the CoA Disconnect-Requests out in the SAME worker cycle the
    // expiry happened in — the RADIUS Session-Timeout already cut access at
    // the router, this makes the API-side disconnect immediate too instead
    // of waiting for the next cycle.
    if (expired.length > 0) {
      await this.processPendingDisconnects()
    }
  }

  private async enforceDataQuotas() {
    const candidates = await this.prisma.packageActivation.findMany({
      where: {
        status: PackageActivationStatus.ACTIVE,
        dataLimitMb: { not: null },
      },
      include: {
        sessions: true,
        radiusCredential: true,
      },
      take: 100,
    })

    for (const activation of candidates) {
      const usedBytes = activation.sessions.reduce(
        (total, session) => total + session.inputOctets + session.outputOctets,
        BigInt(0),
      )
      const limitBytes = BigInt(activation.dataLimitMb ?? 0) * BigInt(1024 * 1024)

      await this.prisma.packageActivation.update({
        where: { id: activation.id },
        data: { usedBytes },
      })

      if (limitBytes > BigInt(0) && usedBytes >= limitBytes) {
        await this.prisma.$transaction(async (tx) => {
          await tx.packageActivation.update({
            where: { id: activation.id },
            data: {
              status: PackageActivationStatus.QUOTA_EXHAUSTED,
              quotaExhaustedAt: new Date(),
            },
          })
          await this.radiusCredentialService.disableForActivation(
            tx,
            activation.id,
            RadiusCredentialStatus.DISABLED,
          )
          await this.requestActiveDisconnects(tx, activation.id, 'Data quota exhausted')
          await tx.networkSession.updateMany({
            where: { activationId: activation.id, status: SessionStatus.ACTIVE },
            data: { status: SessionStatus.STALE, endedAt: new Date() },
          })
          await tx.auditLog.create({
            data: {
              tenantId: activation.tenantId,
              action: 'activation.quota_exhausted',
              entity: 'PackageActivation',
              entityId: activation.id,
              severity: 'WARNING',
              details: {
                usedBytes: usedBytes.toString(),
                limitBytes: limitBytes.toString(),
              },
            },
          })
        })

        this.realtimeEvents.publish('activation.quota_exhausted', {
          tenantId: activation.tenantId,
          routerId: activation.routerId ?? null,
          data: {
            activationId: activation.id,
            usedBytes: usedBytes.toString(),
            limitBytes: limitBytes.toString(),
          },
        })
      }
    }
  }

  private async requestActiveDisconnects(
    tx: Prisma.TransactionClient,
    activationId: string,
    reason: string,
  ) {
    const sessions = await tx.networkSession.findMany({
      where: { activationId, status: SessionStatus.ACTIVE },
      include: { activation: { include: { radiusCredential: true } } },
    })

    for (const session of sessions) {
      const method = process.env.RADIUS_DISCONNECT_ENABLED === 'true'
        ? DisconnectionMethod.RADIUS_DISCONNECT
        : DisconnectionMethod.AUTH_DISABLE_ONLY
      const attempt = await tx.disconnectionAttempt.create({
        data: {
          tenantId: session.tenantId,
          activationId,
          sessionId: session.id,
          method,
          status: DisconnectionStatus.REQUESTED,
          routerId: session.routerId,
          username: session.username,
          macAddress: session.macAddress,
          radiusSessionId: session.radiusSessionId,
          message: reason,
        },
      })

      if (method === DisconnectionMethod.AUTH_DISABLE_ONLY) {
        await tx.disconnectionAttempt.update({
          where: { id: attempt.id },
          data: {
            status: DisconnectionStatus.NOT_SUPPORTED,
            completedAt: new Date(),
            message: `${reason}; authorization disabled, active disconnect not enabled`,
          },
        })
      }

      this.realtimeEvents.publish('disconnect.requested', {
        tenantId: session.tenantId,
        routerId: session.routerId ?? null,
        data: {
          attemptId: attempt.id,
          activationId,
          sessionId: session.id,
          username: session.username,
          reason,
        },
      })
    }
  }

  private async processPendingDisconnects() {
    if (process.env.RADIUS_DISCONNECT_ENABLED !== 'true') {
      return
    }

    const now = new Date()
    const attempts = await this.prisma.disconnectionAttempt.findMany({
      where: {
        method: DisconnectionMethod.RADIUS_DISCONNECT,
        status: DisconnectionStatus.REQUESTED,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      take: 25,
    })

    for (const attempt of attempts) {
      try {
        const secret = process.env.RADIUS_DISCONNECT_SECRET?.trim() || process.env.RADIUS_SHARED_SECRET
        const port = process.env.RADIUS_DISCONNECT_PORT ?? '3799'
        if (!secret) {
          throw new Error('RADIUS disconnect secret is not configured')
        }

        // Build the list of CoA targets, most-reachable first. The MikroTik
        // router (NOT the FreeRADIUS container) is the CoA target on port 3799,
        // and it accepts incoming CoA on all interfaces (/radius incoming
        // accept=yes, set during onboarding), using the shared secret.
        //
        // CRITICAL for nationwide CGNAT: most routers sit behind carrier-grade
        // NAT, so their public/WAN IP is NOT reachable for an inbound CoA — the
        // "kick the device off now" packet silently fails and the customer is
        // left "connected but no internet" until Session-Timeout eventually
        // logs them out at the router. The SSTP tunnel IP (remoteSstpIp) IS
        // reachable from this server over the VPN interface, so we try it FIRST
        // and fall back to the WAN IP for routers without a tunnel.
        const candidates: string[] = []
        const forcedHost = process.env.RADIUS_DISCONNECT_HOST?.trim()
        if (forcedHost) {
          candidates.push(forcedHost)
        } else if (attempt.routerId) {
          const router = await this.prisma.router.findUnique({
            where: { id: attempt.routerId },
          })
          if (router) {
            if (router.remoteSstpIp) candidates.push(router.remoteSstpIp)
            if (router.radiusNasIpAddress) candidates.push(router.radiusNasIpAddress)
            if (router.host) candidates.push(router.host)
          }
        }
        const targets = [...new Set(candidates.filter(Boolean))]
        if (targets.length === 0) {
          throw new Error(
            'CoA target unresolvable — no tunnel IP, NAS IP or host for this router. Re-provision the router so it reports its WAN IP or sets up remote access.',
          )
        }

        const packet = [
          `User-Name = ${attempt.username ?? ''}`,
          attempt.radiusSessionId ? `Acct-Session-Id = ${attempt.radiusSessionId}` : '',
          attempt.macAddress ? `Calling-Station-Id = ${attempt.macAddress}` : '',
        ].filter(Boolean).join('\n')

        let lastError: unknown = null
        let delivered = false
        for (const host of targets) {
          try {
            await this.runRadclientDisconnect(host, port, secret, packet)
            delivered = true
            break
          } catch (err) {
            lastError = err
          }
        }
        let routerLogoutRemoved = 0
        if (!delivered) {
          try {
            routerLogoutRemoved = await this.logoutHotspotActiveSession(attempt)
            delivered = routerLogoutRemoved > 0
          } catch (routerError) {
            lastError = routerError
          }
        }

        if (!delivered) {
          throw lastError instanceof Error
            ? lastError
            : new Error(`All CoA/API logout targets failed (${targets.join(', ')})`)
        }

        await this.prisma.disconnectionAttempt.update({
          where: { id: attempt.id },
          data: {
            status: DisconnectionStatus.SUCCESS,
            completedAt: new Date(),
            message: routerLogoutRemoved > 0
              ? `RouterOS HotSpot active session removed (${routerLogoutRemoved}) after CoA fallback`
              : 'RADIUS Disconnect-Request sent successfully',
          },
        })
        this.realtimeEvents.publish('disconnect.succeeded', {
          tenantId: attempt.tenantId,
          routerId: attempt.routerId ?? null,
          data: {
            attemptId: attempt.id,
            activationId: attempt.activationId,
            username: attempt.username,
            retryCount: attempt.retryCount,
          },
        })
      } catch (error) {
        await this.handleDisconnectFailure(attempt, error)
      }
    }
  }

  private async logoutHotspotActiveSession(attempt: {
    routerId: string | null
    username: string | null
    macAddress?: string | null
  }) {
    if (!attempt.routerId) {
      throw new Error('RouterOS logout fallback unavailable: no router is linked to the session')
    }

    const router = await this.prisma.router.findUnique({
      where: { id: attempt.routerId },
      select: {
        host: true,
        apiPort: true,
        connectionMode: true,
        username: true,
        passwordCiphertext: true,
        remoteSstpIp: true,
      },
    })
    if (!router) {
      throw new Error('RouterOS logout fallback unavailable: router not found')
    }

    const password = this.routerCredentialsService.decrypt(router.passwordCiphertext)
    const targetHost = router.remoteSstpIp || router.host
    if (!targetHost) {
      throw new Error('RouterOS logout fallback unavailable: router has no management host')
    }

    const result = await this.mikrotikService.removeHotspotActiveSession({
      host: targetHost,
      port: router.apiPort,
      useTls: router.connectionMode === 'ROUTEROS_API_SSL',
      username: router.username,
      password,
      hotspotUsername: attempt.username,
      macAddress: attempt.macAddress,
      timeoutMs: 5000,
    })

    if (result.removed <= 0) {
      throw new Error('RouterOS logout fallback found no matching active HotSpot session')
    }

    return result.removed
  }

  // A failed CoA retries with exponential backoff; only after the retry
  // budget is exhausted is it marked FAILED, audited as CRITICAL, alerted to
  // the operator by email, and pushed to the dashboard event stream. Access
  // is already cut at the RADIUS layer either way (credentials removed +
  // Session-Timeout) — this is about kicking the live session off the router.
  private async handleDisconnectFailure(
    attempt: {
      id: string
      tenantId: string
      routerId: string | null
      activationId: string | null
      username: string | null
      retryCount: number
    },
    error: unknown,
  ) {
    const message = error instanceof Error ? error.message : 'RADIUS Disconnect-Request failed'
    const nextRetryCount = attempt.retryCount + 1

    if (nextRetryCount < disconnectMaxRetries()) {
      const backoffMs = DISCONNECT_RETRY_BASE_MS * 2 ** attempt.retryCount
      await this.prisma.disconnectionAttempt.update({
        where: { id: attempt.id },
        data: {
          retryCount: nextRetryCount,
          nextRetryAt: new Date(Date.now() + backoffMs),
          message: `${message} (retry ${nextRetryCount}/${disconnectMaxRetries()} in ${Math.round(backoffMs / 1000)}s)`,
        },
      })
      return
    }

    await this.prisma.disconnectionAttempt.update({
      where: { id: attempt.id },
      data: {
        status: DisconnectionStatus.FAILED,
        retryCount: nextRetryCount,
        completedAt: new Date(),
        message: `${message} (gave up after ${nextRetryCount} attempts)`,
      },
    })

    this.logger.error(
      `Disconnect FAILED after ${nextRetryCount} attempts for user ${attempt.username ?? 'unknown'} (attempt ${attempt.id}): ${message}`,
    )
    Sentry.captureMessage(`RADIUS disconnect failed after retries: ${attempt.username ?? attempt.id}`, {
      level: 'error',
      extra: { attemptId: attempt.id, tenantId: attempt.tenantId, message },
    })

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: attempt.tenantId,
          action: 'radius.disconnect_failed',
          entity: 'DisconnectionAttempt',
          entityId: attempt.id,
          severity: 'CRITICAL',
          details: {
            username: attempt.username,
            activationId: attempt.activationId,
            routerId: attempt.routerId,
            message,
          },
        },
      })
    } catch (auditError) {
      this.logger.warn(
        `Failed to write disconnect-failure audit log: ${auditError instanceof Error ? auditError.message : auditError}`,
      )
    }

    this.realtimeEvents.publish('disconnect.failed', {
      tenantId: attempt.tenantId,
      routerId: attempt.routerId ?? null,
      data: {
        attemptId: attempt.id,
        activationId: attempt.activationId,
        username: attempt.username,
        retryCount: nextRetryCount,
        message,
      },
    })
    this.realtimeEvents.publish('alert', {
      tenantId: attempt.tenantId,
      routerId: attempt.routerId ?? null,
      data: {
        kind: 'disconnect_failed',
        attemptId: attempt.id,
        username: attempt.username,
        message,
      },
    })

    void this.mailService.sendOperationalAlertEmail({
      subject: `RADIUS disconnect failed for ${attempt.username ?? 'unknown user'}`,
      lines: [
        `Attempt: ${attempt.id}`,
        `Tenant: ${attempt.tenantId}`,
        `Router: ${attempt.routerId ?? 'unknown'}`,
        `Retries exhausted: ${nextRetryCount}`,
        `Last error: ${message}`,
        'RADIUS credentials are already removed and Session-Timeout applies, but the live session could not be kicked. Check router CoA (port 3799) reachability and the incoming RADIUS secret.',
      ],
    })
  }

  private runRadclientDisconnect(host: string, port: string, secret: string, packet: string) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('radclient', ['-x', `${host}:${port}`, 'disconnect', secret], {
        stdio: ['pipe', 'ignore', 'pipe'],
      })
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error('RADIUS Disconnect-Request timed out'))
      }, 5000)
      let errorOutput = ''

      child.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString()
      })
      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(errorOutput || `radclient exited with code ${code}`))
        }
      })
      child.stdin.write(packet)
      child.stdin.end()
    })
  }

  private async cleanStaleSessions() {
    // MikroTik sends RADIUS interim-update every 60s (Acct-Interim-Interval).
    // If we haven't received ANY accounting for 3 minutes (3× the interval),
    // the device is gone — mark the session STALE so the dashboard reflects
    // reality. The PackageActivation stays ACTIVE so the customer can still
    // reconnect; this only affects the live session indicator.
    const staleBefore = new Date(Date.now() - 3 * 60 * 1000)
    const staleWhere = {
      status: SessionStatus.ACTIVE,
      OR: [{ lastAccountingAt: null }, { lastAccountingAt: { lt: staleBefore } }],
    }

    const affected = await this.prisma.networkSession.findMany({
      where: staleWhere,
      select: {
        id: true,
        tenantId: true,
        routerId: true,
        radiusSessionId: true,
        username: true,
        macAddress: true,
        lastAccountingAt: true,
        activationId: true,
      },
    })

    if (affected.length === 0) {
      return
    }

    // Mark ALL sessions without recent accounting as stale, regardless of
    // activation status. Previously sessions with active (non-expired)
    // activations were exempt, which caused the dashboard to show
    // disconnected users as "Active" for hours until the package expired.
    const staleSessions = affected

    if (staleSessions.length === 0) {
      return
    }

    const endedAt = new Date()
    await this.prisma.networkSession.updateMany({
      where: { id: { in: staleSessions.map((session) => session.id) } },
      data: {
        status: SessionStatus.STALE,
        endedAt,
      },
    })

    const routerIds = new Set(staleSessions.map((session) => session.routerId).filter((routerId): routerId is string => Boolean(routerId)))
    for (const routerId of routerIds) {
      const count = await this.prisma.networkSession.count({
        where: { routerId, status: SessionStatus.ACTIVE },
      })
      await this.prisma.router.update({
        where: { id: routerId },
        data: { activeSessionCount: count },
      })
    }

    for (const session of staleSessions) {
      this.realtimeEvents.publish('session.stopped', {
        tenantId: session.tenantId,
        routerId: session.routerId ?? null,
        data: {
          sessionId: session.id,
          radiusSessionId: session.radiusSessionId,
          username: session.username,
          macAddress: session.macAddress,
          stale: true,
          lastAccountingAt: session.lastAccountingAt?.toISOString() ?? null,
          endedAt: endedAt.toISOString(),
        },
      })
    }
  }

  // Safety net for a webhook-processing bug: a customer paid (status COMPLETED)
  // but no PackageActivation was ever created, so they were charged with no
  // internet access. Gives webhook handling a 5-minute grace window before
  // flagging, and dedupes via AuditLog so each orphan is only reported once.
  private async reconcileOrphanedPayments() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const graceWindow = new Date(Date.now() - 5 * 60 * 1000)

    const orphaned = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.COMPLETED,
        activation: null,
        completedAt: { gte: cutoff, lte: graceWindow },
      },
      take: 25,
    })

    for (const payment of orphaned) {
      const alreadyFlagged = await this.prisma.auditLog.findFirst({
        where: { entity: 'Payment', entityId: payment.id, action: 'payment.orphaned' },
        select: { id: true },
      })
      if (alreadyFlagged) {
        continue
      }

      this.logger.error(
        `ORPHANED PAYMENT: ${payment.id} (${payment.externalReference}) is COMPLETED but has no activation. The customer may have been charged without receiving access. Investigate immediately.`,
      )
      Sentry.captureMessage(`Orphaned payment: completed with no activation (${payment.externalReference})`, {
        level: 'error',
        extra: {
          paymentId: payment.id,
          tenantId: payment.tenantId,
          amountUgx: payment.amountUgx,
          phoneNumber: payment.phoneNumber,
        },
      })

      await this.prisma.auditLog.create({
        data: {
          tenantId: payment.tenantId,
          action: 'payment.orphaned',
          entity: 'Payment',
          entityId: payment.id,
          severity: 'CRITICAL',
          details: {
            externalReference: payment.externalReference,
            amountUgx: payment.amountUgx,
            phoneNumber: payment.phoneNumber,
            completedAt: payment.completedAt?.toISOString(),
          },
        },
      })
    }
  }

  private async markStuckPendingPayments() {
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await this.prisma.payment.updateMany({
      where: {
        status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING, PaymentStatus.INDETERMINATE] },
        createdAt: { lt: staleBefore },
      },
      data: {
        status: PaymentStatus.EXPIRED,
        statusMessage: 'Payment expired after remaining pending for more than 24 hours',
        failedAt: new Date(),
      },
    })
  }

  // ── Disbursement Status Polling ────────────────────────────────────────────
  // Safety net for when Yo Uganda IPN webhooks are missed or delayed.
  // Polls any disbursement stuck in PROCESSING for more than 2 minutes.
  // The IPN webhook (Fix 2A/2B) is the primary path; this is the fallback.
  private async pollPendingDisbursements() {
    const yoUsername = process.env.YO_UGANDA_USERNAME
    if (!yoUsername) return // Yo Uganda not configured — skip silently

    const stuckSince = new Date(Date.now() - 2 * 60 * 1000)
    const pending = await this.prisma.disbursement.findMany({
      where: {
        status: DisbursementStatus.PROCESSING,
        createdAt: { lt: stuckSince },
        providerReference: { not: null },
      },
      include: { billingTransaction: true, wallet: true },
      take: 10,
      orderBy: { createdAt: 'asc' },
    })

    for (const disbursement of pending) {
      if (!disbursement.providerReference) continue

      try {
        const statusResult = await this.yoDisbursementService.getDisbursementStatus(
          disbursement.providerReference,
        )

        const resultStatus = (statusResult.transactionStatus ?? '').toUpperCase()
        const isSuccess = ['COMPLETED', 'SUCCEEDED', 'SUCCESSFUL', 'SUCCESS'].includes(resultStatus)
        const isFailed  = ['FAILED', 'FAILED_UNKNOWN', 'CANCELLED', 'CANCELED'].includes(resultStatus)

        if (!isSuccess && !isFailed) continue // Still pending — try next cycle

        const nextStatus = isSuccess ? DisbursementStatus.COMPLETED : DisbursementStatus.FAILED

        await this.prisma.$transaction(async (tx) => {
          await tx.disbursement.update({
            where: { id: disbursement.id },
            data: {
              status: nextStatus,
              completedAt: isSuccess ? new Date() : undefined,
              failedAt: isFailed ? new Date() : undefined,
              notes: isSuccess
                ? 'Confirmed completed via Yo Uganda status poll.'
                : `Failed per Yo Uganda status poll. Status: ${resultStatus}`,
            },
          })

          if (isFailed && disbursement.walletId && disbursement.billingTransactionId && disbursement.wallet) {
            const totalDebitUgx = disbursement.billingTransaction?.grossAmountUgx ?? disbursement.amountUgx

            await tx.wallet.update({
              where: { id: disbursement.walletId },
              data: { balanceUgx: { increment: totalDebitUgx } },
            })

            await tx.billingTransaction.update({
              where: { id: disbursement.billingTransactionId },
              data: { status: BillingTransactionStatus.REVERSED },
            })
          }

          await tx.auditLog.create({
            data: {
              tenantId: disbursement.tenantId,
              action: isSuccess ? 'withdrawal.completed' : 'withdrawal.failed',
              entity: 'Disbursement',
              entityId: disbursement.id,
              details: {
                yoStatus: resultStatus,
                providerReference: disbursement.providerReference,
                source: 'status_poll',
              },
            },
          })
        })

        this.logger.log(
          `pollPendingDisbursements: ${disbursement.reference} → ${nextStatus}`,
        )

        void this.notifyWithdrawalEmail({
          tenantId: disbursement.tenantId,
          status: isSuccess ? 'COMPLETED' : 'FAILED',
          amountUgx: disbursement.amountUgx,
          reference: disbursement.reference,
        })
      } catch (err) {
        this.logger.warn(
          `pollPendingDisbursements: status check failed for ${disbursement.reference}: ${err instanceof Error ? err.message : err}`,
        )
      }
    }
  }
}
