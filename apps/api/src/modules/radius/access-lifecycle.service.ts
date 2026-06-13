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
  ) {}

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
        take: 200,
      })

    const now = new Date()
    const clients = await this.prisma.radiusClient.findMany({ include: { router: true } })
    const clientByIp = new Map(clients.map((client) => [client.ipAddress, client]))

    for (const row of acctRows) {
      const nasIp = row.nasipaddress?.toString()
      const client = nasIp ? clientByIp.get(nasIp) : undefined
      if (!client) {
        continue
      }

      await this.prisma.router.update({
        where: { id: client.routerId },
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
        const secret = process.env.RADIUS_DISCONNECT_SECRET ?? process.env.RADIUS_SHARED_SECRET
        const host = process.env.RADIUS_DISCONNECT_HOST ?? process.env.RADIUS_PUBLIC_HOST ?? '127.0.0.1'
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
