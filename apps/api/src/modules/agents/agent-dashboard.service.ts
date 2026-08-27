import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  CommissionStatus,
  Prisma,
  SettlementStatus,
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
    const agent = await this.prisma.agent.findFirst({
      where: {
        tenantId,
        email: { equals: normalizedEmail, mode: 'insensitive' },
      },
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        phoneNumber: true,
        status: true,
        commissionRateBps: true,
        floatLimitUgx: true,
        notes: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    if (!agent) {
      throw new ForbiddenException('Your login is not linked to an agent profile.')
    }

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const completedSalesWhere: Prisma.BillingTransactionWhereInput = {
      tenantId,
      agentId: agent.id,
      status: BillingTransactionStatus.COMPLETED,
      type: { in: [BillingTransactionType.VOUCHER_SALE, BillingTransactionType.MOBILE_MONEY_SALE] },
    }

    const commissionWhere: Prisma.AgentCommissionWhereInput = {
      tenantId,
      agentId: agent.id,
      status: { not: CommissionStatus.REVERSED },
    }

    const [
      recentTransactions,
      todaySales,
      todayCommissions,
      totalCommissions,
      availableOfflineVouchers,
      cashSales,
      cashSaleCommissions,
      completedCashSettlements,
    ] = await Promise.all([
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
      this.prisma.billingTransaction.aggregate({
        where: { ...completedSalesWhere, createdAt: { gte: startOfToday } },
        _sum: { grossAmountUgx: true },
      }),
      this.prisma.agentCommission.aggregate({
        where: { ...commissionWhere, createdAt: { gte: startOfToday } },
        _sum: { amountUgx: true },
      }),
      this.prisma.agentCommission.aggregate({
        where: commissionWhere,
        _sum: { amountUgx: true },
      }),
      this.prisma.voucher.count({
        where: {
          tenantId,
          status: { in: [VoucherStatus.GENERATED, VoucherStatus.PRINTED] },
          batch: { agentId: agent.id },
        },
      }),
      this.prisma.billingTransaction.aggregate({
        where: {
          tenantId,
          agentId: agent.id,
          type: BillingTransactionType.VOUCHER_SALE,
          status: BillingTransactionStatus.COMPLETED,
        },
        _sum: { grossAmountUgx: true },
      }),
      this.prisma.agentCommission.aggregate({
        where: {
          tenantId,
          agentId: agent.id,
          status: { not: CommissionStatus.REVERSED },
          sourceTransaction: {
            tenantId,
            agentId: agent.id,
            type: BillingTransactionType.VOUCHER_SALE,
            status: BillingTransactionStatus.COMPLETED,
          },
        },
        _sum: { amountUgx: true },
      }),
      this.prisma.settlement.aggregate({
        where: {
          tenantId,
          agentId: agent.id,
          status: SettlementStatus.COMPLETED,
          notes: { startsWith: CASH_SETTLEMENT_MARKER },
        },
        _sum: { payableAmountUgx: true },
      }),
    ])

    const cashObligationUgx = Math.max(
      0,
      (cashSales._sum.grossAmountUgx ?? 0) - (cashSaleCommissions._sum.amountUgx ?? 0),
    )
    const cashOutstandingUgx = Math.max(
      0,
      cashObligationUgx - (completedCashSettlements._sum.payableAmountUgx ?? 0),
    )

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
        todaySalesUgx: todaySales._sum.grossAmountUgx ?? 0,
        todayCommissionUgx: todayCommissions._sum.amountUgx ?? 0,
        totalCommissionUgx: totalCommissions._sum.amountUgx ?? 0,
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
