import { ForbiddenException, Injectable } from '@nestjs/common'
import { AgentStatus, VoucherStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'

@Injectable()
export class AgentVoucherStockService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyStock(email: string, tenantId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, code: true, name: true, status: true },
    })
    if (!agent) throw new ForbiddenException('This login is not linked to an Agent profile.')
    if (agent.status !== AgentStatus.ACTIVE) throw new ForbiddenException('This Agent account is not active.')

    const batches = await this.prisma.voucherBatch.findMany({
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
    })

    const batchIds = batches.map((batch) => batch.id)
    const voucherCounts = batchIds.length
      ? await this.prisma.voucher.groupBy({
          by: ['batchId', 'status'],
          where: {
            tenantId,
            batchId: { in: batchIds },
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
        })
      : []

    const countsByBatch = new Map<string, { available: number; sold: number; redeemed: number }>()
    for (const row of voucherCounts) {
      if (!row.batchId) continue
      const counts = countsByBatch.get(row.batchId) ?? { available: 0, sold: 0, redeemed: 0 }
      if (row.status === VoucherStatus.GENERATED || row.status === VoucherStatus.PRINTED) {
        counts.available += row._count._all
      } else if (row.status === VoucherStatus.SOLD) {
        counts.sold += row._count._all
      } else if (row.status === VoucherStatus.REDEEMED) {
        counts.redeemed += row._count._all
      }
      countsByBatch.set(row.batchId, counts)
    }

    const summary = {
      assigned: 0,
      available: 0,
      sold: 0,
      redeemed: 0,
    }

    const items = batches.map((batch) => {
      const counts = countsByBatch.get(batch.id) ?? { available: 0, sold: 0, redeemed: 0 }
      summary.assigned += batch.quantity
      summary.available += counts.available
      summary.sold += counts.sold
      summary.redeemed += counts.redeemed

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
