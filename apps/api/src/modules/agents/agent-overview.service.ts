import { Injectable } from '@nestjs/common'
import {
  AgentStatus,
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  CommissionStatus,
  Prisma,
  SettlementStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'

const POLICY_MARKER = '[[AROFI_AGENT_SALES_POLICY]]'
const CASH_SETTLEMENT_MARKER = 'AGENT_CASH_REMITTANCE'

type AgentSalesPolicy = {
  cashEnabled: boolean
  mobileMoneyEnabled: boolean
  allowedPackageIds: string[]
}

type AgentVoucherStockRow = {
  agentId: string
  availableCount: bigint
}

/**
 * Read-only management overview for Agents.
 *
 * The previous implementation loaded every completed Agent sale, commission,
 * settlement and every voucher row for as many as 500 Agents, then repeatedly
 * filtered those arrays once per Agent. This service keeps the response shape
 * but lets PostgreSQL group/sum the large tables and only materializes Agent
 * rows and small aggregate result sets in Node.
 */
@Injectable()
export class AgentOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId?: string) {
    const agents = await this.prisma.agent.findMany({
      where: tenantId ? { tenantId } : undefined,
      select: {
        id: true,
        tenantId: true,
        code: true,
        name: true,
        phoneNumber: true,
        email: true,
        type: true,
        status: true,
        territory: true,
        commissionRateBps: true,
        floatLimitUgx: true,
        notes: true,
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const ids = agents.map((agent) => agent.id)
    if (ids.length === 0) {
      return {
        summary: {
          activeAgents: 0,
          totalSalesUgx: 0,
          totalCommissionUgx: 0,
          cashToCollectUgx: 0,
          mobileMoneySalesUgx: 0,
        },
        agents: [],
      }
    }

    const agentEmails = agents
      .map((agent) => agent.email?.trim())
      .filter((email): email is string => Boolean(email))
    const tenantIds = Array.from(new Set(agents.map((agent) => agent.tenantId)))

    const completedSalesWhere = {
      agentId: { in: ids },
      status: BillingTransactionStatus.COMPLETED,
      type: { in: [BillingTransactionType.VOUCHER_SALE, BillingTransactionType.MOBILE_MONEY_SALE] },
    }

    const [
      salesByChannel,
      commissionsByAgent,
      cashCommissionsByAgent,
      settlementsByAgent,
      voucherStockByAgent,
      loginUsers,
    ] = await Promise.all([
      this.prisma.billingTransaction.groupBy({
        by: ['agentId', 'channel'],
        where: completedSalesWhere,
        _sum: { grossAmountUgx: true },
      }),
      this.prisma.agentCommission.groupBy({
        by: ['agentId'],
        where: {
          agentId: { in: ids },
          status: { not: CommissionStatus.REVERSED },
        },
        _sum: { amountUgx: true },
      }),
      this.prisma.agentCommission.groupBy({
        by: ['agentId'],
        where: {
          agentId: { in: ids },
          status: { not: CommissionStatus.REVERSED },
          sourceTransaction: {
            status: BillingTransactionStatus.COMPLETED,
            type: BillingTransactionType.VOUCHER_SALE,
          },
        },
        _sum: { amountUgx: true },
      }),
      this.prisma.settlement.groupBy({
        by: ['agentId'],
        where: {
          agentId: { in: ids },
          status: SettlementStatus.COMPLETED,
          notes: { startsWith: CASH_SETTLEMENT_MARKER },
        },
        _sum: { payableAmountUgx: true },
      }),
      this.prisma.$queryRaw<AgentVoucherStockRow[]>(Prisma.sql`
        SELECT
          batches."agentId" AS "agentId",
          COUNT(vouchers.id)::bigint AS "availableCount"
        FROM "VoucherBatch" AS batches
        INNER JOIN "Voucher" AS vouchers ON vouchers."batchId" = batches.id
        WHERE batches."agentId" IN (${Prisma.join(ids)})
          AND vouchers.status IN ('GENERATED', 'PRINTED')
        GROUP BY batches."agentId"
      `),
      agentEmails.length
        ? this.prisma.user.findMany({
            where: {
              isActive: true,
              tenantId: { in: tenantIds },
              email: { in: agentEmails, mode: 'insensitive' },
              role: { name: 'VoucherAgent' },
            },
            select: { tenantId: true, email: true },
          })
        : Promise.resolve([]),
    ])

    const saleTotals = new Map<string, { total: number; cash: number; mobileMoney: number }>()
    for (const row of salesByChannel) {
      if (!row.agentId) continue
      const current = saleTotals.get(row.agentId) ?? { total: 0, cash: 0, mobileMoney: 0 }
      const amount = row._sum.grossAmountUgx ?? 0
      current.total += amount
      if (row.channel === BillingChannel.VOUCHER) current.cash += amount
      if (row.channel === BillingChannel.MOBILE_MONEY) current.mobileMoney += amount
      saleTotals.set(row.agentId, current)
    }

    const commissionTotals = new Map<string, number>()
    for (const row of commissionsByAgent) {
      if (row.agentId) commissionTotals.set(row.agentId, row._sum.amountUgx ?? 0)
    }

    const cashCommissionTotals = new Map<string, number>()
    for (const row of cashCommissionsByAgent) {
      if (row.agentId) cashCommissionTotals.set(row.agentId, row._sum.amountUgx ?? 0)
    }

    const settlementTotals = new Map<string, number>()
    for (const row of settlementsByAgent) {
      if (row.agentId) settlementTotals.set(row.agentId, row._sum.payableAmountUgx ?? 0)
    }

    const voucherStock = new Map<string, number>()
    for (const row of voucherStockByAgent) {
      voucherStock.set(row.agentId, Number(row.availableCount))
    }

    const loginKeys = new Set(
      loginUsers
        .filter((user) => user.tenantId)
        .map((user) => `${user.tenantId}:${user.email.trim().toLowerCase()}`),
    )

    const summary = {
      activeAgents: 0,
      totalSalesUgx: 0,
      mobileMoneySalesUgx: 0,
      totalCommissionUgx: 0,
      cashToCollectUgx: 0,
    }

    const result = agents.map((agent) => {
      const sales = saleTotals.get(agent.id) ?? { total: 0, cash: 0, mobileMoney: 0 }
      const commissionUgx = commissionTotals.get(agent.id) ?? 0
      const cashLiability = Math.max(0, sales.cash - (cashCommissionTotals.get(agent.id) ?? 0))
      const cashToCollectUgx = Math.max(0, cashLiability - (settlementTotals.get(agent.id) ?? 0))
      const parsedPolicy = this.readPolicy(agent.notes)
      const normalizedEmail = agent.email?.trim().toLowerCase()

      if (agent.status === AgentStatus.ACTIVE) summary.activeAgents += 1
      summary.totalSalesUgx += sales.total
      summary.mobileMoneySalesUgx += sales.mobileMoney
      summary.totalCommissionUgx += commissionUgx
      summary.cashToCollectUgx += cashToCollectUgx

      return {
        id: agent.id,
        code: agent.code,
        name: agent.name,
        phoneNumber: agent.phoneNumber,
        email: agent.email,
        type: agent.type,
        status: agent.status,
        territory: agent.territory,
        commissionRateBps: agent.commissionRateBps,
        cashLimitUgx: agent.floatLimitUgx,
        notes: parsedPolicy.humanNotes,
        tenant: agent.tenant,
        policy: parsedPolicy.policy,
        totalSalesUgx: sales.total,
        mobileMoneySalesUgx: sales.mobileMoney,
        cashSalesUgx: sales.cash,
        commissionUgx,
        cashToCollectUgx,
        availableVoucherStock: voucherStock.get(agent.id) ?? 0,
        loginReady: Boolean(normalizedEmail && loginKeys.has(`${agent.tenantId}:${normalizedEmail}`)),
      }
    })

    return {
      summary,
      agents: result,
    }
  }

  private readPolicy(notes?: string | null): { humanNotes: string; policy: AgentSalesPolicy } {
    const defaultPolicy: AgentSalesPolicy = {
      cashEnabled: true,
      mobileMoneyEnabled: true,
      allowedPackageIds: [],
    }
    if (!notes) return { humanNotes: '', policy: defaultPolicy }

    const index = notes.lastIndexOf(POLICY_MARKER)
    if (index < 0) return { humanNotes: notes.trim(), policy: defaultPolicy }

    const humanNotes = notes.slice(0, index).trim()
    try {
      const parsed = JSON.parse(notes.slice(index + POLICY_MARKER.length).trim()) as Partial<AgentSalesPolicy>
      return {
        humanNotes,
        policy: {
          cashEnabled: parsed.cashEnabled !== false,
          mobileMoneyEnabled: parsed.mobileMoneyEnabled !== false,
          allowedPackageIds: Array.isArray(parsed.allowedPackageIds)
            ? parsed.allowedPackageIds.filter((item): item is string => typeof item === 'string')
            : [],
        },
      }
    } catch {
      return { humanNotes, policy: defaultPolicy }
    }
  }
}
