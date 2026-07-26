import { Injectable, NotFoundException } from '@nestjs/common'
import {
  AgentStatus,
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  CommissionStatus,
  LedgerTransactionType,
  Prisma,
  WalletOwnerType,
  PaymentNetwork,
} from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { resolveEffectiveSubscriptionTier } from '../subscription/subscription-plan.util'
import { BillingPostingService } from './billing-posting.service'
import { AdjustWalletDto } from './dto/adjust-wallet.dto'
import { RecordMobileMoneySaleDto } from './dto/record-mobile-money-sale.dto'
import { FeeEngineService } from './fee-engine.service'
import { PLATFORM_SETTINGS_ID } from './billing.constants'

type RecordSaleInput = {
  tenantId: string
  packageId: string
  voucherId?: string
  agentId?: string
  channel: BillingChannel
  type: BillingTransactionType
  grossAmountUgx: number
  description: string
  customerReference?: string
  externalReference?: string
  paymentProvider?: string
  metadata?: Prisma.InputJsonValue
}

export type BillingReportFilters = {
  from?: string
  to?: string
  channel?: BillingChannel
  status?: BillingTransactionStatus
  packageId?: string
  routerId?: string
  paymentNetwork?: PaymentNetwork
}

@Injectable()
export class BillingService {
  // Mirrors RoutersService's own threshold (routers.service.ts) so "online"
  // means the same thing on the dashboard KPI as it does on the routers list.
  private readonly routerStaleWindowSeconds = Number.parseInt(process.env.ROUTER_STALE_WINDOW_SECONDS ?? '120', 10)
  private readonly routerLiveWindowSeconds = Number.parseInt(process.env.ROUTER_LIVE_WINDOW_SECONDS ?? '12', 10)

  private readonly transactionInclude: Prisma.BillingTransactionInclude = {
    tenant: {
      select: {
        id: true,
        name: true,
      },
    },
    wallet: {
      select: {
        id: true,
        balanceUgx: true,
        currency: true,
      },
    },
    package: {
      select: {
        id: true,
        name: true,
        code: true,
      },
    },
    voucher: {
      select: {
        id: true,
        code: true,
        status: true,
      },
    },
    agent: {
      select: {
        id: true,
        code: true,
        name: true,
        phoneNumber: true,
        type: true,
        status: true,
      },
    },
    ledgerTransaction: {
      select: {
        id: true,
        reference: true,
        description: true,
      },
    },
    payment: {
      select: {
        id: true,
        phoneNumber: true,
        normalizedPhone: true,
      },
    },
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingPostingService: BillingPostingService,
    private readonly feeEngineService: FeeEngineService,
  ) {}

  async recordMobileMoneySale(dto: RecordMobileMoneySaleDto) {
    return this.recordSale({
      tenantId: dto.tenantId,
      packageId: dto.packageId,
      agentId: dto.agentId,
      channel: BillingChannel.MOBILE_MONEY,
      type: BillingTransactionType.MOBILE_MONEY_SALE,
      grossAmountUgx: dto.grossAmountUgx,
      description: 'Mobile money package sale',
      customerReference: dto.customerReference,
      externalReference: dto.externalReference,
      paymentProvider: dto.paymentProvider ?? 'Mobile Money',
      metadata: {
        network: dto.network ?? 'unknown',
      } as Prisma.InputJsonValue,
    })
  }

  async recordSale(input: RecordSaleInput) {
    if (input.externalReference) {
      const existing = await this.prisma.billingTransaction.findUnique({
        where: { externalReference: input.externalReference },
        include: this.transactionInclude,
      })

      if (existing) {
        return existing
      }
    }

    const [tenant, pkg] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: input.tenantId } }),
      this.prisma.package.findUnique({ where: { id: input.packageId } }),
    ])

    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    if (!pkg || pkg.tenantId !== input.tenantId) {
      throw new NotFoundException('Package not found for this business')
    }

    if (input.voucherId) {
      const voucher = await this.prisma.voucher.findUnique({ where: { id: input.voucherId } })
      if (!voucher || voucher.tenantId !== input.tenantId) {
        throw new NotFoundException('Voucher not found for this business')
      }
    }

    if (input.agentId) {
      const agent = await this.prisma.agent.findFirst({
        where: {
          id: input.agentId,
          tenantId: input.tenantId,
          status: AgentStatus.ACTIVE,
        },
      })

      if (!agent) {
        throw new NotFoundException('Active agent not found for this business')
      }
    }

    return this.prisma.$transaction((tx) => this.recordSaleInTransaction(tx, input))
  }

  async recordSaleInTransaction(tx: Prisma.TransactionClient, input: RecordSaleInput) {
    const wallet = await this.findOrCreateTenantWallet(tx, input.tenantId)
    const posting = await this.billingPostingService.buildSalePosting({
      tenantId: input.tenantId,
      walletId: wallet.id,
      channel: input.channel,
      grossAmountUgx: input.grossAmountUgx,
      description: input.description,
      tx,
    })

    const ledgerTransaction = await tx.ledgerTransaction.create({
      data: {
        tenantId: input.tenantId,
        walletId: wallet.id,
        reference: input.externalReference ? `LEDGER-${input.externalReference}` : `LEDGER-${randomUUID()}`,
        type: posting.ledgerType,
        channel: posting.channel,
        description: posting.description,
        grossAmountUgx: posting.grossAmountUgx,
        feeAmountUgx: posting.feeAmountUgx,
        netAmountUgx: posting.netAmountUgx,
        feeBasisPoints: posting.feeBasisPoints,
        feeSource: posting.feeSource,
        sourceType: 'BillingTransaction',
        sourceId: input.externalReference,
        metadata: input.metadata,
        entries: {
          create: posting.entries,
        },
      },
    })

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceUgx: {
          increment: posting.walletDeltaUgx,
        },
        earnedBalanceUgx: {
          increment: posting.walletDeltaUgx,
        },
      },
    })

    if (posting.feeAmountUgx > 0) {
      await tx.platformSetting.update({
        where: { id: PLATFORM_SETTINGS_ID },
        data: {
          platformWalletBalanceUgx: {
            increment: posting.feeAmountUgx,
          },
        },
      })
    }

    const billingTransaction = await tx.billingTransaction.create({
      data: {
        tenantId: input.tenantId,
        walletId: wallet.id,
        agentId: input.agentId,
        packageId: input.packageId,
        voucherId: input.voucherId,
        ledgerTransactionId: ledgerTransaction.id,
        channel: input.channel,
        type: input.type,
        status: BillingTransactionStatus.COMPLETED,
        grossAmountUgx: posting.grossAmountUgx,
        feeAmountUgx: posting.feeAmountUgx,
        netAmountUgx: posting.netAmountUgx,
        feeBasisPoints: posting.feeBasisPoints,
        feeSource: posting.feeSource,
        customerReference: input.customerReference,
        externalReference: input.externalReference,
        paymentProvider: input.paymentProvider,
        metadata: input.metadata,
      },
      include: this.transactionInclude,
    })

    await this.maybeAccrueAgentCommission(tx, billingTransaction, input.agentId)

    return billingTransaction
  }

  async adjustWallet(dto: AdjustWalletDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } })
    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.findOrCreateTenantWallet(tx, dto.tenantId)
      const posting = this.billingPostingService.buildWalletAdjustmentPosting({
        tenantId: dto.tenantId,
        walletId: wallet.id,
        amountUgx: dto.amountUgx,
        description: dto.description,
      })

      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          tenantId: dto.tenantId,
          walletId: wallet.id,
          reference: `LEDGER-${randomUUID()}`,
          type: posting.ledgerType,
          channel: posting.channel,
          description: posting.description,
          grossAmountUgx: posting.grossAmountUgx,
          feeAmountUgx: posting.feeAmountUgx,
          netAmountUgx: posting.netAmountUgx,
          sourceType: 'WalletAdjustment',
          metadata: { description: dto.description } as Prisma.InputJsonValue,
          entries: {
            create: posting.entries,
          },
        },
      })

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceUgx: {
            increment: posting.walletDeltaUgx,
          },
        },
      })

      return tx.billingTransaction.create({
        data: {
          tenantId: dto.tenantId,
          walletId: wallet.id,
          ledgerTransactionId: ledgerTransaction.id,
          channel: BillingChannel.WALLET_ADJUSTMENT,
          type: BillingTransactionType.WALLET_ADJUSTMENT,
          status: BillingTransactionStatus.COMPLETED,
          grossAmountUgx: posting.grossAmountUgx,
          feeAmountUgx: posting.feeAmountUgx,
          netAmountUgx: posting.netAmountUgx,
          externalReference: `WALLET-ADJUST-${randomUUID()}`,
          metadata: { description: dto.description } as Prisma.InputJsonValue,
        },
        include: this.transactionInclude,
      })
    })
  }

  async getOverview(tenantId?: string, filters: BillingReportFilters = {}) {
    filters = await this.clampFiltersToAnalyticsWindow(tenantId, filters)
    const transactionWhere = this.buildTransactionWhere(tenantId, filters)
    const dateWhere = this.buildDateWhere(filters)
    const routerActiveUserCutoff = new Date(Date.now() - this.routerLiveWindowSeconds * 1000)
    const routerLiveCutoff = new Date(Date.now() - this.routerStaleWindowSeconds * 1000)
    // Today / month-to-date figures are computed independently of the selected
    // filter range so the dashboard can always surface "Today" and "This month"
    // headline numbers regardless of what date window the vendor is viewing.
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const saleWhereBase = {
      ...(tenantId ? { tenantId } : {}),
      status: BillingTransactionStatus.COMPLETED,
      type: {
        in: [
          BillingTransactionType.MOBILE_MONEY_SALE,
          BillingTransactionType.VOUCHER_SALE,
          BillingTransactionType.VOUCHER_REDEMPTION,
        ],
      },
    } satisfies Prisma.BillingTransactionWhereInput
    const [transactions, wallets, ledgerEntries, disbursements, activeUsers, onlineRouters, dataUsage, todaySales, monthSales] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where: transactionWhere,
        include: this.transactionInclude,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.wallet.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ownerType: WalletOwnerType.TENANT,
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          ...(this.buildTenantWhere(tenantId) ?? {}),
          ...(dateWhere.createdAt ? { createdAt: dateWhere.createdAt } : {}),
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
          wallet: {
            select: {
              id: true,
              balanceUgx: true,
            },
          },
          ledgerTransaction: {
            select: {
              reference: true,
              description: true,
              channel: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.disbursement.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(dateWhere.createdAt ? { createdAt: dateWhere.createdAt } : {}),
        },
      }),
      // The router heartbeat carries the MikroTik HotSpot active count every
      // 2s. Use that count for the dashboard KPI so connect/disconnect changes
      // do not wait for RADIUS interim accounting.
      this.prisma.router.aggregate({
        where: {
          ...(tenantId ? { tenantId } : {}),
          lastSeenAt: { gte: routerActiveUserCutoff },
        },
        _sum: {
          activeSessionCount: true,
        },
      }),
      // router.status is a persisted column that's only written at onboarding
      // / manual health-check time — nothing keeps it in sync continuously,
      // so trusting it here undercounts offline routers as "online"
      // indefinitely. Compute liveness the same way the routers list page
      // does: any real signal within the stale window counts as online.
      this.prisma.router.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          OR: [
            { lastAccountingSignalAt: { gte: routerLiveCutoff } },
            { lastAuthSignalAt: { gte: routerLiveCutoff } },
            { lastRadiusSignalAt: { gte: routerLiveCutoff } },
            { lastProvisionedAt: { gte: routerLiveCutoff } },
            { lastSeenAt: { gte: routerLiveCutoff } },
          ],
        },
      }),
      this.prisma.networkSession.aggregate({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(dateWhere.createdAt ? { createdAt: dateWhere.createdAt } : {}),
        },
        _sum: {
          inputOctets: true,
          outputOctets: true,
        },
      }),
      this.prisma.billingTransaction.aggregate({
        where: { ...saleWhereBase, createdAt: { gte: startOfToday } },
        _sum: { grossAmountUgx: true, netAmountUgx: true },
      }),
      this.prisma.billingTransaction.aggregate({
        where: { ...saleWhereBase, createdAt: { gte: startOfMonth } },
        _sum: { grossAmountUgx: true, netAmountUgx: true },
      }),
    ])

    const completedSales = transactions.filter(
      (transaction) =>
        transaction.status === BillingTransactionStatus.COMPLETED &&
        (transaction.type === BillingTransactionType.MOBILE_MONEY_SALE ||
          transaction.type === BillingTransactionType.VOUCHER_SALE ||
          transaction.type === BillingTransactionType.VOUCHER_REDEMPTION),
    )

    const mobileMoneyGrossUgx = completedSales
      .filter((transaction) => transaction.channel === BillingChannel.MOBILE_MONEY)
      .reduce((total, transaction) => total + transaction.grossAmountUgx, 0)
    const voucherGrossUgx = completedSales
      .filter((transaction) => transaction.channel === BillingChannel.VOUCHER)
      .reduce((total, transaction) => total + transaction.grossAmountUgx, 0)
    const platformFeesUgx = completedSales.reduce((total, transaction) => total + transaction.feeAmountUgx, 0)
    const vendorNetUgx = completedSales.reduce((total, transaction) => total + transaction.netAmountUgx, 0)
    const walletBalanceUgx = wallets.reduce((total, wallet) => total + wallet.balanceUgx, 0)
    const mobileMoneyFeesUgx = completedSales
      .filter((transaction) => transaction.channel === BillingChannel.MOBILE_MONEY)
      .reduce((total, transaction) => total + transaction.feeAmountUgx, 0)
    const voucherFeesUgx = completedSales
      .filter((transaction) => transaction.channel === BillingChannel.VOUCHER)
      .reduce((total, transaction) => total + transaction.feeAmountUgx, 0)
    const mobileMoneyNetUgx = completedSales
      .filter((transaction) => transaction.channel === BillingChannel.MOBILE_MONEY)
      .reduce((total, transaction) => total + transaction.netAmountUgx, 0)
    const voucherNetUgx = completedSales
      .filter((transaction) => transaction.channel === BillingChannel.VOUCHER)
      .reduce((total, transaction) => total + transaction.netAmountUgx, 0)
    const pendingWithdrawalUgx = disbursements
      .filter((item) => item.status === 'PENDING' || item.status === 'PROCESSING')
      .reduce((total, item) => total + item.amountUgx, 0)
    const completedWithdrawalUgx = disbursements
      .filter((item) => item.status === 'COMPLETED')
      .reduce((total, item) => total + item.amountUgx, 0)
    const failedWithdrawalUgx = disbursements
      .filter((item) => item.status === 'FAILED')
      .reduce((total, item) => total + item.amountUgx, 0)
    const inputBytes = Number(dataUsage._sum.inputOctets ?? 0n)
    const outputBytes = Number(dataUsage._sum.outputOctets ?? 0n)

    return {
      summary: {
        totalTransactions: transactions.length,
        completedTransactions: transactions.filter((transaction) => transaction.status === BillingTransactionStatus.COMPLETED).length,
        pendingTransactions: transactions.filter((transaction) => transaction.status === BillingTransactionStatus.PENDING).length,
        totalSalesUgx: completedSales.reduce((total, transaction) => total + transaction.grossAmountUgx, 0),
        grossSalesUgx: completedSales.reduce((total, transaction) => total + transaction.grossAmountUgx, 0),
        mobileMoneyGrossUgx,
        mobileMoneyFeesUgx,
        mobileMoneyNetUgx,
        voucherGrossUgx,
        voucherFeesUgx,
        voucherNetUgx,
        platformFeesUgx,
        netEarningsUgx: vendorNetUgx,
        vendorNetUgx,
        todayGrossSalesUgx: todaySales._sum.grossAmountUgx ?? 0,
        todayNetEarningsUgx: todaySales._sum.netAmountUgx ?? 0,
        monthGrossSalesUgx: monthSales._sum.grossAmountUgx ?? 0,
        monthNetEarningsUgx: monthSales._sum.netAmountUgx ?? 0,
        walletBalanceUgx,
        withdrawableBalanceUgx: walletBalanceUgx,
        pendingWithdrawalUgx,
        completedWithdrawalUgx,
        failedWithdrawalUgx,
        activeUsers: activeUsers._sum.activeSessionCount ?? 0,
        onlineRouters,
        dataUsedMb: Math.round(((inputBytes + outputBytes) / (1024 * 1024)) * 100) / 100,
      },
      wallets,
      recentTransactions: completedSales.slice(0, 10),
      recentLedgerEntries: ledgerEntries,
      chart: this.groupSalesByDay(completedSales),
      filters: this.presentFilters(filters),
    }
  }

  async getSales(tenantId?: string, filters: BillingReportFilters = {}) {
    filters = await this.clampFiltersToAnalyticsWindow(tenantId, filters)
    const items = await this.prisma.billingTransaction.findMany({
      where: {
        ...this.buildTransactionWhere(tenantId, filters),
        type: {
          in: [
            BillingTransactionType.MOBILE_MONEY_SALE,
            BillingTransactionType.VOUCHER_SALE,
            BillingTransactionType.VOUCHER_REDEMPTION,
          ],
        },
      },
      include: this.transactionInclude,
      orderBy: { createdAt: 'desc' },
    })

    return {
      summary: {
        count: items.length,
        totalGrossUgx: items.reduce((total, item) => total + item.grossAmountUgx, 0),
        totalFeesUgx: items.reduce((total, item) => total + item.feeAmountUgx, 0),
        totalNetUgx: items.reduce((total, item) => total + item.netAmountUgx, 0),
        netEarningsUgx: items.reduce((total, item) => total + item.netAmountUgx, 0),
        mobileMoneyGrossUgx: items
          .filter((item) => item.channel === BillingChannel.MOBILE_MONEY)
          .reduce((total, item) => total + item.grossAmountUgx, 0),
        voucherGrossUgx: items
          .filter((item) => item.channel === BillingChannel.VOUCHER)
          .reduce((total, item) => total + item.grossAmountUgx, 0),
      },
      items,
      chart: this.groupSalesByDay(items),
      filters: this.presentFilters(filters),
    }
  }

  // DevAdmin-only: every other report here is either platform-wide-combined
  // or scoped to a single tenant. This groups completed sales by tenant so
  // DevAdmin can see who's actually selling without flipping through tenants
  // one at a time.
  async getSalesByTenant(filters: BillingReportFilters = {}) {
    const where: Prisma.BillingTransactionWhereInput = {
      ...this.buildTransactionWhere(undefined, filters),
      type: {
        in: [
          BillingTransactionType.MOBILE_MONEY_SALE,
          BillingTransactionType.VOUCHER_SALE,
          BillingTransactionType.VOUCHER_REDEMPTION,
        ],
      },
      status: BillingTransactionStatus.COMPLETED,
    }

    const grouped = await this.prisma.billingTransaction.groupBy({
      by: ['tenantId'],
      where,
      _sum: { grossAmountUgx: true, feeAmountUgx: true, netAmountUgx: true },
      _count: { _all: true },
    })

    const tenantIds = grouped.map((row) => row.tenantId)
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, tenantSettings: { select: { subscriptionPlan: true } } },
    })
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]))

    const rows = grouped
      .map((row) => ({
        tenantId: row.tenantId,
        tenantName: tenantById.get(row.tenantId)?.name ?? 'Unknown business',
        subscriptionPlan: tenantById.get(row.tenantId)?.tenantSettings?.subscriptionPlan ?? 'FREE',
        salesCount: row._count._all,
        grossSalesUgx: row._sum.grossAmountUgx ?? 0,
        platformFeesUgx: row._sum.feeAmountUgx ?? 0,
        netEarningsUgx: row._sum.netAmountUgx ?? 0,
      }))
      .sort((a, b) => b.grossSalesUgx - a.grossSalesUgx)

    return {
      rows,
      summary: {
        tenantCount: rows.length,
        totalSalesCount: rows.reduce((total, row) => total + row.salesCount, 0),
        totalGrossSalesUgx: rows.reduce((total, row) => total + row.grossSalesUgx, 0),
        totalPlatformFeesUgx: rows.reduce((total, row) => total + row.platformFeesUgx, 0),
        totalNetEarningsUgx: rows.reduce((total, row) => total + row.netEarningsUgx, 0),
      },
      filters: this.presentFilters(filters),
    }
  }

  async getTransactions(tenantId?: string, filters: BillingReportFilters = {}) {
    filters = await this.clampFiltersToAnalyticsWindow(tenantId, filters)
    const items = await this.prisma.billingTransaction.findMany({
      where: this.buildTransactionWhere(tenantId, filters),
      include: this.transactionInclude,
      orderBy: { createdAt: 'desc' },
    })

    const walletBalanceAggregate = await this.prisma.wallet.aggregate({
      _sum: {
        balanceUgx: true,
      },
      where: tenantId ? { tenantId } : undefined,
    })

    return {
      summary: {
        totalTransactions: items.length,
        completed: items.filter((item) => item.status === BillingTransactionStatus.COMPLETED).length,
        pending: items.filter((item) => item.status === BillingTransactionStatus.PENDING).length,
        reversed: items.filter((item) => item.status === BillingTransactionStatus.REVERSED).length,
        totalGrossUgx: items.reduce((total, item) => total + item.grossAmountUgx, 0),
        totalFeesUgx: items.reduce((total, item) => total + item.feeAmountUgx, 0),
        totalNetUgx: items.reduce((total, item) => total + item.netAmountUgx, 0),
        walletBalanceUgx: walletBalanceAggregate._sum.balanceUgx ?? 0,
      },
      items,
      chart: this.groupSalesByDay(items),
      filters: this.presentFilters(filters),
    }
  }

  async exportSalesCsv(tenantId?: string, filters: BillingReportFilters = {}) {
    const { items } = await this.getSales(tenantId, filters)
    return {
      filename: `sales-${Date.now()}.csv`,
      contentType: 'text/csv',
      buffer: Buffer.from(
        this.toCsv(
          ['date', 'business', 'type', 'channel', 'status', 'package', 'customerReference', 'grossUgx', 'feeUgx', 'netUgx', 'externalReference'],
          items.map((item) => [
            item.createdAt.toISOString(),
            item.tenant.name,
            item.type,
            item.channel,
            item.status,
            item.package?.name ?? '',
            item.customerReference ?? '',
            item.grossAmountUgx,
            item.feeAmountUgx,
            item.netAmountUgx,
            item.externalReference ?? '',
          ]),
        ),
        'utf-8',
      ),
    }
  }

  async exportTransactionsCsv(tenantId?: string, filters: BillingReportFilters = {}) {
    const { items } = await this.getTransactions(tenantId, filters)
    return {
      filename: `ledger-${Date.now()}.csv`,
      contentType: 'text/csv',
      buffer: Buffer.from(
        this.toCsv(
          ['date', 'business', 'type', 'channel', 'status', 'grossUgx', 'feeUgx', 'netUgx', 'paymentProvider', 'externalReference'],
          items.map((item) => [
            item.createdAt.toISOString(),
            item.tenant.name,
            item.type,
            item.channel,
            item.status,
            item.grossAmountUgx,
            item.feeAmountUgx,
            item.netAmountUgx,
            item.paymentProvider ?? '',
            item.externalReference ?? '',
          ]),
        ),
        'utf-8',
      ),
    }
  }

  private toCsv(headers: string[], rows: Array<Array<string | number>>) {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n')
  }

  private buildTenantWhere(tenantId?: string) {
    return tenantId ? { tenantId } : undefined
  }

  private buildTransactionWhere(tenantId?: string, filters: BillingReportFilters = {}): Prisma.BillingTransactionWhereInput {
    const dateWhere = this.buildDateWhere(filters)
    const paymentWhere: Prisma.PaymentNullableRelationFilter | undefined =
      filters.paymentNetwork || filters.routerId
        ? {
            is: {
              ...(filters.paymentNetwork ? { network: filters.paymentNetwork } : {}),
              ...(filters.routerId
                ? {
                    metadata: {
                      path: ['routerId'],
                      equals: filters.routerId,
                    },
                  }
                : {}),
            },
          }
        : undefined

    return {
      ...(tenantId ? { tenantId } : {}),
      ...(dateWhere.createdAt ? { createdAt: dateWhere.createdAt } : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.packageId ? { packageId: filters.packageId } : {}),
      ...(paymentWhere ? { payment: paymentWhere } : {}),
    }
  }

  // Free/Pro plans only get to look back N days of analytics; Enterprise is
  // unlimited. DevAdmin's platform-wide view (no tenantId) is never clamped.
  private async clampFiltersToAnalyticsWindow(tenantId: string | undefined, filters: BillingReportFilters): Promise<BillingReportFilters> {
    if (!tenantId) {
      return filters
    }

    const [platformSettings, tenantSettings] = await Promise.all([
      this.prisma.platformSetting.upsert({
        where: { id: PLATFORM_SETTINGS_ID },
        update: {},
        create: { id: PLATFORM_SETTINGS_ID },
      }),
      this.prisma.tenantSetting.findUnique({
        where: { tenantId },
        select: { subscriptionPlan: true, subscriptionPlanExpiresAt: true },
      }),
    ])

    const effectiveTier = tenantSettings
      ? resolveEffectiveSubscriptionTier(tenantSettings.subscriptionPlan, tenantSettings.subscriptionPlanExpiresAt)
      : 'FREE'

    // Analytics history cap disabled for now — all plans get full history.
    // Re-enable tier checks here when plan enforcement is ready.
    void effectiveTier
    void platformSettings

    return filters
  }

  private buildDateWhere(filters: BillingReportFilters): { createdAt?: Prisma.DateTimeFilter } {
    const createdAt: Prisma.DateTimeFilter = {}
    const from = filters.from ? new Date(filters.from) : null
    const to = filters.to ? new Date(filters.to) : null
    if (from && Number.isFinite(from.getTime())) {
      createdAt.gte = from
    }
    if (to && Number.isFinite(to.getTime())) {
      createdAt.lte = to
    }
    return Object.keys(createdAt).length > 0 ? { createdAt } : {}
  }

  private groupSalesByDay(items: Array<{ createdAt: Date; grossAmountUgx: number; feeAmountUgx: number; netAmountUgx: number; channel: BillingChannel }>) {
    const buckets = new Map<string, {
      date: string
      grossSalesUgx: number
      platformFeesUgx: number
      netEarningsUgx: number
      mobileMoneyGrossUgx: number
      voucherGrossUgx: number
    }>()

    for (const item of items) {
      const date = item.createdAt.toISOString().slice(0, 10)
      const bucket = buckets.get(date) ?? {
        date,
        grossSalesUgx: 0,
        platformFeesUgx: 0,
        netEarningsUgx: 0,
        mobileMoneyGrossUgx: 0,
        voucherGrossUgx: 0,
      }
      bucket.grossSalesUgx += item.grossAmountUgx
      bucket.platformFeesUgx += item.feeAmountUgx
      bucket.netEarningsUgx += item.netAmountUgx
      if (item.channel === BillingChannel.MOBILE_MONEY) {
        bucket.mobileMoneyGrossUgx += item.grossAmountUgx
      }
      if (item.channel === BillingChannel.VOUCHER) {
        bucket.voucherGrossUgx += item.grossAmountUgx
      }
      buckets.set(date, bucket)
    }

    return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date))
  }

  private presentFilters(filters: BillingReportFilters) {
    return {
      from: filters.from,
      to: filters.to,
      channel: filters.channel,
      status: filters.status,
      packageId: filters.packageId,
      routerId: filters.routerId,
      paymentNetwork: filters.paymentNetwork,
    }
  }

  private async findOrCreateTenantWallet(tx: Prisma.TransactionClient, tenantId: string) {
    const existingWallet = await tx.wallet.findFirst({
      where: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
        ownerReference: tenantId,
      },
    })

    if (existingWallet) {
      return existingWallet
    }

    return tx.wallet.create({
      data: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
        ownerReference: tenantId,
      },
    })
  }

  private async findOrCreateAgentWallet(
    tx: Prisma.TransactionClient,
    tenantId: string,
    agentId: string,
  ) {
    const existingWallet = await tx.wallet.findFirst({
      where: {
        tenantId,
        ownerType: WalletOwnerType.AGENT,
        ownerReference: agentId,
      },
    })

    if (existingWallet) {
      return existingWallet
    }

    return tx.wallet.create({
      data: {
        tenantId,
        ownerType: WalletOwnerType.AGENT,
        ownerReference: agentId,
        agentId,
      },
    })
  }

  private async maybeAccrueAgentCommission(
    tx: Prisma.TransactionClient,
    billingTransaction: {
      id: string
      tenantId: string
      agentId?: string | null
      externalReference?: string | null
      grossAmountUgx: number
      channel: BillingChannel
      type: BillingTransactionType
    },
    agentId?: string,
  ) {
    const resolvedAgentId = agentId ?? billingTransaction.agentId

    if (!resolvedAgentId) {
      return
    }

    if (billingTransaction.type !== BillingTransactionType.VOUCHER_SALE) {
      return
    }

    const existingCommission = await tx.agentCommission.findUnique({
      where: {
        sourceTransactionId: billingTransaction.id,
      },
    })

    if (existingCommission) {
      return
    }

    const agent = await tx.agent.findFirst({
      where: {
        id: resolvedAgentId,
        tenantId: billingTransaction.tenantId,
        status: AgentStatus.ACTIVE,
      },
    })

    if (!agent) {
      throw new NotFoundException('Active agent not found for commission accrual')
    }

    const commissionAmountUgx = this.feeEngineService.calculateBasisPointAmount(
      agent.commissionRateBps,
      billingTransaction.grossAmountUgx,
    )

    if (commissionAmountUgx <= 0) {
      return
    }

    await tx.agentCommission.create({
      data: {
        tenantId: billingTransaction.tenantId,
        agentId: agent.id,
        sourceTransactionId: billingTransaction.id,
        status: CommissionStatus.ACCRUED,
        basisAmountUgx: billingTransaction.grossAmountUgx,
        rateBps: agent.commissionRateBps,
        amountUgx: commissionAmountUgx,
      },
    })
  }
}
