import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  AgentStatus,
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  Prisma,
  VoucherStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'

const POLICY_MARKER = '[[AROFI_AGENT_SALES_POLICY]]'
const CASH_SETTLEMENT_MARKER = 'AGENT_CASH_REMITTANCE'

type AgentSalesPolicy = {
  cashEnabled: boolean
  mobileMoneyEnabled: boolean
  allowedPackageIds: string[]
}

type JsonRecord = Record<string, unknown>

type AgentDashboardFinancialRollup = {
  todaySalesUgx: bigint
  todayCommissionUgx: bigint
  totalCommissionUgx: bigint
  cashSalesUgx: bigint
  cashCommissionUgx: bigint
  cashSettledUgx: bigint
}

/**
 * Read-only Agent dashboard queries.
 *
 * Keep this separate from AgentSalesService so loading the dashboard never has
 * to materialize an Agent's complete commission history or voucher stock. The
 * database performs the sums/counts and only the 20 rows needed by the UI are
 * returned to Node.
 */
@Injectable()
export class AgentDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyDashboard(email: string, tenantId: string) {
    const normalizedEmail = email.trim()
    const agentSelect = {
      id: true,
      code: true,
      name: true,
      email: true,
      phoneNumber: true,
      status: true,
      commissionRateBps: true,
      floatLimitUgx: true,
      notes: true,
    } satisfies Prisma.AgentSelect

    // Agent logins are normally stored with the exact authenticated email. Use
    // that index-friendly predicate first and only pay for a case-insensitive
    // scan when supporting a legacy profile whose email casing differs.
    const agent =
      (await this.prisma.agent.findFirst({
        where: {
          tenantId,
          email: normalizedEmail,
        },
        select: agentSelect,
      })) ??
      (await this.prisma.agent.findFirst({
        where: {
          tenantId,
          email: { equals: normalizedEmail, mode: 'insensitive' },
        },
        select: agentSelect,
      }))

    if (!agent) {
      throw new ForbiddenException('Your login is not linked to an agent profile.')
    }
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new ForbiddenException('Your Agent account is not active.')
    }

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const completedSalesWhere: Prisma.BillingTransactionWhereInput = {
      tenantId,
      agentId: agent.id,
      status: BillingTransactionStatus.COMPLETED,
      type: { in: [BillingTransactionType.VOUCHER_SALE, BillingTransactionType.MOBILE_MONEY_SALE] },
    }

    // These six values used to require six independent aggregate queries.
    // Keep the calculations in PostgreSQL, but fetch them in one round-trip so
    // an Agent dashboard refresh does not fan out repeatedly across the same
    // commission/sales/settlement tables.
    const [recentTransactions, financialRollups, availableOfflineVouchers] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where: completedSalesWhere,
        select: {
          id: true,
          grossAmountUgx: true,
          customerReference: true,
          channel: true,
          metadata: true,
          createdAt: true,
          package: { select: { name: true } },
          voucher: { select: { code: true } },
          sourceCommission: { select: { amountUgx: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.$queryRaw<AgentDashboardFinancialRollup[]>(Prisma.sql`
        SELECT
          COALESCE((
            SELECT SUM(bt."grossAmountUgx")
            FROM "BillingTransaction" bt
            WHERE bt."tenantId" = ${tenantId}
              AND bt."agentId" = ${agent.id}
              AND bt.status = 'COMPLETED'
              AND bt.type IN ('VOUCHER_SALE', 'MOBILE_MONEY_SALE')
              AND bt."createdAt" >= ${startOfToday}
          ), 0)::bigint AS "todaySalesUgx",
          COALESCE((
            SELECT SUM(ac."amountUgx")
            FROM "AgentCommission" ac
            WHERE ac."tenantId" = ${tenantId}
              AND ac."agentId" = ${agent.id}
              AND ac.status <> 'REVERSED'
              AND ac."createdAt" >= ${startOfToday}
          ), 0)::bigint AS "todayCommissionUgx",
          COALESCE((
            SELECT SUM(ac."amountUgx")
            FROM "AgentCommission" ac
            WHERE ac."tenantId" = ${tenantId}
              AND ac."agentId" = ${agent.id}
              AND ac.status <> 'REVERSED'
          ), 0)::bigint AS "totalCommissionUgx",
          COALESCE((
            SELECT SUM(bt."grossAmountUgx")
            FROM "BillingTransaction" bt
            WHERE bt."tenantId" = ${tenantId}
              AND bt."agentId" = ${agent.id}
              AND bt.type = 'VOUCHER_SALE'
              AND bt.status = 'COMPLETED'
          ), 0)::bigint AS "cashSalesUgx",
          COALESCE((
            SELECT SUM(ac."amountUgx")
            FROM "AgentCommission" ac
            INNER JOIN "BillingTransaction" bt ON bt.id = ac."sourceTransactionId"
            WHERE ac."tenantId" = ${tenantId}
              AND ac."agentId" = ${agent.id}
              AND ac.status <> 'REVERSED'
              AND bt."tenantId" = ${tenantId}
              AND bt."agentId" = ${agent.id}
              AND bt.type = 'VOUCHER_SALE'
              AND bt.status = 'COMPLETED'
          ), 0)::bigint AS "cashCommissionUgx",
          COALESCE((
            SELECT SUM(s."payableAmountUgx")
            FROM "Settlement" s
            WHERE s."tenantId" = ${tenantId}
              AND s."agentId" = ${agent.id}
              AND s.status = 'COMPLETED'
              AND s.notes LIKE ${`${CASH_SETTLEMENT_MARKER}%`}
          ), 0)::bigint AS "cashSettledUgx"
      `),
      this.prisma.voucher.count({
        where: {
          tenantId,
          status: { in: [VoucherStatus.GENERATED, VoucherStatus.PRINTED] },
          batch: { agentId: agent.id },
        },
      }),
    ])

    const financial = financialRollups[0] ?? {
      todaySalesUgx: BigInt(0),
      todayCommissionUgx: BigInt(0),
      totalCommissionUgx: BigInt(0),
      cashSalesUgx: BigInt(0),
      cashCommissionUgx: BigInt(0),
      cashSettledUgx: BigInt(0),
    }
    const todaySalesUgx = Number(financial.todaySalesUgx)
    const todayCommissionUgx = Number(financial.todayCommissionUgx)
    const totalCommissionUgx = Number(financial.totalCommissionUgx)
    const cashSalesUgx = Number(financial.cashSalesUgx)
    const cashCommissionUgx = Number(financial.cashCommissionUgx)
    const cashSettledUgx = Number(financial.cashSettledUgx)
    const cashObligationUgx = Math.max(0, cashSalesUgx - cashCommissionUgx)
    const cashOutstandingUgx = Math.max(0, cashObligationUgx - cashSettledUgx)

    return {
      agent: {
        id: agent.id,
        code: agent.code,
        name: agent.name,
        email: agent.email,
        phoneNumber: agent.phoneNumber,
        status: agent.status,
        commissionRateBps: agent.commissionRateBps,
        cashLimitUgx: agent.floatLimitUgx,
        policy: this.readPolicy(agent.notes),
      },
      summary: {
        todaySalesUgx,
        todayCommissionUgx,
        totalCommissionUgx,
        cashToRemitUgx: cashOutstandingUgx,
        cashRemainingBeforeLimitUgx:
          agent.floatLimitUgx > 0 ? Math.max(0, agent.floatLimitUgx - cashOutstandingUgx) : null,
        availableOfflineVouchers,
      },
      recentSales: recentTransactions.map((item) => ({
        id: item.id,
        amountUgx: item.grossAmountUgx,
        customerReference: item.customerReference,
        packageName: item.package?.name ?? 'Internet package',
        voucherCode: item.voucher?.code ?? null,
        paymentMethod: item.channel === BillingChannel.MOBILE_MONEY ? 'MOBILE_MONEY' : 'CASH',
        fulfillment: this.readMetadataString(item.metadata, 'fulfillment') ?? (item.voucher ? 'VOUCHER_LATER' : 'ACTIVATE_NOW'),
        commissionUgx: item.sourceCommission?.amountUgx ?? 0,
        createdAt: item.createdAt,
      })),
    }
  }

  private readPolicy(notes?: string | null): AgentSalesPolicy {
    const defaultPolicy: AgentSalesPolicy = {
      cashEnabled: true,
      mobileMoneyEnabled: true,
      allowedPackageIds: [],
    }
    if (!notes) return defaultPolicy

    const index = notes.lastIndexOf(POLICY_MARKER)
    if (index < 0) return defaultPolicy

    try {
      const parsed = JSON.parse(notes.slice(index + POLICY_MARKER.length).trim()) as Partial<AgentSalesPolicy>
      return {
        cashEnabled: parsed.cashEnabled !== false,
        mobileMoneyEnabled: parsed.mobileMoneyEnabled !== false,
        allowedPackageIds: Array.isArray(parsed.allowedPackageIds)
          ? parsed.allowedPackageIds.filter((item): item is string => typeof item === 'string')
          : [],
      }
    } catch {
      return defaultPolicy
    }
  }

  private readMetadataString(metadata: Prisma.JsonValue | null, key: string) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined
    const value = (metadata as JsonRecord)[key]
    return typeof value === 'string' ? value : undefined
  }
}
