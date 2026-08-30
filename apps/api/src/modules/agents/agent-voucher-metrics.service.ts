import { Injectable } from '@nestjs/common'
import { Prisma, VoucherStatus } from '@prisma/client'
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

type VoucherAggregateRow = {
  batchId: string
  status: VoucherStatus
  count: bigint
  valueUgx: bigint
  expiredByDateCount: bigint
  expiredByDateValueUgx: bigint
}

type AgentSaleAggregateRow = {
  assignedAgentId: string | null
  recordedSales: bigint
  recordedSalesUgx: bigint
  recordedFeesUgx: bigint
  recordedNetUgx: bigint
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

    const [agents, batches, voucherGroups, sales] = await Promise.all([
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
        },
      }),
      // The accountability view used to scan/group the same voucher population
      // twice: once for status totals and again for date-expired stock. Fold
      // both into one grouped query so PostgreSQL only walks the matching
      // voucher/batch set once while preserving the same expiry semantics.
      this.prisma.$queryRaw<VoucherAggregateRow[]>(Prisma.sql`
        SELECT
          vouchers."batchId" AS "batchId",
          vouchers.status AS status,
          COUNT(*)::bigint AS count,
          COALESCE(SUM(vouchers."faceValueUgx"), 0)::bigint AS "valueUgx",
          (COUNT(*) FILTER (
            WHERE vouchers."expiresAt" <= ${now}
              AND vouchers.status NOT IN ('EXPIRED', 'REDEEMED', 'VOID', 'VOIDED')
          ))::bigint AS "expiredByDateCount",
          COALESCE(SUM(vouchers."faceValueUgx") FILTER (
            WHERE vouchers."expiresAt" <= ${now}
              AND vouchers.status NOT IN ('EXPIRED', 'REDEEMED', 'VOID', 'VOIDED')
          ), 0)::bigint AS "expiredByDateValueUgx"
        FROM "Voucher" AS vouchers
        INNER JOIN "VoucherBatch" AS batches
          ON batches.id = vouchers."batchId"
        WHERE 1 = 1
          ${tenantId ? Prisma.sql`AND batches."tenantId" = ${tenantId}` : Prisma.empty}
          ${filters.packageId ? Prisma.sql`AND batches."packageId" = ${filters.packageId}` : Prisma.empty}
          ${filters.batchId ? Prisma.sql`AND batches.id = ${filters.batchId}` : Prisma.empty}
          ${ownerType === 'AGENT'
            ? filters.agentId
              ? Prisma.sql`AND batches."agentId" = ${filters.agentId}`
              : Prisma.sql`AND batches."agentId" IS NOT NULL`
            : ownerType === 'MAIN'
              ? Prisma.sql`AND batches."agentId" IS NULL`
              : filters.agentId
                ? Prisma.sql`AND batches."agentId" = ${filters.agentId}`
                : Prisma.empty}
          ${filters.territory
            ? Prisma.sql`AND EXISTS (
                SELECT 1
                FROM "Agent" AS batch_agents
                WHERE batch_agents.id = batches."agentId"
                  AND batch_agents.territory ILIKE ${`%${filters.territory}%`}
              )`
            : Prisma.empty}
        GROUP BY vouchers."batchId", vouchers.status
      `),
      // Voucher accountability used to materialize every matching completed
      // transaction (plus nested voucher/batch/Agent rows) and reduce it in
      // Node. Preserve the attribution rule -- batch Agent first, transaction
      // Agent second -- but let PostgreSQL return one compact row per owner.
      this.prisma.$queryRaw<AgentSaleAggregateRow[]>(Prisma.sql`
        SELECT
          COALESCE(batches."agentId", transactions."agentId") AS "assignedAgentId",
          COUNT(*)::bigint AS "recordedSales",
          COALESCE(SUM(transactions."grossAmountUgx"), 0)::bigint AS "recordedSalesUgx",
          COALESCE(SUM(transactions."feeAmountUgx"), 0)::bigint AS "recordedFeesUgx",
          COALESCE(SUM(transactions."netAmountUgx"), 0)::bigint AS "recordedNetUgx"
        FROM "BillingTransaction" AS transactions
        LEFT JOIN "Voucher" AS vouchers
          ON vouchers.id = transactions."voucherId"
        LEFT JOIN "VoucherBatch" AS batches
          ON batches.id = vouchers."batchId"
        LEFT JOIN "Agent" AS batch_agents
          ON batch_agents.id = batches."agentId"
        WHERE transactions.type IN ('VOUCHER_SALE', 'VOUCHER_REDEMPTION')
          AND transactions.status = 'COMPLETED'
          AND transactions."grossAmountUgx" > 0
          ${tenantId ? Prisma.sql`AND transactions."tenantId" = ${tenantId}` : Prisma.empty}
          ${salesDate?.gte ? Prisma.sql`AND transactions."createdAt" >= ${salesDate.gte}` : Prisma.empty}
          ${salesDate?.lte ? Prisma.sql`AND transactions."createdAt" <= ${salesDate.lte}` : Prisma.empty}
          ${filters.packageId ? Prisma.sql`AND transactions."packageId" = ${filters.packageId}` : Prisma.empty}
          ${filters.batchId ? Prisma.sql`AND vouchers."batchId" = ${filters.batchId}` : Prisma.empty}
          ${filters.agentId
            ? Prisma.sql`AND (transactions."agentId" = ${filters.agentId} OR batches."agentId" = ${filters.agentId})`
            : Prisma.empty}
          ${filters.territory
            ? Prisma.sql`AND batch_agents.territory ILIKE ${`%${filters.territory}%`}`
            : Prisma.empty}
        GROUP BY COALESCE(batches."agentId", transactions."agentId")
      `),
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
      const target = batch.agentId
        ? metrics.get(batch.agentId) ?? null
        : includeMain
          ? main
          : null
      if (target) {
        metricByBatch.set(batch.id, target)
      }
    }

    for (const group of voucherGroups) {
      const target = metricByBatch.get(group.batchId)
      if (!target) continue

      this.accumulateVoucherGroup(
        target,
        group.status,
        Number(group.count),
        Number(group.valueUgx),
        Number(group.expiredByDateCount),
        Number(group.expiredByDateValueUgx),
      )
    }

    for (const sale of sales) {
      if (sale.assignedAgentId) {
        const metric = metrics.get(sale.assignedAgentId)
        if (!metric || !includeAgents) continue
        this.accumulateSaleAggregate(metric, sale)
      } else if (includeMain) {
        this.accumulateSaleAggregate(main, sale)
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

    const summaryTotals = this.emptyMetric()
    let agentsWithStock = 0
    let agentSalesUgx = 0
    for (const item of items) {
      if (item.totalAssigned > 0) agentsWithStock += 1
      agentSalesUgx += item.recordedSalesUgx
    }
    for (const item of allMetrics) {
      summaryTotals.totalAssigned += item.totalAssigned
      summaryTotals.unsold += item.unsold
      summaryTotals.soldAwaitingUse += item.soldAwaitingUse
      summaryTotals.redeemed += item.redeemed
      summaryTotals.expired += item.expired
      summaryTotals.voided += item.voided
      summaryTotals.unsoldValueUgx += item.unsoldValueUgx
      summaryTotals.recordedSales += item.recordedSales
      summaryTotals.recordedSalesUgx += item.recordedSalesUgx
      summaryTotals.recordedFeesUgx += item.recordedFeesUgx
      summaryTotals.recordedNetUgx += item.recordedNetUgx
    }

    return {
      filters: {
        ...filters,
        ownerType,
      },
      summary: {
        totalAgentsTracked: items.length,
        agentsWithStock,
        totalAssigned: summaryTotals.totalAssigned,
        unsold: summaryTotals.unsold,
        soldAwaitingUse: summaryTotals.soldAwaitingUse,
        redeemed: summaryTotals.redeemed,
        expired: summaryTotals.expired,
        voided: summaryTotals.voided,
        unsoldValueUgx: summaryTotals.unsoldValueUgx,
        recordedSales: summaryTotals.recordedSales,
        recordedSalesUgx: summaryTotals.recordedSalesUgx,
        recordedFeesUgx: summaryTotals.recordedFeesUgx,
        recordedNetUgx: summaryTotals.recordedNetUgx,
        mainAssigned: main.totalAssigned,
        mainSales: main.recordedSales,
        mainSalesUgx: main.recordedSalesUgx,
        agentSalesUgx,
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

  private accumulateSaleAggregate(metric: VoucherMetric, sale: AgentSaleAggregateRow) {
    metric.recordedSales += Number(sale.recordedSales)
    metric.recordedSalesUgx += Number(sale.recordedSalesUgx)
    metric.recordedFeesUgx += Number(sale.recordedFeesUgx)
    metric.recordedNetUgx += Number(sale.recordedNetUgx)
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
