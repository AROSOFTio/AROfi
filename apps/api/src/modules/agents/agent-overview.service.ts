import { Injectable } from '@nestjs/common'
import { AgentStatus, Prisma } from '@prisma/client'
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

type AgentFinancialAggregateRow = {
  agentId: string
  totalSalesUgx: bigint
  cashSalesUgx: bigint
  mobileMoneySalesUgx: bigint
  totalCommissionUgx: bigint
  cashCommissionUgx: bigint
  cashSettledUgx: bigint
}

type AgentLoginGroup = {
  tenantId: string
  emails: string[]
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
    const now = new Date()
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

    const loginEmailsByTenant = new Map<string, Set<string>>()
    for (const agent of agents) {
      const email = agent.email?.trim().toLowerCase()
      if (!email) continue
      const emails = loginEmailsByTenant.get(agent.tenantId) ?? new Set<string>()
      emails.add(email)
      loginEmailsByTenant.set(agent.tenantId, emails)
    }
    const loginGroups = Array.from(loginEmailsByTenant, ([groupTenantId, emails]) => ({
      tenantId: groupTenantId,
      emails: Array.from(emails),
    }))

    const [financialsByAgent, voucherStockByAgent, loginUsers] = await Promise.all([
      // Sales, commission totals, cash-only commission and completed cash
      // remittances all cover the same Agent set. Fold them into one compact
      // PostgreSQL result so an overview refresh does not issue a separate
      // sales groupBy round-trip and then merge another aggregate result in Node.
      this.prisma.$queryRaw<AgentFinancialAggregateRow[]>(Prisma.sql`
        SELECT
          financial."agentId" AS "agentId",
          SUM(financial."totalSalesUgx")::bigint AS "totalSalesUgx",
          SUM(financial."cashSalesUgx")::bigint AS "cashSalesUgx",
          SUM(financial."mobileMoneySalesUgx")::bigint AS "mobileMoneySalesUgx",
          SUM(financial."totalCommissionUgx")::bigint AS "totalCommissionUgx",
          SUM(financial."cashCommissionUgx")::bigint AS "cashCommissionUgx",
          SUM(financial."cashSettledUgx")::bigint AS "cashSettledUgx"
        FROM (
          SELECT
            transactions."agentId" AS "agentId",
            COALESCE(SUM(transactions."grossAmountUgx"), 0)::bigint AS "totalSalesUgx",
            COALESCE(SUM(transactions."grossAmountUgx") FILTER (
              WHERE transactions.channel = 'VOUCHER'
            ), 0)::bigint AS "cashSalesUgx",
            COALESCE(SUM(transactions."grossAmountUgx") FILTER (
              WHERE transactions.channel = 'MOBILE_MONEY'
            ), 0)::bigint AS "mobileMoneySalesUgx",
            0::bigint AS "totalCommissionUgx",
            0::bigint AS "cashCommissionUgx",
            0::bigint AS "cashSettledUgx"
          FROM "BillingTransaction" AS transactions
          WHERE transactions."agentId" IN (${Prisma.join(ids)})
            AND transactions.status = 'COMPLETED'
            AND transactions.type IN ('VOUCHER_SALE', 'MOBILE_MONEY_SALE')
            ${tenantId ? Prisma.sql`AND transactions."tenantId" = ${tenantId}` : Prisma.empty}
          GROUP BY transactions."agentId"

          UNION ALL

          SELECT
            commissions."agentId" AS "agentId",
            0::bigint AS "totalSalesUgx",
            0::bigint AS "cashSalesUgx",
            0::bigint AS "mobileMoneySalesUgx",
            COALESCE(SUM(commissions."amountUgx"), 0)::bigint AS "totalCommissionUgx",
            COALESCE(SUM(
              CASE
                WHEN transactions.type = 'VOUCHER_SALE' AND transactions.status = 'COMPLETED'
                  THEN commissions."amountUgx"
                ELSE 0
              END
            ), 0)::bigint AS "cashCommissionUgx",
            0::bigint AS "cashSettledUgx"
          FROM "AgentCommission" AS commissions
          INNER JOIN "BillingTransaction" AS transactions
            ON transactions.id = commissions."sourceTransactionId"
          WHERE commissions."agentId" IN (${Prisma.join(ids)})
            AND commissions.status <> 'REVERSED'
            ${tenantId
              ? Prisma.sql`AND commissions."tenantId" = ${tenantId} AND transactions."tenantId" = ${tenantId}`
              : Prisma.empty}
          GROUP BY commissions."agentId"

          UNION ALL

          SELECT
            settlements."agentId" AS "agentId",
            0::bigint AS "totalSalesUgx",
            0::bigint AS "cashSalesUgx",
            0::bigint AS "mobileMoneySalesUgx",
            0::bigint AS "totalCommissionUgx",
            0::bigint AS "cashCommissionUgx",
            COALESCE(SUM(settlements."payableAmountUgx"), 0)::bigint AS "cashSettledUgx"
          FROM "Settlement" AS settlements
          WHERE settlements."agentId" IN (${Prisma.join(ids)})
            AND settlements.status = 'COMPLETED'
            AND settlements.notes LIKE ${`${CASH_SETTLEMENT_MARKER}%`}
            ${tenantId ? Prisma.sql`AND settlements."tenantId" = ${tenantId}` : Prisma.empty}
          GROUP BY settlements."agentId"
        ) AS financial
        GROUP BY financial."agentId"
      `),
      this.prisma.$queryRaw<AgentVoucherStockRow[]>(Prisma.sql`
        SELECT
          batches."agentId" AS "agentId",
          COUNT(vouchers.id)::bigint AS "availableCount"
        FROM "VoucherBatch" AS batches
        INNER JOIN "Voucher" AS vouchers ON vouchers."batchId" = batches.id
        WHERE batches."agentId" IN (${Prisma.join(ids)})
          ${tenantId
            ? Prisma.sql`AND batches."tenantId" = ${tenantId} AND vouchers."tenantId" = ${tenantId}`
            : Prisma.empty}
          AND vouchers.status IN ('GENERATED', 'PRINTED')
          AND (vouchers."expiresAt" IS NULL OR vouchers."expiresAt" > ${now})
        GROUP BY batches."agentId"
      `),
      this.findLoginUsers(loginGroups),
    ])

    const saleTotals = new Map<string, { total: number; cash: number; mobileMoney: number }>()
    const commissionTotals = new Map<string, number>()
    const cashCommissionTotals = new Map<string, number>()
    const settlementTotals = new Map<string, number>()
    for (const row of financialsByAgent) {
      saleTotals.set(row.agentId, {
        total: Number(row.totalSalesUgx),
        cash: Number(row.cashSalesUgx),
        mobileMoney: Number(row.mobileMoneySalesUgx),
      })
      commissionTotals.set(row.agentId, Number(row.totalCommissionUgx))
      cashCommissionTotals.set(row.agentId, Number(row.cashCommissionUgx))
      settlementTotals.set(row.agentId, Number(row.cashSettledUgx))
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

  private async findLoginUsers(loginGroups: AgentLoginGroup[]) {
    if (loginGroups.length === 0) return []

    const select = { tenantId: true, email: true } as const
    const baseWhere = {
      isActive: true,
      role: { name: 'VoucherAgent' },
    } satisfies Prisma.UserWhereInput

    // Normal Agent accounts are provisioned with the exact profile email. Keep
    // the common path index-friendly and only use case-insensitive matching for
    // legacy rows whose stored casing differs from the Agent profile.
    const exactUsers = await this.prisma.user.findMany({
      where: {
        ...baseWhere,
        OR: loginGroups.map((group) => ({
          tenantId: group.tenantId,
          email: { in: group.emails },
        })),
      },
      select,
    })

    const exactKeys = new Set(
      exactUsers
        .filter((user) => user.tenantId)
        .map((user) => `${user.tenantId}:${user.email.trim().toLowerCase()}`),
    )
    const legacyGroups = loginGroups
      .map((group) => ({
        tenantId: group.tenantId,
        emails: group.emails.filter(
          (email) => !exactKeys.has(`${group.tenantId}:${email.trim().toLowerCase()}`),
        ),
      }))
      .filter((group) => group.emails.length > 0)

    if (legacyGroups.length === 0) return exactUsers

    const legacyUsers = await this.prisma.user.findMany({
      where: {
        ...baseWhere,
        OR: legacyGroups.map((group) => ({
          tenantId: group.tenantId,
          email: { in: group.emails, mode: 'insensitive' as const },
        })),
      },
      select,
    })

    return [...exactUsers, ...legacyUsers]
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
