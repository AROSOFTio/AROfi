import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  DisconnectionMethod,
  DisconnectionStatus,
  PackageActivationStatus,
  PaymentStatus,
  RadiusCredentialStatus,
  RadiusEventType,
  RouterOnboardingStatus,
  RouterStatus,
  SessionStatus,
  Prisma,
  DisbursementStatus,
  BillingTransactionStatus,
} from '@prisma/client'
import { execSync, spawn } from 'child_process'
import { PrismaService } from '../../prisma.service'
import { RadiusCredentialService } from './radius-credential.service'
import { YoUgandaDisbursementService } from '../payments/yo-uganda-disbursement.service'

@Injectable()
export class AccessLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccessLifecycleService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly radiusCredentialService: RadiusCredentialService,
    private readonly yoDisbursementService: YoUgandaDisbursementService,
  ) { }

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
      void this.runOnce().catch((error) => this.logger.error(error))
    }, Number.parseInt(process.env.ACCESS_WORKER_INTERVAL_MS ?? '5000', 10))
    void this.runOnce().catch((error) => this.logger.error(error))
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

  private async syncRadiusSqlSignals() {
    const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const now = new Date()

    // ── 1. Load radAcct rows (FreeRADIUS accounting, written directly to SQL) ──
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

    // ── 2. Build NAS IP → router map using BOTH registered IP AND real WAN IP ──
    // radiusClient.ipAddress = registered placeholder
    // router.radiusNasIpAddress = real WAN IP learned from provisioning callback
    const routers = await this.prisma.router.findMany({
      include: { radiusClient: true },
    })
    const routerByNasIp = new Map<string, typeof routers[0]>()
    for (const router of routers) {
      if (router.radiusClient?.ipAddress) routerByNasIp.set(router.radiusClient.ipAddress, router)
      if (router.radiusNasIpAddress) routerByNasIp.set(router.radiusNasIpAddress, router)
    }

    // ── 3. Pre-fetch activations by radiusUsername for session linking ──
    const acctUsernames = [...new Set(acctRows.map((r) => r.username).filter(Boolean))] as string[]
    const activationsByUsername = acctUsernames.length
      ? await this.prisma.packageActivation.findMany({
          where: { radiusUsername: { in: acctUsernames } },
          include: { voucherRedemption: true },
        })
      : []
    const activationByUsername = new Map(activationsByUsername.map((a) => [a.radiusUsername, a]))

    // ── 4. Process each radAcct row: upsert networkSession + radiusEvent ──
    for (const row of acctRows) {
      const nasIp = row.nasipaddress?.toString()
      let router = nasIp ? routerByNasIp.get(nasIp) : undefined

      // FALLBACK: NAS IP didn't match any known router.
      // This happens when the router is behind CGNAT (private WAN IP ≠ public callback IP),
      // or the hotspot bridge IP (10.55.0.1) is used as NAS-IP-Address instead of WAN IP.
      // Resolve via username → RadiusCredential → routerId as a guaranteed fallback.
      if (!router && row.username) {
        const cred = await this.prisma.radiusCredential.findFirst({
          where: { username: row.username },
          select: { routerId: true },
        })
        if (cred?.routerId) {
          router = routers.find((r) => r.id === cred.routerId)
          // Auto-learn the real NAS IP from this accounting packet so future
          // lookups hit the fast NAS IP map path instead of this fallback.
          if (router && nasIp && !router.radiusNasIpAddress) {
            try {
              await this.prisma.router.update({
                where: { id: router.id },
                data: { radiusNasIpAddress: nasIp },
              })
              router = { ...router, radiusNasIpAddress: nasIp }
              routerByNasIp.set(nasIp, router)
            } catch {
              // Non-fatal
            }
          }
        }
      }

      if (!router) continue

      const tenantId = router.tenantId
      const radiusSessionId = row.acctsessionid
      if (!radiusSessionId) continue

      const username = row.username ?? ''
      const macAddress = row.callingstationid
        ? row.callingstationid.trim().toUpperCase().replace(/-/g, ':')
        : null
      const ipAddress = row.framedipaddress?.toString() ?? null
      const inputOctets = row.acctinputoctets ?? BigInt(0)
      const outputOctets = row.acctoutputoctets ?? BigInt(0)
      const sessionTimeSeconds = row.acctsessiontime ?? 0
      const isStopped = row.acctstoptime != null
      const sessionStatus = isStopped ? SessionStatus.CLOSED : SessionStatus.ACTIVE
      const startedAt = row.acctstarttime ?? now
      const lastAccountingAt = row.acctupdatetime ?? row.acctstarttime ?? now
      const activation = username ? activationByUsername.get(username) : undefined

      // 4a. Upsert networkSession — this powers activeUsers count and CoA disconnect
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
            endedAt: isStopped ? (row.acctstoptime ?? now) : null,
            ...(activation ? { activationId: activation.id } : {}),
            ...(activation?.voucherRedemptionId ? { voucherRedemptionId: activation.voucherRedemptionId } : {}),
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
            nasIpAddress: nasIp ?? null,
            inputOctets,
            outputOctets,
            sessionTimeSeconds,
            startedAt,
            lastAccountingAt,
            endedAt: isStopped ? (row.acctstoptime ?? now) : null,
            activationId: activation?.id ?? null,
            voucherRedemptionId: activation?.voucherRedemptionId ?? null,
          },
        })
      } catch (err) {
        this.logger.warn(
          `syncRadiusSqlSignals: session upsert failed for ${radiusSessionId}: ${err instanceof Error ? err.message : err}`,
        )
      }

      // 4b. Synthesise a radiusEvent for this accounting row (powers live checks)
      // Use acctuniqueid as idempotency key stored in message field.
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
              nasIpAddress: nasIp ?? null,
              message: acctMarker,
            },
          })
        } catch (err) {
          this.logger.warn(
            `syncRadiusSqlSignals: acct radiusEvent create failed for ${row.acctuniqueid}: ${err instanceof Error ? err.message : err}`,
          )
        }
      }

      // 4c. Update router health and NAS IP from this accounting signal
      await this.prisma.router.update({
        where: { id: router.id },
        data: {
          status: RouterStatus.HEALTHY,
          onboardingStatus: RouterOnboardingStatus.VERIFIED_ONLINE,
          verificationStatus: 'VERIFIED',
          lastSeenAt: now,
          lastRadiusSignalAt: now,
          lastAccountingSignalAt: row.acctupdatetime ?? row.acctstarttime ?? row.acctstoptime ?? now,
          verifiedAt: now,
          // Learn real NAS IP from the packet if not already set
          ...(nasIp && !router.radiusNasIpAddress ? { radiusNasIpAddress: nasIp } : {}),
        },
      })
    }

    // ── 5. Re-aggregate usedBytes on all activations touched this cycle ──
    // enforceDataQuotas() reads this — must stay in sync with real byte counts.
    const touchedIds = [...new Set(
      acctRows
        .map((r) => r.username ? activationByUsername.get(r.username)?.id : undefined)
        .filter((id): id is string => Boolean(id)),
    )]
    for (const activationId of touchedIds) {
      const agg = await this.prisma.networkSession.aggregate({
        where: { activationId },
        _sum: { inputOctets: true, outputOctets: true },
      })
      const usedBytes =
        (agg._sum.inputOctets ?? BigInt(0)) + (agg._sum.outputOctets ?? BigInt(0))
      await this.prisma.packageActivation.update({
        where: { id: activationId },
        data: { usedBytes },
      })
    }

    // ── 6. Synthesise radiusEvent records from radPostAuth ──
    // FreeRADIUS post-auth { sql } writes every auth attempt to radpostauth.
    // reply = 'Access-Accept' or 'Access-Reject'. This powers the
    // "Router has not contacted RADIUS yet" and "No successful test authentication"
    // live checks without needing rlm_rest.
    const recentPostAuth = await this.prisma.radPostAuth.findMany({
      where: { authdate: { gte: recentSince } },
      orderBy: { id: 'desc' },
      take: 500,
    })

    // Pre-fetch credentials to map username → tenantId + routerId
    const postAuthUsernames = [...new Set(recentPostAuth.map((r) => r.username).filter(Boolean))]
    const credentials = postAuthUsernames.length
      ? await this.prisma.radiusCredential.findMany({
          where: { username: { in: postAuthUsernames } },
          select: {
            username: true,
            tenantId: true,
            routerId: true,
          },
        })
      : []
    const credByUsername = new Map(credentials.map((c) => [c.username, c]))

    for (const row of recentPostAuth) {
      if (!row.username) continue

      const cred = credByUsername.get(row.username)
      if (!cred?.tenantId) continue // Cannot attribute to a tenant — skip

      const isAccept = (row.reply ?? '').toLowerCase().includes('accept')
      const eventType = isAccept ? RadiusEventType.ACCESS_ACCEPT : RadiusEventType.ACCESS_REJECT

      // Idempotency: one radiusEvent per radPostAuth row, keyed by row id
      const authMarker = `syn-auth:${row.id}`
      const existingAuthEvent = await this.prisma.radiusEvent.findFirst({
        where: { tenantId: cred.tenantId, message: authMarker },
        select: { id: true },
      })
      if (existingAuthEvent) continue

      try {
        await this.prisma.radiusEvent.create({
          data: {
            tenantId: cred.tenantId,
            routerId: cred.routerId ?? null,
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
          `syncRadiusSqlSignals: auth radiusEvent create failed for radpostauth.id=${row.id}: ${err instanceof Error ? err.message : err}`,
        )
      }

      // If accepted, also update router lastRadiusSignalAt
      if (isAccept && cred.routerId) {
        await this.prisma.router.updateMany({
          where: { id: cred.routerId },
          data: { lastRadiusSignalAt: row.authdate },
        })
      }
    }
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
    }
  }

  private async processPendingDisconnects() {
    if (process.env.RADIUS_DISCONNECT_ENABLED !== 'true') {
      return
    }

    const attempts = await this.prisma.disconnectionAttempt.findMany({
      where: {
        method: DisconnectionMethod.RADIUS_DISCONNECT,
        status: DisconnectionStatus.REQUESTED,
      },
      take: 25,
    })

    for (const attempt of attempts) {
      try {
        const secret = process.env.RADIUS_DISCONNECT_SECRET?.trim() || process.env.RADIUS_SHARED_SECRET
        // RADIUS_DISCONNECT_HOST must be BLANK in .env so we resolve per-router.
        // CoA Disconnect-Request must go to the MikroTik router on port 3799,
        // NOT to the FreeRADIUS container. MikroTik uses the same shared secret for CoA.
        let host = process.env.RADIUS_DISCONNECT_HOST?.trim() || ''
        if (!host && attempt.routerId) {
          const router = await this.prisma.router.findUnique({
            where: { id: attempt.routerId },
          })
          if (router) {
            host = router.radiusNasIpAddress ?? router.host ?? ''
          }
        }
        if (!host) {
          this.logger.warn(`CoA disconnect skipped for attempt ${attempt.id}: router NAS IP unknown. Re-run the provisioning script so the router reports its WAN IP.`)
          await this.prisma.disconnectionAttempt.update({
            where: { id: attempt.id },
            data: {
              status: DisconnectionStatus.FAILED,
              completedAt: new Date(),
              message: 'CoA target unresolvable — router.radiusNasIpAddress is null. Re-provision the router.',
            },
          })
          continue
        }
        const port = process.env.RADIUS_DISCONNECT_PORT ?? '3799'
        if (!secret) {
          throw new Error('RADIUS disconnect secret is not configured')
        }

        const packet = [
          `User-Name = ${attempt.username ?? ''}`,
          attempt.radiusSessionId ? `Acct-Session-Id = ${attempt.radiusSessionId}` : '',
          attempt.macAddress ? `Calling-Station-Id = ${attempt.macAddress}` : '',
        ].filter(Boolean).join('\n')

        await this.runRadclientDisconnect(host, port, secret, packet)

        await this.prisma.disconnectionAttempt.update({
          where: { id: attempt.id },
          data: {
            status: DisconnectionStatus.SUCCESS,
            completedAt: new Date(),
            message: 'RADIUS Disconnect-Request sent successfully',
          },
        })
      } catch (error) {
        await this.prisma.disconnectionAttempt.update({
          where: { id: attempt.id },
          data: {
            status: DisconnectionStatus.FAILED,
            completedAt: new Date(),
            message: error instanceof Error ? error.message : 'RADIUS Disconnect-Request failed',
          },
        })
      }
    }
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
    // MikroTik sends RADIUS interim-update every 60s (set in hotspot profile).
    // A session with no accounting signal for 5 minutes is definitively dead.
    // 30 minutes was too long — ghost ACTIVE sessions caused the captive portal
    // to report existingActiveAccess=true and skip the package selection screen.
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000)
    await this.prisma.networkSession.updateMany({
      where: {
        status: SessionStatus.ACTIVE,
        OR: [{ lastAccountingAt: null }, { lastAccountingAt: { lt: staleBefore } }],
      },
      data: {
        status: SessionStatus.STALE,
        endedAt: new Date(),
      },
    })
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
      } catch (err) {
        this.logger.warn(
          `pollPendingDisbursements: status check failed for ${disbursement.reference}: ${err instanceof Error ? err.message : err}`,
        )
      }
    }
  }
}
