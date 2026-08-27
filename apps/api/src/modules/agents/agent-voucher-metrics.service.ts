import { Injectable } from '@nestjs/common'
import {
  BillingTransactionStatus,
  BillingTransactionType,
  Prisma,
  VoucherStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'

type AgentIdentity = {
  id: string
  code: string
  name: string
  phoneNumber: string
  territory: string | null
}

type VoucherMetric = {
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

type AgentVoucherMetric = VoucherMetric & {
  agentId: string
  agent: AgentIdentity
}

export type AgentVoucherMetricFilters = {
  agentId?: string
  territory?: string
  packageId?: string
  batchId?: string
  from?: string
  to?: string
  ownerType?: 'AGENT' | 'MAIN' | 'ALL'
}

@Injectable()
export class AgentVoucherMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId?: string, filters: AgentVoucherMetricFilters = {}) {
    const now = new Date()
    const ownerType = filters.ownerType ?? 'AGENT'
    const includeAgents = ownerType === 'AGENT' || ownerType === 'ALL'
    const includeMain = ownerType === 'MAIN' || ownerType === 'ALL'
    const salesDate = this.buildDateFilter(filters.from, filters.to)

    const agentWhere: Prisma.AgentWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(filters.agentId ? { id: filters.agentId } : {}),
      ...(filters.territory
        ? { territory: { contains: filters.territory, mode: 'insensitive' } }
        : {}),
    }

    const batchWhere: Prisma.VoucherBatchWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(filters.packageId ? { packageId: filters.packageId } : {}),
      ...(filters.batchId ? { id: filters.batchId } : {}),
      ...(ownerType === 'AGENT'
        ? { agentId: filters.agentId ? filters.agentId : { not: null } }
        : ownerType === 'MAIN'
          ? { agentId: null }
          : filters.agentId
            ? { agentId: filters.agentId }
            : {}),
      ...(filters.territory
        ? {
            agent: {
              is: { territory: { contains: filters.territory, mode: 'insensitive' } },
            },
          }
        : {}),
    }

    const voucherWhere: Prisma.VoucherWhereInput = {
      batch: batchWhere,
    }

    const saleWhere: Prisma.BillingTransactionWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      type: {
        in: [
          BillingTransactionType.VOUCHER_SALE,
          BillingTransactionType.VOUCHER_REDEMPTION,
        ],
      },
      status: BillingTransactionStatus.COMPLETED,
      grossAmountUgx: { gt: 0 },
      ...(salesDate ? { createdAt: salesDate } : {}),
      ...(filters.packageId ? { packageId: filters.packageId } : {}),
      ...(filters.batchId ? { voucher: { is: { batchId: filters.batchId } } } : {}),
      ...(filters.agentId
        ? {
            OR: [
              { agentId: filters.agentId },
              { voucher: { is: { batch: { is: { agentId: filters.agentId } } } } },
            ],
          }
        : {}),
    }

    const [agents, batches, voucherGroups, dateExpiredVoucherGroups, sales] = await Promise.all([
      includeAgents
        ? this.prisma.agent.findMany({
            where: agentWhere,
            select: {
              id: true,
              code: true,
              name: true,
              phoneNumber: true,
              territory: true,
            },
          })
        : Promise.resolve([]),
      this.prisma.voucherBatch.findMany({
        where: batchWhere,
        select: {
          id: true,
          agentId: true,
          agent: {
            select: {
              id: true,
              code: true,
              name: true,
              phoneNumber: true,
              territory: true,
            },
          },
        },
      }),
      this.prisma.voucher.groupBy({
        by: ['batchId', 'status'],
        where: voucherWhere,
        _count: { _all: true },
        _sum: { faceValueUgx: true },
      }),
      this.prisma.voucher.groupBy({
        by: ['batchId', 'status'],
        where: {
          ...voucherWhere,
          expiresAt: { lte: now },
          status: {
            notIn: [
              VoucherStatus.EXPIRED,
              VoucherStatus.REDEEMED,
              VoucherStatus.VOID,
              VoucherStatus.VOIDED,
            ],
          },
        },
        _count: { _all: true },
        _sum: { faceValueUgx: true },
      }),
      this.prisma.billingTransaction.findMany({
        where: saleWhere,
        select: {
          id: true,
          agentId: true,
          grossAmountUgx: true,
          feeAmountUgx: true,
          netAmountUgx: true,
          voucher: {
            select: {
              batch: {
                select: {
                  agentId: true,
                  agent: {
                    select: {
                      territory: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ])

    const metrics = new Map<string, AgentVoucherMetric>()
    const main = this.emptyMetric()

    const ensureMetric = (agent: AgentIdentity) => {
      const existing = metrics.get(agent.id)
      if (existing) return existing

      const created: AgentVoucherMetric = {
        agentId: agent.id,
        agent,
        ...this.emptyMetric(),
      }
      metrics.set(agent.id, created)
      return created
    }

    for (const agent of agents) {
      ensureMetric(agent)
    }

    const metricByBatch = new Map<string, VoucherMetric>()
    for (const batch of batches) {
      const target = batch.agent && batch.agentId
        ? ensureMetric(batch.agent)
        : includeMain
          ? main
          : null
      if (target) {
        metricByBatch.set(batch.id, target)
      }
    }

    const dateExpiredByBatchStatus = new Map<string, { count: number; valueUgx: number }>()
    for (const group of dateExpiredVoucherGroups) {
      dateExpiredByBatchStatus.set(this.batchStatusKey(group.batchId, group.status), {
        count: group._count._all,
        valueUgx: group._sum.faceValueUgx ?? 0,
      })
    }

    for (const group of voucherGroups) {
      const target = metricByBatch.get(group.batchId)
      if (!target) continue

      const dateExpired = dateExpiredByBatchStatus.get(this.batchStatusKey(group.batchId, group.status))
      this.accumulateVoucherGroup(
        target,
        group.status,
        group._count._all,
        group._sum.faceValueUgx ?? 0,
        dateExpired?.count ?? 0,
        dateExpired?.valueUgx ?? 0,
      )
    }

    for (const sale of sales) {
      const assignedAgentId = sale.voucher?.batch.agentId ?? sale.agentId
      const territory = sale.voucher?.batch.agent?.territory ?? null

      if (filters.territory && !territory?.toLowerCase().includes(filters.territory.toLowerCase())) {
        continue
      }

      if (assignedAgentId) {
        const metric = metrics.get(assignedAgentId)
        if (!metric || !includeAgents) continue
        this.accumulateSale(metric, sale)
      } else if (includeMain) {
        this.accumulateSale(main, sale)
      }
    }

    const items = Array.from(metrics.values()).sort(
      (left, right) =>
        right.recordedSalesUgx - left.recordedSalesUgx ||
        right.totalAssigned - left.totalAssigned,
    )

    const allMetrics: VoucherMetric[] = [
      ...items,
      ...(includeMain ? [main] : []),
    ]

    return {
      filters: {
        ...filters,
        ownerType,
      },
      summary: {
        totalAgentsTracked: items.length,
        agentsWithStock: items.filter((item) => item.totalAssigned > 0).length,
        totalAssigned: allMetrics.reduce((total, item) => total + item.totalAssigned, 0),
        unsold: allMetrics.reduce((total, item) => total + item.unsold, 0),
        soldAwaitingUse: allMetrics.reduce((total, item) => total + item.soldAwaitingUse, 0),
        redeemed: allMetrics.reduce((total, item) => total + item.redeemed, 0),
        expired: allMetrics.reduce((total, item) => total + item.expired, 0),
        voided: allMetrics.reduce((total, item) => total + item.voided, 0),
        unsoldValueUgx: allMetrics.reduce((total, item) => total + item.unsoldValueUgx, 0),
        recordedSales: allMetrics.reduce((total, item) => total + item.recordedSales, 0),
        recordedSalesUgx: allMetrics.reduce((total, item) => total + item.recordedSalesUgx, 0),
        recordedFeesUgx: allMetrics.reduce((total, item) => total + item.recordedFeesUgx, 0),
        recordedNetUgx: allMetrics.reduce((total, item) => total + item.recordedNetUgx, 0),
        mainAssigned: main.totalAssigned,
        mainSales: main.recordedSales,
        mainSalesUgx: main.recordedSalesUgx,
        agentSalesUgx: items.reduce((total, item) => total + item.recordedSalesUgx, 0),
      },
      main: includeMain
        ? {
            ownerType: 'MAIN' as const,
            code: 'MAIN',
            name: 'Main / Owner Sales',
            territory: 'Owner Direct',
            ...main,
          }
        : null,
      items,
    }
  }

  async exportCsv(tenantId?: string, filters: AgentVoucherMetricFilters = {}) {
    const report = await this.getOverview(tenantId, { ...filters, ownerType: filters.ownerType ?? 'ALL' })
    const rows: Array<Array<string | number>> = [
      [
        'ownerType',
        'agentCode',
        'agentName',
        'territory',
        'assigned',
        'unsold',
        'redeemed',
        'expired',
        'voided',
        'assignedValueUgx',
        'unsoldValueUgx',
        'salesCount',
        'grossSalesUgx',
        'feesUgx',
        'netUgx',
      ],
    ]

    if (report.main) {
      rows.push([
        'MAIN',
        report.main.code,
        report.main.name,
        report.main.territory,
        report.main.totalAssigned,
        report.main.unsold,
        report.main.redeemed,
        report.main.expired,
        report.main.voided,
        report.main.assignedValueUgx,
        report.main.unsoldValueUgx,
        report.main.recordedSales,
        report.main.recordedSalesUgx,
        report.main.recordedFeesUgx,
        report.main.recordedNetUgx,
      ])
    }

    for (const item of report.items) {
      rows.push([
        'AGENT',
        item.agent.code,
        item.agent.name,
        item.agent.territory ?? '',
        item.totalAssigned,
        item.unsold,
        item.redeemed,
        item.expired,
        item.voided,
        item.assignedValueUgx,
        item.unsoldValueUgx,
        item.recordedSales,
        item.recordedSalesUgx,
        item.recordedFeesUgx,
        item.recordedNetUgx,
      ])
    }

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return {
      filename: `agent-voucher-accountability-${Date.now()}.csv`,
      contentType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    }
  }

  private emptyMetric(): VoucherMetric {
    return {
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
  }

  private batchStatusKey(batchId: string, status: VoucherStatus) {
    return `${batchId}:${status}`
  }

  private accumulateVoucherGroup(
    metric: VoucherMetric,
    status: VoucherStatus,
    count: number,
    valueUgx: number,
    expiredByDateCount: number,
    expiredByDateValueUgx: number,
  ) {
    metric.totalAssigned += count
    metric.assignedValueUgx += valueUgx

    if (status === VoucherStatus.EXPIRED) {
      metric.expired += count
      return
    }

    const activeCount = Math.max(0, count - expiredByDateCount)
    const activeValueUgx = Math.max(0, valueUgx - expiredByDateValueUgx)
    metric.expired += expiredByDateCount

    if (status === VoucherStatus.GENERATED) {
      metric.generated += activeCount
      metric.unsold += activeCount
      metric.unsoldValueUgx += activeValueUgx
    } else if (status === VoucherStatus.PRINTED) {
      metric.printed += activeCount
      metric.unsold += activeCount
      metric.unsoldValueUgx += activeValueUgx
    } else if (status === VoucherStatus.SOLD) {
      // Kept only for historical batches. New vouchers move directly from
      // generated/printed to redeemed because redemption is the sale event.
      metric.soldAwaitingUse += activeCount
    } else if (status === VoucherStatus.REDEEMED) {
      metric.redeemed += count
    } else if (status === VoucherStatus.VOID || status === VoucherStatus.VOIDED) {
      metric.voided += count
    }
  }

  private accumulateSale(
    metric: VoucherMetric,
    sale: {
      grossAmountUgx: number
      feeAmountUgx: number
      netAmountUgx: number
    },
  ) {
    metric.recordedSales += 1
    metric.recordedSalesUgx += sale.grossAmountUgx
    metric.recordedFeesUgx += sale.feeAmountUgx
    metric.recordedNetUgx += sale.netAmountUgx
  }

  private buildDateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    const filter: Prisma.DateTimeFilter = {}
    const parsedFrom = from ? new Date(from) : null
    const parsedTo = to ? new Date(to) : null

    if (parsedFrom && Number.isFinite(parsedFrom.getTime())) {
      filter.gte = parsedFrom
    }
    if (parsedTo && Number.isFinite(parsedTo.getTime())) {
      parsedTo.setHours(23, 59, 59, 999)
      filter.lte = parsedTo
    }

    return Object.keys(filter).length > 0 ? filter : undefined
  }
}
