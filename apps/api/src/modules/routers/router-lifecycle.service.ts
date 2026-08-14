import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, RadiusClientStatus, RouterStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { RemoteProxyService } from './remote-proxy.service'

const DEACTIVATED_TAG = 'AROFI_DEACTIVATED'

@Injectable()
export class RouterLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly remoteProxyService: RemoteProxyService,
  ) {}

  async getLifecycle(routerId: string, tenantId?: string) {
    const router = await this.findRouter(routerId, tenantId)
    const counts = await this.getProtectedActivityCounts(router.id)
    const protectedActivityCount = Object.values(counts).reduce((sum, count) => sum + count, 0)
    const isDeactivated = router.tags.includes(DEACTIVATED_TAG)

    return {
      routerId: router.id,
      routerName: router.name,
      tenant: router.tenant,
      lifecycleState: isDeactivated ? ('DEACTIVATED' as const) : ('ACTIVE' as const),
      canDelete: protectedActivityCount === 0,
      protectedActivityCount,
      protectedActivity: counts,
      deleteBlockReason:
        protectedActivityCount > 0
          ? 'This router has customer, access, or transaction-linked history. Deactivate it instead so AROFi keeps the audit trail.'
          : null,
      radiusClientEnabled: Boolean(router.radiusClient && router.radiusClient.status !== RadiusClientStatus.DISABLED),
      nasClientEnabled: Boolean(router.nasClient && router.nasClient.enabled !== false),
      remoteAccessEnabled: router.remoteAccessEnabled,
      remotePortOpen: router.isRemotePortOpen,
      createdAt: router.createdAt,
    }
  }

  async deleteRouter(routerId: string, tenantId?: string) {
    const router = await this.findRouter(routerId, tenantId)

    await this.prisma.$transaction(
      async (tx) => {
        // Re-resolve scope inside the delete transaction. This is the final,
        // server-authoritative ownership check even if the UI is stale.
        const lockedRouter = await tx.router.findFirst({
          where: tenantId ? { id: router.id, tenantId } : { id: router.id },
          select: { id: true },
        })
        if (!lockedRouter) {
          throw new NotFoundException('Router not found')
        }

        // The eligibility check lives in the SAME serializable transaction as
        // the delete. A new customer session/activation cannot safely race the
        // decision and turn a history-bearing router into a hard delete.
        const [activations, sessions, voucherRedemptions, compensations, radiusCredentials, disconnectionAttempts] =
          await Promise.all([
            tx.packageActivation.count({ where: { routerId: router.id } }),
            tx.networkSession.count({ where: { routerId: router.id } }),
            tx.voucherRedemption.count({ where: { routerId: router.id } }),
            tx.routerCompensation.count({ where: { routerId: router.id } }),
            tx.radiusCredential.count({ where: { routerId: router.id } }),
            tx.disconnectionAttempt.count({ where: { routerId: router.id } }),
          ])

        const protectedActivityCount =
          activations + sessions + voucherRedemptions + compensations + radiusCredentials + disconnectionAttempts
        if (protectedActivityCount > 0) {
          throw new BadRequestException(
            'This router already has customer/session/transaction history and cannot be permanently deleted. Deactivate it instead to preserve business and audit records.',
          )
        }

        // Diagnostic/bootstrap rows are safe to remove only after the protected
        // customer-history check above has confirmed this is still a new router.
        await tx.radiusEvent.deleteMany({ where: { routerId: router.id } })
        await tx.routerHealthCheck.deleteMany({ where: { routerId: router.id } })
        await tx.routerOutage.deleteMany({ where: { routerId: router.id } })
        await tx.radiusClient.deleteMany({ where: { routerId: router.id } })
        await tx.nasClient.deleteMany({ where: { routerId: router.id } })

        // Remote SSTP credentials are stored in the FreeRADIUS compatibility
        // tables without a Prisma relation to Router, so clean them explicitly.
        const remoteUsername = `router-${router.id}`
        await tx.radCheck.deleteMany({ where: { username: remoteUsername } })
        await tx.radReply.deleteMany({ where: { username: remoteUsername } })

        await tx.router.delete({ where: { id: router.id } })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )

    if (router.remotePort) {
      this.remoteProxyService.stopProxy(router.remotePort)
    }

    return {
      deleted: true,
      deactivated: false,
      routerId: router.id,
      message: 'Router permanently deleted. It had no protected customer or transaction history.',
    }
  }

  async deactivateRouter(routerId: string, tenantId?: string) {
    const router = await this.findRouter(routerId, tenantId)
    if (router.tags.includes(DEACTIVATED_TAG)) {
      return {
        ...(await this.getLifecycle(router.id, tenantId)),
        message: 'Router is already deactivated.',
      }
    }

    const tags = Array.from(new Set([...router.tags, DEACTIVATED_TAG]))

    await this.prisma.$transaction(async (tx) => {
      await tx.router.update({
        where: { id: router.id },
        data: {
          tags,
          status: RouterStatus.OFFLINE,
          isRemotePortOpen: false,
          remoteAccessEnabled: false,
          healthMessage: 'Deactivated in AROFi. Customer, payment, session, and audit history has been retained.',
        },
      })
      await tx.radiusClient.updateMany({
        where: { routerId: router.id },
        data: { status: RadiusClientStatus.DISABLED },
      })
      await tx.nasClient.updateMany({
        where: { routerId: router.id },
        data: { enabled: false },
      })
    })

    if (router.remotePort) {
      this.remoteProxyService.stopProxy(router.remotePort)
    }

    return {
      ...(await this.getLifecycle(router.id, tenantId)),
      message: 'Router deactivated. Its history is preserved and its AROFi NAS/RADIUS client is disabled.',
    }
  }

  async reactivateRouter(routerId: string, tenantId?: string) {
    const router = await this.findRouter(routerId, tenantId)
    const tags = router.tags.filter((tag) => tag !== DEACTIVATED_TAG)

    await this.prisma.$transaction(async (tx) => {
      await tx.router.update({
        where: { id: router.id },
        data: {
          tags,
          status: RouterStatus.PENDING,
          healthMessage: 'Reactivated in AROFi. Waiting for fresh router/RADIUS signals.',
        },
      })
      await tx.radiusClient.updateMany({
        where: { routerId: router.id },
        data: { status: RadiusClientStatus.ACTIVE },
      })
      await tx.nasClient.updateMany({
        where: { routerId: router.id },
        data: { enabled: true },
      })
    })

    return {
      ...(await this.getLifecycle(router.id, tenantId)),
      message: 'Router reactivated. Remote support access remains closed until an administrator opens it again.',
    }
  }

  private async findRouter(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findFirst({
      where: tenantId ? { id: routerId, tenantId } : { id: routerId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        tags: true,
        createdAt: true,
        remotePort: true,
        remoteAccessEnabled: true,
        isRemotePortOpen: true,
        tenant: { select: { id: true, name: true } },
        radiusClient: { select: { status: true } },
        nasClient: { select: { enabled: true } },
      },
    })

    if (!router) {
      throw new NotFoundException('Router not found')
    }

    return router
  }

  private async getProtectedActivityCounts(routerId: string) {
    const [activations, sessions, voucherRedemptions, compensations, radiusCredentials, disconnectionAttempts] =
      await Promise.all([
        this.prisma.packageActivation.count({ where: { routerId } }),
        this.prisma.networkSession.count({ where: { routerId } }),
        this.prisma.voucherRedemption.count({ where: { routerId } }),
        this.prisma.routerCompensation.count({ where: { routerId } }),
        this.prisma.radiusCredential.count({ where: { routerId } }),
        this.prisma.disconnectionAttempt.count({ where: { routerId } }),
      ])

    return {
      activations,
      sessions,
      voucherRedemptions,
      compensations,
      radiusCredentials,
      disconnectionAttempts,
    }
  }
}
