import { Injectable, NotFoundException } from '@nestjs/common'
import {
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  Prisma,
  WalletOwnerType,
} from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { BillingPostingService } from './billing-posting.service'
import { AdjustWalletDto } from './dto/adjust-wallet.dto'
import { RecordMobileMoneySaleDto } from './dto/record-mobile-money-sale.dto'

type RecordSaleInput = {
  tenantId: string
  packageId: string
  voucherId?: string
  channel: BillingChannel
  type: BillingTransactionType
  grossAmountUgx: number
  description: string
  customerReference?: string
  externalReference?: string
  paymentProvider?: string
  metadata?: Prisma.InputJsonValue
}

@Injectable()
export class BillingService {
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
    ledgerTransaction: {
      select: {
        id: true,
        reference: true,
        description: true,
      },
    },
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingPostingService: BillingPostingService,
  ) {}

  async recordMobileMoneySale(dto: RecordMobileMoneySaleDto) {
    return this.recordSale({
      tenantId: dto.tenantId,
      packageId: dto.packageId,
      channel: BillingChannel.MOBILE_MONEY,
      type: BillingTransactionType.MOBILE_MONEY_SALE,
      grossAmountUgx: dto.grossAmountUgx,
      description: 'Mobile money package sale',
      customerReference: dto.customerReference,
      externalReference: dto.externalReference,
      paymentProvider: dto.paymentProvider ?? 'Yo! Uganda',
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
      throw new NotFoundException('Tenant not found')
    }

    if (!pkg || pkg.tenantId !== input.tenantId) {
      throw new NotFoundException('Package not found for tenant')
    }

    if (input.voucherId) {
      const voucher = await this.prisma.voucher.findUnique({ where: { id: input.voucherId } })
      if (!voucher || voucher.tenantId !== input.tenantId) {
        throw new NotFoundException('Voucher not found for tenant')
      }
    }

    return this.prisma.$transaction((tx) => this.recordSaleInTransaction(tx, input))
  }

  async recordSaleInTransaction(tx: Prisma.TransactionClient, input: RecordSaleInput) {
    const wallet = await this.findOrCreateTenantWallet(tx, input.tenantId)
    const posting = this.billingPostingService.buildSalePosting({
      tenantId: input.tenantId,
      walletId: wallet.id,
      channel: input.channel,
      grossAmountUgx: input.grossAmountUgx,
      description: input.description,
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
      },
    })

    return tx.billingTransaction.create({
      data: {
        tenantId: input.tenantId,
        walletId: wallet.id,
        packageId: input.packageId,
        voucherId: input.voucherId,
        ledgerTransactionId: ledgerTransaction.id,
        channel: input.channel,
        type: input.type,
        status: BillingTransactionStatus.COMPLETED,
        grossAmountUgx: posting.grossAmountUgx,
        feeAmountUgx: posting.feeAmountUgx,
        netAmountUgx: posting.netAmountUgx,
        customerReference: input.customerReference,
        externalReference: input.externalReference,
        paymentProvider: input.paymentProvider,
        metadata: input.metadata,
      },
      include: this.transactionInclude,
    })
  }

  async adjustWallet(dto: AdjustWalletDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } })
    if (!tenant) {
      throw new NotFoundException('Tenant not found')
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
          metadata: { description: dto.description },
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
          metadata: { description: dto.description },
        },
        include: this.transactionInclude,
      })
    })
  }

  async getOverview(tenantId?: string) {
    const [transactions, wallets, ledgerEntries] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where: this.buildTenantWhere(tenantId),
        include: this.transactionInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wallet.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.ledgerEntry.findMany({
        where: this.buildTenantWhere(tenantId),
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
    ])

    const completedSales = transactions.filter(
      (transaction) =>
        transaction.status === BillingTransactionStatus.COMPLETED &&
        (transaction.type === BillingTransactionType.MOBILE_MONEY_SALE ||
          transaction.type === BillingTransactionType.VOUCHER_SALE),
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

    return {
      summary: {
        totalTransactions: transactions.length,
        completedTransactions: transactions.filter((transaction) => transaction.status === BillingTransactionStatus.COMPLETED).length,
        pendingTransactions: transactions.filter((transaction) => transaction.status === BillingTransactionStatus.PENDING).length,
        totalSalesUgx: completedSales.reduce((total, transaction) => total + transaction.grossAmountUgx, 0),
        mobileMoneyGrossUgx,
        voucherGrossUgx,
        platformFeesUgx,
        vendorNetUgx,
        walletBalanceUgx,
      },
      wallets,
      recentTransactions: transactions.slice(0, 10),
      recentLedgerEntries: ledgerEntries,
    }
  }

  async getSales(tenantId?: string) {
    const items = await this.prisma.billingTransaction.findMany({
      where: {
        ...(this.buildTenantWhere(tenantId) ?? {}),
        type: {
          in: [BillingTransactionType.MOBILE_MONEY_SALE, BillingTransactionType.VOUCHER_SALE],
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
        mobileMoneyGrossUgx: items
          .filter((item) => item.channel === BillingChannel.MOBILE_MONEY)
          .reduce((total, item) => total + item.grossAmountUgx, 0),
        voucherGrossUgx: items
          .filter((item) => item.channel === BillingChannel.VOUCHER)
          .reduce((total, item) => total + item.grossAmountUgx, 0),
      },
      items,
    }
  }

  async getTransactions(tenantId?: string) {
    const items = await this.prisma.billingTransaction.findMany({
      where: this.buildTenantWhere(tenantId),
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
    }
  }

  private buildTenantWhere(tenantId?: string) {
    return tenantId ? { tenantId } : undefined
  }

  private async findOrCreateTenantWallet(tx: Prisma.TransactionClient, tenantId: string) {
    const existingWallet = await tx.wallet.findFirst({
      where: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
      },
    })

    if (existingWallet) {
      return existingWallet
    }

    return tx.wallet.create({
      data: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
      },
    })
  }
}
