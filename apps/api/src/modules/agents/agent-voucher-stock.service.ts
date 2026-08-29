import { ForbiddenException, Injectable } from '@nestjs/common'
import { AgentStatus, Prisma, VoucherStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'

@Injectable()
export class AgentVoucherStockService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyStock(email: string, tenantId: string) {
    const normalizedEmail = email.trim()
    const agentSelect = {
      id: true,
      code: true,
      name: true,
      status: true,
    } satisfies Prisma.AgentSelect

    // Authenticated emails are normally stored exactly as normalized by the
    // account flow. Keep the common lookup index-friendly and only fall back to
    // an insensitive comparison for legacy Agent rows with mismatched casing.
    const agent =
      (await this.prisma.agent.findFirst({
        where: { tenantId, email: normalizedEmail },
        select: agentSelect,
      })) ??
      (await this.prisma.agent.findFirst({
        where: { tenantId, email: { equals: normalizedEmail, mode: 'insensitive' } },
        select: agentSelect,
      }))

    if (!agent) throw new ForbiddenException('This login is not linked to an Agent profile.')
    if (agent.status !== AgentStatus.ACTIVE) throw new ForbiddenException('This Agent account is not active.')

    const [batches, batchTotals, stockCounts] = await Promise.all([
      this.prisma.voucherBatch.findMany({
        where: { tenantId, agentId: agent.id },
        select: {
          id: true,
          batchNumber: true,
          package: { select: { id: true, name: true, code: true } },
          quantity: true,
          faceValueUgx: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.voucherBatch.aggregate({
        where: { tenantId, agentId: agent.id },
        _sum: { quantity: true },
      }),
      this.prisma.voucher.groupBy({
        by: ['batchId', 'status'],
        where: {
          tenantId,
          batch: { agentId: agent.id },
          status: {
            in: [
              VoucherStatus.GENERATED,
              VoucherStatus.PRINTED,
              VoucherStatus.SOLD,
              VoucherStatus.REDEEMED,
            ],
          },
        },
        _count: { _all: true },
      }),
    ])

    const countsByBatch = new Map<string, { available: number; sold: number; redeemed: number }>()
    const summary = {
      assigned: batchTotals._sum.quantity ?? 0,
      available: 0,
      sold: 0,
      redeemed: 0,
    }

    for (const row of stockCounts) {
      if (!row.batchId) continue
      const counts = countsByBatch.get(row.batchId) ?? { available: 0, sold: 0, redeemed: 0 }
      if (row.status === VoucherStatus.GENERATED || row.status === VoucherStatus.PRINTED) {
        counts.available += row._count._all
        summary.available += row._count._all
      } else if (row.status === VoucherStatus.SOLD) {
        counts.sold += row._count._all
        summary.sold += row._count._all
      } else if (row.status === VoucherStatus.REDEEMED) {
        counts.redeemed += row._count._all
        summary.redeemed += row._count._all
      }
      countsByBatch.set(row.batchId, counts)
    }

    const items = batches.map((batch) => {
      const counts = countsByBatch.get(batch.id) ?? { available: 0, sold: 0, redeemed: 0 }

      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        package: batch.package,
        quantity: batch.quantity,
        faceValueUgx: batch.faceValueUgx,
        available: counts.available,
        sold: counts.sold,
        redeemed: counts.redeemed,
        status: batch.status,
        createdAt: batch.createdAt,
        expiresAt: batch.expiresAt,
      }
    })

    return {
      agent: { id: agent.id, code: agent.code, name: agent.name },
      summary,
      batches: items,
    }
  }
}
