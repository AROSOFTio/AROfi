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
  method: DisconnectionMethod
  status: DisconnectionStatus
}

type MutableAccessLifecycleService = {
  expireActivations: () => Promise<void>
  logoutHotspotActiveSession: (attempt: LogoutAttempt) => Promise<number>
}

/**
 * Ensures package/trial expiry removes the live RouterOS HotSpot session even
 * when the primary RADIUS Disconnect-Request path cannot kick the session.
 *
 * The normal lifecycle service expires the activation, removes the RADIUS
 * credential and tries CoA first. Older routers can still have missing or
 * stale /radius incoming / CoA-source settings. After each failed CoA attempt
 * the lifecycle puts the request into a short retry backoff. During that
 * backoff this compatibility layer uses the already-configured RouterOS API
 * over the SSTP management path to remove the live HotSpot user immediately.
 *
 * This is deliberately idempotent: if RouterOS confirms that the user is no
 * longer active, that is already the desired final state and the disconnect is
 * recorded as SUCCESS rather than escalating a false CRITICAL alarm.
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
        OR: [
          {
            method: DisconnectionMethod.AUTH_DISABLE_ONLY,
            status: DisconnectionStatus.NOT_SUPPORTED,
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
          {
            // A future nextRetryAt proves the primary CoA attempt already ran
            // and failed. Use the backoff window to kick the live RouterOS
            // session rather than making the customer wait for all CoA retries.
            method: DisconnectionMethod.RADIUS_DISCONNECT,
            status: DisconnectionStatus.REQUESTED,
            nextRetryAt: { gt: now },
          },
        ],
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
        method: true,
        status: true,
      },
      take: 25,
    })

    for (const attempt of attempts) {
      try {
        const removed = await this.logoutByBestIdentity(service, attempt)
        const recoveredCoa = attempt.method === DisconnectionMethod.RADIUS_DISCONNECT

        await this.prisma.disconnectionAttempt.update({
          where: { id: attempt.id },
          data: {
            status: DisconnectionStatus.SUCCESS,
            completedAt: new Date(),
            nextRetryAt: null,
            message: recoveredCoa
              ? `RouterOS API removed active session after CoA failure (${removed})`
              : `RouterOS HotSpot active session removed after expiry (${removed})`,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        // No matching session means RouterOS already removed it through
        // Session-Timeout, a previous CoA, or a reconnect. That is a successful
        // final state and must not create a false operator alarm.
        if (/no matching active HotSpot session/i.test(message)) {
          await this.prisma.disconnectionAttempt.update({
            where: { id: attempt.id },
            data: {
              status: DisconnectionStatus.SUCCESS,
              completedAt: new Date(),
              nextRetryAt: null,
              message: attempt.method === DisconnectionMethod.RADIUS_DISCONNECT
                ? 'RouterOS confirmed the HotSpot session was already absent after CoA failure'
                : 'RouterOS HotSpot session was already absent after expiry',
            },
          })
          continue
        }

        if (attempt.method === DisconnectionMethod.RADIUS_DISCONNECT) {
          // Do not consume or reset the lifecycle service's CoA retry budget.
          // Leaving the attempt REQUESTED lets its normal exponential retry run
          // while this API fallback gets another opportunity after that failure.
          this.logger.warn(
            `RouterOS API recovery for CoA attempt ${attempt.id} failed; RADIUS retry remains queued: ${message}`,
          )
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

  private async logoutByBestIdentity(
    service: MutableAccessLifecycleService,
    attempt: LogoutAttempt,
  ) {
    try {
      return await service.logoutHotspotActiveSession(attempt)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // Accounting MAC formatting/private-MAC changes can make the exact
      // username+MAC lookup miss while the same RADIUS username is still live.
      // On an expired activation that username must not retain any HotSpot
      // session, so retry by username alone before declaring it already absent.
      if (
        attempt.username &&
        attempt.macAddress &&
        /no matching active HotSpot session/i.test(message)
      ) {
        return service.logoutHotspotActiveSession({
          ...attempt,
          macAddress: null,
        })
      }

      throw error
    }
  }
}
