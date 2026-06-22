import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  DisconnectionMethod,
  DisconnectionStatus,
  PackageActivationStatus,
  PaymentStatus,
  RadiusCredentialStatus,
  RouterOnboardingStatus,
  RouterStatus,
  SessionStatus,
  Prisma,
} from '@prisma/client'
import { execSync, spawn } from 'child_process'
import { PrismaService } from '../../prisma.service'
import { RadiusCredentialService } from './radius-credential.service'

@Injectable()
export class AccessLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccessLifecycleService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly radiusCredentialService: RadiusCredentialService,
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

    const now = new Date()

    // Build NAS IP → router lookup using BOTH radiusClient.ipAddress (the registered
    // placeholder) AND router.radiusNasIpAddress (the real WAN IP learned from the
    // provisioning callback). Either may match depending on router setup state.
    const routers = await this.prisma.router.findMany({
      include: { radiusClient: true },
    })
    const routerByNasIp = new Map<string, typeof routers[0]>()
    for (const router of routers) {
      if (router.radiusClient?.ipAddress) routerByNasIp.set(router.radiusClient.ipAddress, router)
      if (router.radiusNasIpAddress) routerByNasIp.set(router.radiusNasIpAddress, router)
    }

    // Pre-fetch all activations that have a radiusUsername matching any username
    // in the current radAcct batch. This avoids N+1 queries inside the loop.
    const usernames = [...new Set(acctRows.map((r) => r.username).filter(Boolean))] as string[]
    const activations = usernames.length
      ? await this.prisma.packageActivation.findMany({
          where: { radiusUsername: { in: usernames } },
          include: { voucherRedemption: true },
        })
      : []
    const activationByUsername = new Map(activations.map((a) => [a.radiusUsername, a]))

    for (const row of acctRows) {
      const nasIp = row.nasipaddress?.toString()
      const router = nasIp ? routerByNasIp.get(nasIp) : undefined

      // Cannot attribute this accounting row to any known router — skip.
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
        // Non-fatal: one bad row must not block all others. Log and continue.
        this.logger.warn(
          `syncRadiusSqlSignals: failed to upsert session ${radiusSessionId}: ${err instanceof Error ? err.message : err}`,
        )
      }

      // Update router health from this accounting signal.
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
        },
      })
    }

    // After upserting all sessions, re-aggregate usedBytes on every touched
    // activation so enforceDataQuotas() has accurate byte counts.
    const touchedActivationIds = [...new Set(
      acctRows
        .map((r) => r.username ? activationByUsername.get(r.username)?.id : undefined)
        .filter((id): id is string => Boolean(id)),
    )]
    for (const activationId of touchedActivationIds) {
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
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000)
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
}
