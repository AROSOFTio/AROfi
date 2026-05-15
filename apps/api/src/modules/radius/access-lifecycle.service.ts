import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  PackageActivationStatus,
  PaymentStatus,
  RadiusCredentialStatus,
  RouterOnboardingStatus,
  RouterStatus,
  SessionStatus,
} from '@prisma/client'
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
    if (process.env.ACCESS_WORKERS_ENABLED === 'false') {
      return
    }

    this.timer = setInterval(() => {
      void this.runOnce().catch((error) => this.logger.error(error))
    }, Number.parseInt(process.env.ACCESS_WORKER_INTERVAL_MS ?? '60000', 10))
    void this.runOnce().catch((error) => this.logger.error(error))
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }

  async runOnce() {
    await this.expireActivations()
    await this.syncRadiusSqlSignals()
    await this.cleanStaleSessions()
    await this.markStuckPendingPayments()
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
