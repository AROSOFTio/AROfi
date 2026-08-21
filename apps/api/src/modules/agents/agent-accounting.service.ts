import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  AgentStatus,
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  CommissionStatus,
  DisbursementMethod,
  DisbursementStatus,
  PaymentNetwork,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  SettlementStatus,
  WalletOwnerType,
} from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PaymentRouterService } from '../payments/payment-router.service'
import { PhoneNumberService } from '../payments/phone-number.service'
import { mapRawStatusToPaymentStatus } from '../payments/payment-provider.interface'
import type { AgentCashDepositDto, AgentCommissionWithdrawalDto } from './dto/agent-accounting.dto'

const CASH_SETTLEMENT_MARKER = 'AGENT_CASH_REMITTANCE'
const CASH_DEPOSIT_KIND = 'AGENT_CASH_DEPOSIT'
const COMMISSION_WITHDRAWAL_KIND = 'AGENT_MOBILE_MONEY_COMMISSION_WITHDRAWAL'
const OPEN_DISBURSEMENT_STATUSES: readonly DisbursementStatus[] = [
  DisbursementStatus.PENDING,
  DisbursementStatus.PROCESSING,
  DisbursementStatus.PENDING_APPROVAL,
]
const CLOSED_DISBURSEMENT_STATUSES: readonly DisbursementStatus[] = [
  DisbursementStatus.FAILED,
  DisbursementStatus.CANCELLED,
  DisbursementStatus.REVERSED,
]
const FAILED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
  PaymentStatus.EXPIRED,
]

@Injectable()
export class AgentAccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRouter: PaymentRouterService,
    private readonly phoneNumbers: PhoneNumberService,
  ) {}

  async getMyAccounting(email: string, tenantId: string) {
    const agent = await this.requireAgent(email, tenantId)
    const [sales, commissions, settlements, pendingDeposits, withdrawals, tenantWallet] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where: {
          tenantId,
          agentId: agent.id,
          status: BillingTransactionStatus.COMPLETED,
          type: { in: [BillingTransactionType.VOUCHER_SALE, BillingTransactionType.MOBILE_MONEY_SALE] },
        },
        include: { sourceCommission: { select: { amountUgx: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.agentCommission.findMany({
        where: { tenantId, agentId: agent.id, status: { not: CommissionStatus.REVERSED } },
        include: { sourceTransaction: { select: { channel: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.settlement.findMany({
        where: {
          tenantId,
          agentId: agent.id,
          status: SettlementStatus.COMPLETED,
          notes: { startsWith: CASH_SETTLEMENT_MARKER },
        },
        select: { payableAmountUgx: true, createdAt: true, reference: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.billingTransaction.findMany({
        where: {
          tenantId,
          agentId: agent.id,
          type: BillingTransactionType.AGENT_FLOAT_RETURN,
          status: BillingTransactionStatus.PENDING,
        },
        select: { id: true, grossAmountUgx: true, createdAt: true },
      }),
      this.prisma.disbursement.findMany({
        where: { tenantId, agentId: agent.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.wallet.findFirst({
        where: { tenantId, ownerType: WalletOwnerType.TENANT, ownerReference: tenantId },
        select: { balanceUgx: true, earnedBalanceUgx: true },
      }),
    ])

    const cashSales = sales.filter((item) => item.channel === BillingChannel.VOUCHER)
    const mobileMoneySales = sales.filter((item) => item.channel === BillingChannel.MOBILE_MONEY)
    const cashCommission = commissions.filter((item) => item.sourceTransaction.channel === BillingChannel.VOUCHER)
    const mobileMoneyCommission = commissions.filter((item) => item.sourceTransaction.channel === BillingChannel.MOBILE_MONEY)
    const accruedMobileMoneyCommission = mobileMoneyCommission
      .filter((item) => item.status === CommissionStatus.ACCRUED)
      .reduce((sum, item) => sum + item.amountUgx, 0)
    const pendingWithdrawalUgx = withdrawals
      .filter((item) => this.metadataString(item.metadata, 'kind') === COMMISSION_WITHDRAWAL_KIND)
      .filter((item) => OPEN_DISBURSEMENT_STATUSES.includes(item.status))
      .reduce((sum, item) => sum + item.amountUgx, 0)

    const cashLiabilityUgx = cashSales.reduce(
      (sum, item) => sum + Math.max(0, item.grossAmountUgx - (item.sourceCommission?.amountUgx ?? 0)),
      0,
    )
    const cashSettledUgx = settlements.reduce((sum, item) => sum + item.payableAmountUgx, 0)
    const cashOutstandingUgx = Math.max(0, cashLiabilityUgx - cashSettledUgx)
    const pendingCashDepositUgx = pendingDeposits.reduce((sum, item) => sum + item.grossAmountUgx, 0)
    const fundedCommissionUgx = Math.max(
      0,
      Math.min(tenantWallet?.balanceUgx ?? 0, tenantWallet?.earnedBalanceUgx ?? 0),
    )
    // A withdrawal settles whole accrued Mobile Money commission rows. Do not
    // expose a partial amount that could cause all rows to be marked settled
    // while only part of the commission was actually paid.
    const mobileMoneyCommissionAvailableUgx =
      pendingWithdrawalUgx > 0 || fundedCommissionUgx < accruedMobileMoneyCommission
        ? 0
        : accruedMobileMoneyCommission
    const mobileMoneyCommissionPendingFundingUgx = Math.max(
      0,
      accruedMobileMoneyCommission - fundedCommissionUgx,
    )

    return {
      agent: {
        id: agent.id,
        name: agent.name,
        code: agent.code,
        phoneNumber: agent.phoneNumber,
        commissionRateBps: agent.commissionRateBps,
      },
      summary: {
        cashSalesUgx: cashSales.reduce((sum, item) => sum + item.grossAmountUgx, 0),
        mobileMoneySalesUgx: mobileMoneySales.reduce((sum, item) => sum + item.grossAmountUgx, 0),
        totalSalesUgx: sales.reduce((sum, item) => sum + item.grossAmountUgx, 0),
        cashCommissionUgx: cashCommission.reduce((sum, item) => sum + item.amountUgx, 0),
        mobileMoneyCommissionUgx: mobileMoneyCommission.reduce((sum, item) => sum + item.amountUgx, 0),
        totalCommissionUgx: commissions.reduce((sum, item) => sum + item.amountUgx, 0),
        mobileMoneyCommissionAvailableUgx,
        mobileMoneyCommissionPendingFundingUgx,
        pendingCommissionWithdrawalUgx: pendingWithdrawalUgx,
        cashLiabilityUgx,
        cashSettledUgx,
        cashOutstandingUgx,
        pendingCashDepositUgx,
        cashAvailableToDepositUgx: Math.max(0, cashOutstandingUgx - pendingCashDepositUgx),
      },
      recentSettlements: settlements.slice(0, 10),
      recentWithdrawals: withdrawals
        .filter((item) => this.metadataString(item.metadata, 'kind') === COMMISSION_WITHDRAWAL_KIND)
        .slice(0, 10)
        .map((item) => ({
          id: item.id,
          amountUgx: item.amountUgx,
          status: item.status,
          destinationReference: item.destinationReference,
          createdAt: item.createdAt,
        })),
    }
  }

  async initiateCashDeposit(email: string, tenantId: string, dto: AgentCashDepositDto) {
    const agent = await this.requireAgent(email, tenantId)
    const accounting = await this.getMyAccounting(email, tenantId)
    if (dto.amountUgx > accounting.summary.cashAvailableToDepositUgx) {
      throw new BadRequestException(
        `You can deposit at most UGX ${accounting.summary.cashAvailableToDepositUgx.toLocaleString('en-UG')} of outstanding cash.`,
      )
    }

    const phoneNumber = this.phoneNumbers.normalize(dto.phoneNumber)
    const wallet = await this.findOrCreateTenantWallet(tenantId)
    const externalReference = `AGENT-CASH-DEPOSIT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`
    const provider = this.paymentRouter.resolveCollection(dto.network)

    const transaction = await this.prisma.billingTransaction.create({
      data: {
        tenantId,
        walletId: wallet.id,
        agentId: agent.id,
        channel: BillingChannel.MOBILE_MONEY,
        type: BillingTransactionType.AGENT_FLOAT_RETURN,
        status: BillingTransactionStatus.PENDING,
        grossAmountUgx: dto.amountUgx,
        netAmountUgx: dto.amountUgx,
        customerReference: phoneNumber,
        externalReference,
        paymentProvider: String(provider.provider),
        metadata: {
          kind: CASH_DEPOSIT_KIND,
          network: dto.network,
          phoneNumber,
        } as Prisma.InputJsonValue,
      },
    })

    try {
      const result = await provider.collectPayment({
        amountUgx: dto.amountUgx,
        currency: 'UGX',
        phoneNumber,
        externalReference,
        customerReference: agent.code,
        narrative: `AroFi Agent cash deposit ${agent.code}`,
        network: dto.network,
      })
      const providerReference = this.providerReference(result) || externalReference
      const status = mapRawStatusToPaymentStatus(result.transactionStatus || result.status)
      await this.prisma.billingTransaction.update({
        where: { id: transaction.id },
        data: {
          status: status === PaymentStatus.COMPLETED ? BillingTransactionStatus.PENDING : this.toBillingStatus(status),
          metadata: {
            kind: CASH_DEPOSIT_KIND,
            network: dto.network,
            phoneNumber,
            providerReference,
            providerStatus: result.transactionStatus || result.status,
          } as Prisma.InputJsonValue,
        },
      })
      if (status === PaymentStatus.COMPLETED) {
        return this.finalizeCashDeposit(transaction.id, tenantId, agent.id)
      }
      return { id: transaction.id, status, amountUgx: dto.amountUgx, phoneNumber, network: dto.network }
    } catch (error) {
      await this.prisma.billingTransaction.update({
        where: { id: transaction.id },
        data: { status: BillingTransactionStatus.FAILED },
      })
      throw error
    }
  }

  async checkCashDeposit(email: string, tenantId: string, transactionId: string) {
    const agent = await this.requireAgent(email, tenantId)
    const transaction = await this.prisma.billingTransaction.findFirst({
      where: {
        id: transactionId,
        tenantId,
        agentId: agent.id,
        type: BillingTransactionType.AGENT_FLOAT_RETURN,
      },
    })
    if (!transaction) throw new NotFoundException('Cash deposit not found')
    if (transaction.status === BillingTransactionStatus.COMPLETED) {
      return { id: transaction.id, status: 'COMPLETED', amountUgx: transaction.grossAmountUgx }
    }
    if (transaction.status === BillingTransactionStatus.FAILED) {
      return { id: transaction.id, status: 'FAILED', amountUgx: transaction.grossAmountUgx }
    }

    const metadata = this.metadata(transaction.metadata)
    const network = String(metadata.network || '') as PaymentNetwork
    const providerReference = String(metadata.providerReference || transaction.externalReference || '')
    const selection = this.paymentProvider(transaction.paymentProvider)
    const provider = this.paymentRouter.resolveCollection(network, selection)
    const result = await provider.getPaymentStatus(providerReference)
    const status = mapRawStatusToPaymentStatus(result.transactionStatus || result.status)
    if (status === PaymentStatus.COMPLETED) {
      return this.finalizeCashDeposit(transaction.id, tenantId, agent.id)
    }
    if (FAILED_PAYMENT_STATUSES.includes(status)) {
      await this.prisma.billingTransaction.update({
        where: { id: transaction.id },
        data: { status: BillingTransactionStatus.FAILED },
      })
    }
    return { id: transaction.id, status, amountUgx: transaction.grossAmountUgx }
  }

  async initiateCommissionWithdrawal(email: string, tenantId: string, dto: AgentCommissionWithdrawalDto) {
    const agent = await this.requireAgent(email, tenantId)
    const accounting = await this.getMyAccounting(email, tenantId)
    const amountUgx = accounting.summary.mobileMoneyCommissionAvailableUgx
    if (accounting.summary.pendingCommissionWithdrawalUgx > 0) {
      throw new BadRequestException('A Mobile Money commission withdrawal is already pending.')
    }
    if (accounting.summary.mobileMoneyCommissionPendingFundingUgx > 0) {
      throw new BadRequestException('Your Mobile Money commission is recorded but the business wallet has not fully settled enough funds for this withdrawal yet.')
    }
    if (amountUgx <= 0) {
      throw new BadRequestException('There is no withdrawable Mobile Money commission yet.')
    }

    const phoneNumber = this.phoneNumbers.normalize(dto.phoneNumber)
    const wallet = await this.findOrCreateTenantWallet(tenantId)
    if (wallet.balanceUgx < amountUgx || wallet.earnedBalanceUgx < amountUgx) {
      throw new BadRequestException('The business wallet does not yet have enough settled Mobile Money earnings for this commission withdrawal.')
    }

    const reference = `AGENT-COMMISSION-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`
    const provider = this.paymentRouter.resolveDisbursement(dto.network)
    const disbursement = await this.prisma.disbursement.create({
      data: {
        tenantId,
        agentId: agent.id,
        walletId: wallet.id,
        reference,
        method: DisbursementMethod.MOBILE_MONEY,
        status: DisbursementStatus.PENDING,
        network: dto.network,
        provider: provider.provider,
        amountUgx,
        destinationReference: phoneNumber,
        notes: 'Agent Mobile Money commission withdrawal',
        metadata: { kind: COMMISSION_WITHDRAWAL_KIND } as Prisma.InputJsonValue,
      },
    })

    try {
      const result = await provider.sendMoney({
        amountUgx,
        currency: 'UGX',
        phoneNumber,
        externalReference: reference,
        narrative: `AroFi Agent commission ${agent.code}`,
        network: dto.network,
      })
      const providerReference = this.providerReference(result) || reference
      const status = mapRawStatusToPaymentStatus(result.transactionStatus || result.status)
      await this.prisma.disbursement.update({
        where: { id: disbursement.id },
        data: {
          providerReference,
          status: this.toDisbursementStatus(status),
          ...(status === PaymentStatus.COMPLETED ? { completedAt: new Date() } : {}),
          ...(status === PaymentStatus.FAILED ? { failedAt: new Date() } : {}),
        },
      })
      if (status === PaymentStatus.COMPLETED) {
        return this.finalizeCommissionWithdrawal(disbursement.id, tenantId, agent.id)
      }
      return { id: disbursement.id, status, amountUgx, phoneNumber, network: dto.network }
    } catch (error) {
      await this.prisma.disbursement.update({
        where: { id: disbursement.id },
        data: { status: DisbursementStatus.FAILED, failedAt: new Date() },
      })
      throw error
    }
  }

  async checkCommissionWithdrawal(email: string, tenantId: string, disbursementId: string) {
    const agent = await this.requireAgent(email, tenantId)
    const disbursement = await this.prisma.disbursement.findFirst({
      where: { id: disbursementId, tenantId, agentId: agent.id },
    })
    if (!disbursement) throw new NotFoundException('Commission withdrawal not found')
    if (disbursement.status === DisbursementStatus.COMPLETED) {
      return { id: disbursement.id, status: 'COMPLETED', amountUgx: disbursement.amountUgx }
    }
    if (CLOSED_DISBURSEMENT_STATUSES.includes(disbursement.status)) {
      return { id: disbursement.id, status: disbursement.status, amountUgx: disbursement.amountUgx }
    }

    const provider = this.paymentRouter.resolveDisbursement(
      disbursement.network || PaymentNetwork.UNKNOWN,
      disbursement.provider || undefined,
    )
    const result = await provider.getDisbursementStatus(disbursement.providerReference || disbursement.reference)
    const status = mapRawStatusToPaymentStatus(result.transactionStatus || result.status)
    await this.prisma.disbursement.update({
      where: { id: disbursement.id },
      data: {
        status: this.toDisbursementStatus(status),
        ...(status === PaymentStatus.COMPLETED ? { completedAt: new Date() } : {}),
        ...(status === PaymentStatus.FAILED ? { failedAt: new Date() } : {}),
      },
    })
    if (status === PaymentStatus.COMPLETED) {
      return this.finalizeCommissionWithdrawal(disbursement.id, tenantId, agent.id)
    }
    return { id: disbursement.id, status, amountUgx: disbursement.amountUgx }
  }

  private async finalizeCashDeposit(transactionId: string, tenantId: string, agentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.billingTransaction.findUnique({ where: { id: transactionId } })
      if (!transaction || transaction.tenantId !== tenantId || transaction.agentId !== agentId) {
        throw new NotFoundException('Cash deposit not found')
      }
      const settlementReference = `AGENT-CASH-DEPOSIT-${transaction.id}`
      const existing = await tx.settlement.findUnique({ where: { reference: settlementReference } })
      if (existing) {
        return {
          id: transaction.id,
          status: 'COMPLETED',
          amountUgx: transaction.grossAmountUgx,
          cashRemainingUgx: await this.cashOutstanding(tx, tenantId, agentId),
        }
      }

      const outstanding = await this.cashOutstanding(tx, tenantId, agentId)
      const amountUgx = Math.min(transaction.grossAmountUgx, outstanding)
      if (amountUgx <= 0) throw new BadRequestException('This cash balance has already been settled.')
      const wallet = await this.findOrCreateTenantWalletWithClient(tx, tenantId)
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceUgx: { increment: amountUgx },
          earnedBalanceUgx: { increment: amountUgx },
        },
      })
      await tx.billingTransaction.update({
        where: { id: transaction.id },
        data: { status: BillingTransactionStatus.COMPLETED, netAmountUgx: amountUgx },
      })
      await tx.settlement.create({
        data: {
          tenantId,
          agentId,
          walletId: wallet.id,
          reference: settlementReference,
          status: SettlementStatus.COMPLETED,
          periodStart: new Date(),
          periodEnd: new Date(),
          openingFloatUgx: outstanding,
          closingFloatUgx: Math.max(0, outstanding - amountUgx),
          grossSalesUgx: outstanding,
          commissionsUgx: 0,
          payableAmountUgx: amountUgx,
          notes: `${CASH_SETTLEMENT_MARKER}: Agent deposited outstanding cash by Mobile Money`,
        },
      })
      return {
        id: transaction.id,
        status: 'COMPLETED',
        amountUgx,
        cashRemainingUgx: Math.max(0, outstanding - amountUgx),
      }
    })
  }

  private async finalizeCommissionWithdrawal(disbursementId: string, tenantId: string, agentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const disbursement = await tx.disbursement.findUnique({ where: { id: disbursementId } })
      if (!disbursement || disbursement.tenantId !== tenantId || disbursement.agentId !== agentId) {
        throw new NotFoundException('Commission withdrawal not found')
      }
      const payoutReference = `AGENT-COMMISSION-PAYOUT-${disbursement.id}`
      const existing = await tx.billingTransaction.findUnique({ where: { externalReference: payoutReference } })
      if (existing) {
        return { id: disbursement.id, status: 'COMPLETED', amountUgx: disbursement.amountUgx }
      }

      const commissions = await tx.agentCommission.findMany({
        where: {
          tenantId,
          agentId,
          status: CommissionStatus.ACCRUED,
          sourceTransaction: { channel: BillingChannel.MOBILE_MONEY },
        },
        select: { id: true, amountUgx: true },
      })
      const available = commissions.reduce((sum, item) => sum + item.amountUgx, 0)
      if (available !== disbursement.amountUgx) {
        throw new BadRequestException('The available Mobile Money commission changed before payout completed. Manual review is required.')
      }
      const wallet = await this.findOrCreateTenantWalletWithClient(tx, tenantId)
      if (wallet.balanceUgx < disbursement.amountUgx || wallet.earnedBalanceUgx < disbursement.amountUgx) {
        throw new BadRequestException('Business wallet funds are insufficient to finalize this Agent commission withdrawal.')
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceUgx: { decrement: disbursement.amountUgx },
          earnedBalanceUgx: { decrement: disbursement.amountUgx },
        },
      })
      await tx.billingTransaction.create({
        data: {
          tenantId,
          walletId: wallet.id,
          agentId,
          channel: BillingChannel.DISBURSEMENT,
          type: BillingTransactionType.AGENT_DISBURSEMENT,
          status: BillingTransactionStatus.COMPLETED,
          grossAmountUgx: disbursement.amountUgx,
          netAmountUgx: disbursement.amountUgx,
          externalReference: payoutReference,
          paymentProvider: disbursement.provider ? String(disbursement.provider) : undefined,
          metadata: { kind: COMMISSION_WITHDRAWAL_KIND, disbursementId } as Prisma.InputJsonValue,
        },
      })
      await tx.agentCommission.updateMany({
        where: { id: { in: commissions.map((item) => item.id) } },
        data: { status: CommissionStatus.SETTLED },
      })
      await tx.disbursement.update({
        where: { id: disbursement.id },
        data: { status: DisbursementStatus.COMPLETED, completedAt: new Date() },
      })
      return { id: disbursement.id, status: 'COMPLETED', amountUgx: disbursement.amountUgx }
    })
  }

  private async cashOutstanding(tx: Prisma.TransactionClient, tenantId: string, agentId: string) {
    const [sales, settlements] = await Promise.all([
      tx.billingTransaction.findMany({
        where: {
          tenantId,
          agentId,
          status: BillingTransactionStatus.COMPLETED,
          type: BillingTransactionType.VOUCHER_SALE,
          channel: BillingChannel.VOUCHER,
        },
        include: { sourceCommission: { select: { amountUgx: true } } },
      }),
      tx.settlement.findMany({
        where: {
          tenantId,
          agentId,
          status: SettlementStatus.COMPLETED,
          notes: { startsWith: CASH_SETTLEMENT_MARKER },
        },
        select: { payableAmountUgx: true },
      }),
    ])
    const obligation = sales.reduce(
      (sum, item) => sum + Math.max(0, item.grossAmountUgx - (item.sourceCommission?.amountUgx ?? 0)),
      0,
    )
    return Math.max(0, obligation - settlements.reduce((sum, item) => sum + item.payableAmountUgx, 0))
  }

  private async requireAgent(email: string, tenantId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
    })
    if (!agent) throw new ForbiddenException('This login is not linked to an Agent profile.')
    if (agent.status !== AgentStatus.ACTIVE) throw new ForbiddenException('This Agent account is not active.')
    return agent
  }

  private async findOrCreateTenantWallet(tenantId: string) {
    return this.prisma.wallet.upsert({
      where: {
        tenantId_ownerType_ownerReference: {
          tenantId,
          ownerType: WalletOwnerType.TENANT,
          ownerReference: tenantId,
        },
      },
      update: {},
      create: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
        ownerReference: tenantId,
        balanceUgx: 0,
        earnedBalanceUgx: 0,
      },
    })
  }

  private async findOrCreateTenantWalletWithClient(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.wallet.upsert({
      where: {
        tenantId_ownerType_ownerReference: {
          tenantId,
          ownerType: WalletOwnerType.TENANT,
          ownerReference: tenantId,
        },
      },
      update: {},
      create: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
        ownerReference: tenantId,
        balanceUgx: 0,
        earnedBalanceUgx: 0,
      },
    })
  }

  private providerReference(result: {
    transactionReference?: string
    orderTrackingId?: string
    merchantReference?: string
    mnoTransactionReferenceId?: string
  }) {
    return result.transactionReference || result.orderTrackingId || result.merchantReference || result.mnoTransactionReferenceId || ''
  }

  private paymentProvider(value?: string | null) {
    if (!value) return undefined
    return (Object.values(PaymentProvider) as string[]).includes(value)
      ? (value as PaymentProvider)
      : undefined
  }

  private toBillingStatus(status: PaymentStatus) {
    return status === PaymentStatus.COMPLETED
      ? BillingTransactionStatus.COMPLETED
      : FAILED_PAYMENT_STATUSES.includes(status)
        ? BillingTransactionStatus.FAILED
        : BillingTransactionStatus.PENDING
  }

  private toDisbursementStatus(status: PaymentStatus) {
    if (status === PaymentStatus.COMPLETED) return DisbursementStatus.COMPLETED
    if (FAILED_PAYMENT_STATUSES.includes(status)) {
      return DisbursementStatus.FAILED
    }
    return DisbursementStatus.PROCESSING
  }

  private metadata(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  }

  private metadataString(value: Prisma.JsonValue | null | undefined, key: string) {
    const item = this.metadata(value)[key]
    return typeof item === 'string' ? item : undefined
  }
}
