#!/usr/bin/env python3
"""Add manual per-customer router outage compensation without changing router provisioning.

The existing automatic compensation path remains untouched. This patch only:
- adds a read-only preview of the latest resolved outage and affected activations;
- adds an idempotent manual method for selected activation IDs;
- keeps automatic compensation disabled unless the tenant explicitly enabled it.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'apps/api/src/modules/routers/routers.service.ts'
text = PATH.read_text()

sentinel = 'async manuallyCompensateSelectedOutage('
if sentinel in text:
    print('Selective router compensation patch already applied.')
    raise SystemExit(0)

old_overview = '''  async getCompensationOverview(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({ where: { id: routerId }, select: { tenantId: true } })
    if (!router) {
      throw new NotFoundException('Router not found')
    }
    if (tenantId && router.tenantId !== tenantId) {
      throw new NotFoundException('Router not found')
    }

    const [settings, outages, compensations] = await Promise.all([
      this.getRouterCompensationSettings(router.tenantId),
      this.prisma.routerOutage.findMany({
        where: { routerId },
        orderBy: { offlineAt: 'desc' },
        take: 20,
      }),
      this.prisma.routerCompensation.findMany({
        where: { routerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          activation: {
            select: {
              id: true,
              customerReference: true,
              accessPhoneNumber: true,
              package: { select: { name: true } },
            },
          },
        },
      }),
    ])

    return {
      settings,
      outages,
      compensations,
    }
  }
'''

new_overview = '''  async getCompensationOverview(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findUnique({ where: { id: routerId }, select: { tenantId: true } })
    if (!router) {
      throw new NotFoundException('Router not found')
    }
    if (tenantId && router.tenantId !== tenantId) {
      throw new NotFoundException('Router not found')
    }

    const [settings, outages, compensations, pendingOutage] = await Promise.all([
      this.getRouterCompensationSettings(router.tenantId),
      this.prisma.routerOutage.findMany({
        where: { routerId },
        orderBy: { offlineAt: 'desc' },
        take: 20,
      }),
      this.prisma.routerCompensation.findMany({
        where: { routerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          activation: {
            select: {
              id: true,
              customerReference: true,
              accessPhoneNumber: true,
              package: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.routerOutage.findFirst({
        where: {
          routerId,
          status: { in: [RouterOutageStatus.RESOLVED, RouterOutageStatus.COMPENSATION_SKIPPED] },
          restoredAt: { not: null },
        },
        orderBy: { restoredAt: 'desc' },
        include: {
          router: { select: { id: true, tenantId: true, name: true, hotspotId: true } },
        },
      }),
    ])

    const candidates = pendingOutage
      ? await this.buildManualCompensationCandidates(pendingOutage)
      : []

    return {
      settings,
      outages,
      compensations,
      pendingOutage: pendingOutage
        ? {
            id: pendingOutage.id,
            offlineAt: pendingOutage.offlineAt,
            restoredAt: pendingOutage.restoredAt,
            durationSeconds: pendingOutage.durationSeconds,
            status: pendingOutage.status,
          }
        : null,
      candidates,
    }
  }
'''

if text.count(old_overview) != 1:
    raise RuntimeError('Could not find the existing getCompensationOverview method exactly once.')
text = text.replace(old_overview, new_overview, 1)

insert_marker = '''  async updateCompensationSettings(tenantId: string, enabled: boolean) {'''
if text.count(insert_marker) != 1:
    raise RuntimeError('Could not find updateCompensationSettings insertion marker exactly once.')

new_methods = '''  private async buildManualCompensationCandidates(outage: {
    id: string
    tenantId: string
    routerId: string
    offlineAt: Date
    restoredAt: Date | null
    router: { hotspotId: string | null }
  }) {
    if (!outage.restoredAt) {
      return []
    }

    const existing = await this.prisma.routerCompensation.findMany({
      where: { outageId: outage.id },
      select: { activationId: true },
    })
    const alreadyCompensatedIds = existing.map((item) => item.activationId)

    const activations = await this.prisma.packageActivation.findMany({
      where: {
        tenantId: outage.tenantId,
        status: { in: [PackageActivationStatus.ACTIVE, PackageActivationStatus.EXPIRED] },
        startedAt: { lt: outage.restoredAt },
        endsAt: { gt: outage.offlineAt },
        ...(alreadyCompensatedIds.length > 0 ? { id: { notIn: alreadyCompensatedIds } } : {}),
        OR: [
          { routerId: outage.routerId },
          ...(outage.router.hotspotId ? [{ hotspotId: outage.router.hotspotId }] : []),
        ],
      },
      include: {
        package: { select: { name: true, code: true } },
        voucherRedemption: {
          select: {
            voucher: { select: { code: true } },
          },
        },
      },
      orderBy: { endsAt: 'asc' },
      take: 1000,
    })

    const now = new Date()
    return activations.flatMap((activation) => {
      const overlapStartMs = Math.max(activation.startedAt.getTime(), outage.offlineAt.getTime())
      const overlapEndMs = Math.min(activation.endsAt.getTime(), outage.restoredAt!.getTime())
      const secondsLost = Math.ceil((overlapEndMs - overlapStartMs) / 1000)
      if (secondsLost <= 0) {
        return []
      }
      const extensionBaseMs = Math.max(activation.endsAt.getTime(), outage.restoredAt!.getTime())
      return [{
        activationId: activation.id,
        customerReference: activation.customerReference,
        accessPhoneNumber: activation.accessPhoneNumber,
        packageName: activation.package.name,
        packageCode: activation.package.code,
        source: activation.source,
        voucherCode: activation.voucherRedemption?.voucher.code ?? null,
        startedAt: activation.startedAt,
        endsAt: activation.endsAt,
        timeRemainingSeconds: Math.max(0, Math.round((activation.endsAt.getTime() - now.getTime()) / 1000)),
        remainingAtOutageSeconds: Math.max(0, Math.round((activation.endsAt.getTime() - overlapStartMs) / 1000)),
        secondsLost,
        proposedNewEndsAt: new Date(extensionBaseMs + secondsLost * 1000),
      }]
    })
  }

  async manuallyCompensateSelectedOutage(routerId: string, activationIds: string[], tenantId?: string) {
    const uniqueActivationIds = [...new Set(activationIds.map((id) => id.trim()).filter(Boolean))].slice(0, 1000)
    if (uniqueActivationIds.length === 0) {
      throw new BadRequestException('Select at least one affected customer to compensate')
    }

    const router = await this.prisma.router.findUnique({ where: { id: routerId }, select: { tenantId: true } })
    if (!router || (tenantId && router.tenantId !== tenantId)) {
      throw new NotFoundException('Router not found')
    }

    const outage = await this.prisma.routerOutage.findFirst({
      where: {
        routerId,
        status: { in: [RouterOutageStatus.RESOLVED, RouterOutageStatus.COMPENSATION_SKIPPED] },
        restoredAt: { not: null },
      },
      orderBy: { restoredAt: 'desc' },
      include: {
        router: { select: { id: true, tenantId: true, name: true, hotspotId: true } },
      },
    })
    if (!outage || !outage.restoredAt) {
      throw new NotFoundException('No resolved outage is waiting for manual compensation')
    }

    const candidates = await this.buildManualCompensationCandidates(outage)
    const selected = candidates.filter((candidate) => uniqueActivationIds.includes(candidate.activationId))
    if (selected.length === 0) {
      throw new BadRequestException('The selected customers are no longer awaiting compensation')
    }

    let newlyCompensated = 0
    let newlyCreditedSeconds = 0
    const createdCompensations: Array<{
      id: string
      customerReference: string | null
      accessPhoneNumber: string | null
      secondsCredited: number
      newEndsAt: Date
      packageName: string
      tenantId: string
    }> = []

    for (const candidate of selected) {
      try {
        const compensation = await this.prisma.$transaction(async (tx) => {
          const current = await tx.packageActivation.findUnique({
            where: { id: candidate.activationId },
            include: { package: { select: { name: true } } },
          })
          if (!current || current.tenantId !== outage.tenantId) {
            return null
          }

          const existing = await tx.routerCompensation.findUnique({
            where: { outageId_activationId: { outageId: outage.id, activationId: current.id } },
          })
          if (existing) {
            return null
          }

          const overlapStartMs = Math.max(current.startedAt.getTime(), outage.offlineAt.getTime())
          const overlapEndMs = Math.min(current.endsAt.getTime(), outage.restoredAt!.getTime())
          const secondsCredited = Math.ceil((overlapEndMs - overlapStartMs) / 1000)
          if (secondsCredited <= 0) {
            return null
          }

          const previousEndsAt = current.endsAt
          const extensionBaseMs = Math.max(previousEndsAt.getTime(), outage.restoredAt!.getTime())
          const newEndsAt = new Date(extensionBaseMs + secondsCredited * 1000)

          await tx.packageActivation.update({
            where: { id: current.id },
            data: {
              endsAt: newEndsAt,
              status: PackageActivationStatus.ACTIVE,
              metadata: this.mergeJsonObject(current.metadata, {
                lastRouterCompensationAt: new Date().toISOString(),
                lastRouterOutageId: outage.id,
                compensationReviewedManually: true,
              }) as Prisma.InputJsonValue,
            },
          })

          await this.radiusCredentialService.provisionForActivation(tx, {
            tenantId: outage.tenantId,
            activationId: current.id,
            username: current.radiusUsername,
            password: current.radiusPassword,
            boundMacAddress: current.boundMacAddress,
            routerId: current.routerId ?? outage.routerId,
          })

          return tx.routerCompensation.create({
            data: {
              tenantId: outage.tenantId,
              routerId: outage.routerId,
              outageId: outage.id,
              activationId: current.id,
              mode: RouterCompensationMode.MANUAL,
              secondsCredited,
              previousEndsAt,
              newEndsAt,
              customerReference: current.customerReference,
              accessPhoneNumber: current.accessPhoneNumber,
            },
            include: { activation: { select: { package: { select: { name: true } } } } },
          })
        })

        if (!compensation) {
          continue
        }
        newlyCompensated += 1
        newlyCreditedSeconds += compensation.secondsCredited
        createdCompensations.push({
          id: compensation.id,
          customerReference: compensation.customerReference,
          accessPhoneNumber: compensation.accessPhoneNumber,
          secondsCredited: compensation.secondsCredited,
          newEndsAt: compensation.newEndsAt,
          packageName: compensation.activation.package.name,
          tenantId: outage.tenantId,
        })
      } catch (error) {
        this.logger.warn(
          `Failed selected compensation for activation ${candidate.activationId}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    const [totals, remainingCandidates] = await Promise.all([
      this.prisma.routerCompensation.aggregate({
        where: { outageId: outage.id },
        _count: { _all: true },
        _sum: { secondsCredited: true },
      }),
      this.buildManualCompensationCandidates(outage),
    ])
    const totalAffected = totals._count._all
    const totalSecondsCredited = totals._sum.secondsCredited ?? 0
    const remainingCount = remainingCandidates.length

    await this.prisma.routerOutage.update({
      where: { id: outage.id },
      data: {
        status: remainingCount > 0
          ? RouterOutageStatus.RESOLVED
          : totalAffected > 0
            ? RouterOutageStatus.COMPENSATED
            : RouterOutageStatus.COMPENSATION_SKIPPED,
        compensationProcessedAt: remainingCount > 0 ? null : new Date(),
        affectedActivations: totalAffected,
        totalSecondsCredited,
        notes: remainingCount > 0
          ? `${totalAffected} customer(s) compensated; ${remainingCount} still awaiting manual review.`
          : `Manual review completed. Credited ${totalAffected} activation(s).`,
      },
    })

    if (newlyCompensated > 0) {
      await this.notifyCompensationSummary(outage, newlyCompensated, newlyCreditedSeconds, RouterCompensationMode.MANUAL)
      for (const compensation of createdCompensations) {
        void this.notifyCompensatedCustomer(compensation, outage.router.name)
      }
    }

    this.realtimeEvents.publish('router.compensation_processed', {
      tenantId: outage.tenantId,
      routerId: outage.routerId,
      data: {
        outageId: outage.id,
        mode: RouterCompensationMode.MANUAL,
        newlyCompensated,
        newlyCreditedSeconds,
        remainingCandidates: remainingCount,
      },
    })

    return {
      outageId: outage.id,
      newlyCompensated,
      newlyCreditedSeconds,
      affectedActivations: totalAffected,
      totalSecondsCredited,
      remainingCandidates: remainingCount,
    }
  }

'''

text = text.replace(insert_marker, new_methods + insert_marker, 1)
PATH.write_text(text)
print('Selective router compensation backend applied.')
