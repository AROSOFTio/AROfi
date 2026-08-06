import { Injectable } from '@nestjs/common'
import {
  BillingTransactionStatus,
  BillingTransactionType,
  VoucherStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'

type AgentVoucherMetric = {
  agentId: string
  agent: {
    id: string
    code: string
    name: string
    phoneNumber: string
  }
  totalAssigned: number
  generated: number
  printed: number
  unsold: number
  soldAwaitingUse: number
  redeemed: number
  expired: number
  voided: number
  assignedValueUgx: number
  unsoldValueUgx: number
  recordedSales: number
  recordedSalesUgx: number
  recordedFeesUgx: number
  recordedNetUgx: number
}

@Injectable()
export class AgentVoucherMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId?: string) {
    const now = new Date()
    const [batches, sales] = await Promise.all([
      this.prisma.voucherBatch.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          agentId: { not: null },
        },
        select: {
          agentId: true,
          agent: {
            select: {
              id: true,
              code: true,
              name: true,
              phoneNumber: true,
            },
          },
          vouchers: {
            select: {
              status: true,
              expiresAt: true,
              faceValueUgx: true,
            },
          },
        },
      }),
      this.prisma.billingTransaction.groupBy({
        by: ['agentId'],
        where: {
          ...(tenantId ? { tenantId } : {}),
          agentId: { not: null },
          type: BillingTransactionType.VOUCHER_SALE,
          status: BillingTransactionStatus.COMPLETED,
        },
        _count: { _all: true },
        _sum: {
          grossAmountUgx: true,
          feeAmountUgx: true,
          netAmountUgx: true,
        },
      }),
    ])

    const metrics = new Map<string, AgentVoucherMetric>()

    const ensureMetric = (agent: NonNullable<(typeof batches)[number]['agent']>) => {
      const existing = metrics.get(agent.id)
      if (existing) return existing

      const created: AgentVoucherMetric = {
        agentId: agent.id,
        agent,
        totalAssigned: 0,
        generated: 0,
        printed: 0,
        unsold: 0,
        soldAwaitingUse: 0,
        redeemed: 0,
        expired: 0,
        voided: 0,
        assignedValueUgx: 0,
        unsoldValueUgx: 0,
        recordedSales: 0,
        recordedSalesUgx: 0,
        recordedFeesUgx: 0,
        recordedNetUgx: 0,
      }
      metrics.set(agent.id, created)
      return created
    }

    for (const batch of batches) {
      if (!batch.agent || !batch.agentId) continue
      const metric = ensureMetric(batch.agent)

      for (const voucher of batch.vouchers) {
        metric.totalAssigned += 1
        metric.assignedValueUgx += voucher.faceValueUgx

        const expiredByDate =
          voucher.expiresAt !== null &&
          voucher.expiresAt <= now &&
          voucher.status !== VoucherStatus.REDEEMED &&
          voucher.status !== VoucherStatus.VOID &&
          voucher.status !== VoucherStatus.VOIDED

        if (voucher.status === VoucherStatus.EXPIRED || expiredByDate) {
          metric.expired += 1
          continue
        }

        if (voucher.status === VoucherStatus.GENERATED) {
          metric.generated += 1
          metric.unsold += 1
          metric.unsoldValueUgx += voucher.faceValueUgx
        } else if (voucher.status === VoucherStatus.PRINTED) {
          metric.printed += 1
          metric.unsold += 1
          metric.unsoldValueUgx += voucher.faceValueUgx
        } else if (voucher.status === VoucherStatus.SOLD) {
          metric.soldAwaitingUse += 1
        } else if (voucher.status === VoucherStatus.REDEEMED) {
          metric.redeemed += 1
        } else if (
          voucher.status === VoucherStatus.VOID ||
          voucher.status === VoucherStatus.VOIDED
        ) {
          metric.voided += 1
        }
      }
    }

    for (const sale of sales) {
      if (!sale.agentId) continue
      const metric = metrics.get(sale.agentId)
      if (!metric) continue
      metric.recordedSales = sale._count._all
      metric.recordedSalesUgx = sale._sum.grossAmountUgx ?? 0
      metric.recordedFeesUgx = sale._sum.feeAmountUgx ?? 0
      metric.recordedNetUgx = sale._sum.netAmountUgx ?? 0
    }

    const items = Array.from(metrics.values()).sort(
      (left, right) =>
        right.recordedSalesUgx - left.recordedSalesUgx ||
        right.totalAssigned - left.totalAssigned,
    )

    return {
      summary: {
        agentsWithStock: items.length,
        totalAssigned: items.reduce((total, item) => total + item.totalAssigned, 0),
        unsold: items.reduce((total, item) => total + item.unsold, 0),
        soldAwaitingUse: items.reduce((total, item) => total + item.soldAwaitingUse, 0),
        redeemed: items.reduce((total, item) => total + item.redeemed, 0),
        expired: items.reduce((total, item) => total + item.expired, 0),
        voided: items.reduce((total, item) => total + item.voided, 0),
        unsoldValueUgx: items.reduce((total, item) => total + item.unsoldValueUgx, 0),
        recordedSales: items.reduce((total, item) => total + item.recordedSales, 0),
        recordedSalesUgx: items.reduce((total, item) => total + item.recordedSalesUgx, 0),
      },
      items,
    }
  }
}
