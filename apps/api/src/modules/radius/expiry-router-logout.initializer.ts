import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import {
  DisconnectionMethod,
  DisconnectionStatus,
  PackageActivationStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { AccessLifecycleService } from './access-lifecycle.service'

type LogoutAttempt = {
  id: string
  routerId: string | null
  username: string | null
  macAddress: string | null
  retryCount: number
}

type MutableAccessLifecycleService = {
  expireActivations: () => Promise<void>
  logoutHotspotActiveSession: (attempt: LogoutAttempt) => Promise<number>
}

/**
 * Ensures package/trial expiry removes the live RouterOS HotSpot session even
 * when RADIUS CoA is disabled on the server.
 *
 * The normal lifecycle service already expires the activation, removes the
 * RADIUS credential and queues a disconnect in the same five-second cycle.
 * Older deployments marked that disconnect NOT_SUPPORTED when CoA was off,
 * which cut internet but could leave the phone shown as logged in. This final
 * fallback uses the router API/SSTP management path to remove that exact old
 * username+MAC session without disconnecting the phone from the WiFi radio.
 */
@Injectable()
export class ExpiryRouterLogoutInitializer implements OnModuleInit {
  private readonly logger = new Logger(ExpiryRouterLogoutInitializer.name)

  constructor(
    private readonly lifecycle: AccessLifecycleService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const service = this.lifecycle as unknown as MutableAccessLifecycleService
    const originalExpireActivations = service.expireActivations.bind(service)

    service.expireActivations = async () => {
      await originalExpireActivations()
      await this.processApiLogoutFallbacks(service)
    }
  }

  private async processApiLogoutFallbacks(service: MutableAccessLifecycleService) {
    const now = new Date()
    const attempts = await this.prisma.disconnectionAttempt.findMany({
      where: {
        method: DisconnectionMethod.AUTH_DISABLE_ONLY,
        status: DisconnectionStatus.NOT_SUPPORTED,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        activation: {
          status: {
            in: [
              PackageActivationStatus.EXPIRED,
              PackageActivationStatus.QUOTA_EXHAUSTED,
            ],
          },
        },
      },
      select: {
        id: true,
        routerId: true,
        username: true,
        macAddress: true,
        retryCount: true,
      },
      take: 25,
    })

    for (const attempt of attempts) {
      try {
        const removed = await service.logoutHotspotActiveSession(attempt)
        await this.prisma.disconnectionAttempt.update({
          where: { id: attempt.id },
          data: {
            status: DisconnectionStatus.SUCCESS,
            completedAt: new Date(),
            nextRetryAt: null,
            message: `RouterOS HotSpot active session removed after expiry (${removed})`,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        // No matching session means RouterOS already removed it through
        // Session-Timeout, a prior CoA, or a reconnect. That is a successful
        // final state and must not create a false operator alarm.
        if (/no matching active HotSpot session/i.test(message)) {
          await this.prisma.disconnectionAttempt.update({
            where: { id: attempt.id },
            data: {
              status: DisconnectionStatus.SUCCESS,
              completedAt: new Date(),
              nextRetryAt: null,
              message: 'RouterOS HotSpot session was already absent after expiry',
            },
          })
          continue
        }

        const retryCount = attempt.retryCount + 1
        const exhausted = retryCount >= 5
        await this.prisma.disconnectionAttempt.update({
          where: { id: attempt.id },
          data: {
            retryCount,
            status: exhausted
              ? DisconnectionStatus.FAILED
              : DisconnectionStatus.NOT_SUPPORTED,
            completedAt: exhausted ? new Date() : null,
            nextRetryAt: exhausted
              ? null
              : new Date(Date.now() + Math.min(60_000, 5_000 * 2 ** (retryCount - 1))),
            message: `RouterOS expiry logout failed: ${message}`,
          },
        })

        this.logger.warn(
          `RouterOS expiry logout attempt ${attempt.id} failed (${retryCount}/5): ${message}`,
        )
      }
    }
  }
}
