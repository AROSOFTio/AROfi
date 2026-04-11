import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  AgentStatus,
  AgentType,
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  CommissionStatus,
  DisbursementMethod,
  DisbursementStatus,
  Prisma,
  SettlementStatus,
  WalletOwnerType,
} from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { BillingPostingService } from '../billing/billing-posting.service'
import { LEDGER_ACCOUNTS } from '../billing/billing.constants'
import { AgentFloatAdjustmentDto } from './dto/agent-float-adjustment.dto'
import { CreateAgentDto } from './dto/create-agent.dto'
import { CreateDisbursementDto } from './dto/create-disbursement.dto'
import { CreateSettlementDto } from './dto/create-settlement.dto'

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingPostingService: BillingPostingService,
  ) {}

  async getOverview(tenantId?: string) {
    const [agents, recentCommissions, recentDisbursements] = await Promise.all([
      this.prisma.agent.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: { select: { id: true, name: true } },
          wallet: { select: { id: true, balanceUgx: true, currency: true } },
          commissions: { select: { id: true, status: true, amountUgx: true, createdAt: true } },
          transactions: {
            where: {
              type: {
                in: [BillingTransactionType.MOBILE_MONEY_SALE, BillingTransactionType.VOUCHER_SALE],
              },
              status: BillingTransactionStatus.COMPLETED,
            },
            select: { id: true, grossAmountUgx: true },
          },
          disbursements: {
            where: { status: DisbursementStatus.COMPLETED },
            select: { id: true, amountUgx: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.agentCommission.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: { select: { id: true, name: true } },
          agent: { select: { id: true, code: true, name: true } },
          sourceTransaction: {
            select: { id: true, type: true, grossAmountUgx: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      this.prisma.disbursement.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: { select: { id: true, name: true } },
          agent: { select: { id: true, code: true, name: true } },
          settlement: { select: { id: true, reference: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ])

    const items = agents.map((agent) => {
      const accruedCommissionUgx = agent.commissions
        .filter((commission) => commission.status === CommissionStatus.ACCRUED)
        .reduce((total, commission) => total + commission.amountUgx, 0)
      const settledCommissionUgx = agent.commissions
        .filter((commission) => commission.status === CommissionStatus.SETTLED)
        .reduce((total, commission) => total + commission.amountUgx, 0)
      const walletBalanceUgx = agent.wallet?.balanceUgx ?? 0

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
        floatLimitUgx: agent.floatLimitUgx,
        notes: agent.notes,
        createdAt: agent.createdAt,
        tenant: agent.tenant,
        wallet: agent.wallet,
        walletBalanceUgx,
        availableFloatUgx: Math.max(walletBalanceUgx - accruedCommissionUgx, 0),
        accruedCommissionUgx,
        settledCommissionUgx,
        lifetimeSalesUgx: agent.transactions.reduce((total, transaction) => total + transaction.grossAmountUgx, 0),
        lifetimeCommissionUgx: agent.commissions.reduce((total, commission) => total + commission.amountUgx, 0),
        totalDisbursedUgx: agent.disbursements.reduce((total, disbursement) => total + disbursement.amountUgx, 0),
      }
    })

    return {
      summary: {
        totalAgents: items.length,
        activeAgents: items.filter((agent) => agent.status === AgentStatus.ACTIVE).length,
        resellers: items.filter((agent) => agent.type === AgentType.RESELLER).length,
        totalFloatUgx: items.reduce((total, agent) => total + agent.walletBalanceUgx, 0),
        accruedCommissionUgx: items.reduce((total, agent) => total + agent.accruedCommissionUgx, 0),
        totalDisbursedUgx: items.reduce((total, agent) => total + agent.totalDisbursedUgx, 0),
      },
      agents: items,
      recentCommissions,
      recentDisbursements,
    }
  }

  async getFloatOverview(tenantId?: string) {
    const [tenantWallets, agentsOverview, movements] = await Promise.all([
      this.prisma.wallet.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ownerType: WalletOwnerType.TENANT,
        },
        include: {
          tenant: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.getOverview(tenantId),
      this.prisma.billingTransaction.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          type: {
            in: [
              BillingTransactionType.AGENT_FLOAT_TOPUP,
              BillingTransactionType.AGENT_FLOAT_RETURN,
              BillingTransactionType.AGENT_COMMISSION,
              BillingTransactionType.AGENT_DISBURSEMENT,
            ],
          },
        },
        include: {
          tenant: { select: { id: true, name: true } },
          agent: { select: { id: true, code: true, name: true } },
          wallet: { select: { id: true, balanceUgx: true, currency: true } },
          ledgerTransaction: { select: { reference: true, description: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    return {
      summary: {
        tenantWalletBalanceUgx: tenantWallets.reduce((total, wallet) => total + wallet.balanceUgx, 0),
        totalAgentWalletBalanceUgx: agentsOverview.agents.reduce((total, agent) => total + agent.walletBalanceUgx, 0),
        reservedCommissionUgx: agentsOverview.summary.accruedCommissionUgx,
        workingFloatUgx: agentsOverview.agents.reduce((total, agent) => total + agent.availableFloatUgx, 0),
        activeAgents: agentsOverview.summary.activeAgents,
      },
      tenantWallets,
      agents: agentsOverview.agents,
      movements,
    }
  }

  async getDisbursementOverview(tenantId?: string) {
    const [settlements, disbursements] = await Promise.all([
      this.prisma.settlement.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: { select: { id: true, name: true } },
          agent: { select: { id: true, code: true, name: true, phoneNumber: true } },
          disbursements: { select: { id: true, amountUgx: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.disbursement.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: { select: { id: true, name: true } },
          agent: { select: { id: true, code: true, name: true, phoneNumber: true } },
          settlement: { select: { id: true, reference: true, payableAmountUgx: true } },
          billingTransaction: { select: { id: true, externalReference: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return {
      summary: {
        totalSettlements: settlements.length,
        readySettlements: settlements.filter((settlement) => settlement.status === SettlementStatus.READY).length,
        processingSettlements: settlements.filter((settlement) => settlement.status === SettlementStatus.PROCESSING).length,
        totalPayableUgx: settlements.reduce((total, settlement) => total + settlement.payableAmountUgx, 0),
        totalDisbursedUgx: disbursements
          .filter((disbursement) => disbursement.status === DisbursementStatus.COMPLETED)
          .reduce((total, disbursement) => total + disbursement.amountUgx, 0),
        pendingDisbursementUgx: disbursements
          .filter(
            (disbursement) =>
              disbursement.status === DisbursementStatus.PENDING ||
              disbursement.status === DisbursementStatus.PROCESSING,
          )
          .reduce((total, disbursement) => total + disbursement.amountUgx, 0),
      },
      settlements: settlements.map((settlement) => ({
        ...settlement,
        disbursedAmountUgx: settlement.disbursements
          .filter((disbursement) => disbursement.status === DisbursementStatus.COMPLETED)
          .reduce((total, disbursement) => total + disbursement.amountUgx, 0),
      })),
      disbursements,
    }
  }

  async createAgent(dto: CreateAgentDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    })

    if (!tenant) {
      throw new NotFoundException('Tenant not found')
    }

    const normalizedPhone = this.normalizePhoneNumber(dto.phoneNumber)

    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          tenantId: dto.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          phoneNumber: normalizedPhone,
          email: dto.email?.trim(),
          type: dto.type,
          territory: dto.territory?.trim(),
          commissionRateBps: dto.commissionRateBps,
          floatLimitUgx: dto.floatLimitUgx,
          notes: dto.notes?.trim(),
        },
      })

      const wallet = await tx.wallet.create({
        data: {
          tenantId: dto.tenantId,
          ownerType: WalletOwnerType.AGENT,
          ownerReference: agent.id,
          agentId: agent.id,
        },
      })

      return {
        ...agent,
        wallet,
        tenant: {
          id: tenant.id,
          name: tenant.name,
        },
      }
    })
  }

  async loadFloat(agentId: string, dto: AgentFloatAdjustmentDto, tenantId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.getAgentForUpdate(tx, agentId, tenantId)
      const tenantWallet = await this.findOrCreateTenantWallet(tx, agent.tenantId)
      const agentWallet = await this.findOrCreateAgentWallet(tx, agent)

      if (tenantWallet.balanceUgx < dto.amountUgx) {
        throw new BadRequestException('Tenant wallet does not have enough float for this top-up')
      }

      if (agent.floatLimitUgx > 0 && agentWallet.balanceUgx + dto.amountUgx > agent.floatLimitUgx) {
        throw new BadRequestException('Float top-up exceeds the configured agent float limit')
      }

      const description = dto.notes?.trim() || `Float top-up for ${agent.name}`
      const posting = this.billingPostingService.buildFloatTransferPosting({
        tenantId: agent.tenantId,
        sourceWalletId: tenantWallet.id,
        destinationWalletId: agentWallet.id,
        sourceAccountCode: LEDGER_ACCOUNTS.tenantWallet,
        destinationAccountCode: LEDGER_ACCOUNTS.agentWallet,
        amountUgx: dto.amountUgx,
        description,
      })

      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          tenantId: agent.tenantId,
          walletId: agentWallet.id,
          reference: `LEDGER-FLOAT-${randomUUID()}`,
          type: posting.ledgerType,
          channel: posting.channel,
          description: posting.description,
          grossAmountUgx: posting.grossAmountUgx,
          feeAmountUgx: posting.feeAmountUgx,
          netAmountUgx: posting.netAmountUgx,
          sourceType: 'AgentFloatTopUp',
          sourceId: agent.id,
          metadata: this.toJsonValue({
            agentId: agent.id,
            sourceWalletId: tenantWallet.id,
            destinationWalletId: agentWallet.id,
          }),
          entries: {
            create: posting.entries,
          },
        },
      })

      const [updatedTenantWallet, updatedAgentWallet, billingTransaction] = await Promise.all([
        tx.wallet.update({
          where: { id: tenantWallet.id },
          data: { balanceUgx: { increment: posting.sourceWalletDeltaUgx } },
        }),
        tx.wallet.update({
          where: { id: agentWallet.id },
          data: { balanceUgx: { increment: posting.destinationWalletDeltaUgx } },
        }),
        tx.billingTransaction.create({
          data: {
            tenantId: agent.tenantId,
            walletId: agentWallet.id,
            agentId: agent.id,
            ledgerTransactionId: ledgerTransaction.id,
            channel: BillingChannel.FLOAT_TRANSFER,
            type: BillingTransactionType.AGENT_FLOAT_TOPUP,
            status: BillingTransactionStatus.COMPLETED,
            grossAmountUgx: posting.grossAmountUgx,
            feeAmountUgx: posting.feeAmountUgx,
            netAmountUgx: posting.destinationWalletDeltaUgx,
            customerReference: agent.phoneNumber,
            externalReference: `AGENT-FLOAT-TOPUP-${randomUUID()}`,
            paymentProvider: 'Internal',
            metadata: this.toJsonValue({
              agentId: agent.id,
              notes: dto.notes,
            }),
          },
          include: {
            ledgerTransaction: { select: { reference: true, description: true } },
          },
        }),
      ])

      return {
        agent: {
          id: agent.id,
          code: agent.code,
          name: agent.name,
          phoneNumber: agent.phoneNumber,
        },
        tenantWallet: updatedTenantWallet,
        agentWallet: updatedAgentWallet,
        billingTransaction,
      }
    })
  }

  async returnFloat(agentId: string, dto: AgentFloatAdjustmentDto, tenantId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.getAgentForUpdate(tx, agentId, tenantId)
      const tenantWallet = await this.findOrCreateTenantWallet(tx, agent.tenantId)
      const agentWallet = await this.findOrCreateAgentWallet(tx, agent)
      const accruedCommissionUgx = await this.getAccruedCommissionTotal(tx, agent.id)
      const availableFloatUgx = Math.max(agentWallet.balanceUgx - accruedCommissionUgx, 0)

      if (dto.amountUgx > availableFloatUgx) {
        throw new BadRequestException('The requested float return would consume accrued commission funds')
      }

      const description = dto.notes?.trim() || `Float return from ${agent.name}`
      const posting = this.billingPostingService.buildFloatTransferPosting({
        tenantId: agent.tenantId,
        sourceWalletId: agentWallet.id,
        destinationWalletId: tenantWallet.id,
        sourceAccountCode: LEDGER_ACCOUNTS.agentWallet,
        destinationAccountCode: LEDGER_ACCOUNTS.tenantWallet,
        amountUgx: dto.amountUgx,
        description,
      })

      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          tenantId: agent.tenantId,
          walletId: agentWallet.id,
          reference: `LEDGER-FLOAT-RETURN-${randomUUID()}`,
          type: posting.ledgerType,
          channel: posting.channel,
          description: posting.description,
          grossAmountUgx: posting.grossAmountUgx,
          feeAmountUgx: posting.feeAmountUgx,
          netAmountUgx: -posting.grossAmountUgx,
          sourceType: 'AgentFloatReturn',
          sourceId: agent.id,
          metadata: this.toJsonValue({
            agentId: agent.id,
            sourceWalletId: agentWallet.id,
            destinationWalletId: tenantWallet.id,
          }),
          entries: {
            create: posting.entries,
          },
        },
      })

      const [updatedAgentWallet, updatedTenantWallet, billingTransaction] = await Promise.all([
        tx.wallet.update({
          where: { id: agentWallet.id },
          data: { balanceUgx: { increment: posting.sourceWalletDeltaUgx } },
        }),
        tx.wallet.update({
          where: { id: tenantWallet.id },
          data: { balanceUgx: { increment: posting.destinationWalletDeltaUgx } },
        }),
        tx.billingTransaction.create({
          data: {
            tenantId: agent.tenantId,
            walletId: agentWallet.id,
            agentId: agent.id,
            ledgerTransactionId: ledgerTransaction.id,
            channel: BillingChannel.FLOAT_TRANSFER,
            type: BillingTransactionType.AGENT_FLOAT_RETURN,
            status: BillingTransactionStatus.COMPLETED,
            grossAmountUgx: posting.grossAmountUgx,
            feeAmountUgx: posting.feeAmountUgx,
            netAmountUgx: posting.sourceWalletDeltaUgx,
            customerReference: agent.phoneNumber,
            externalReference: `AGENT-FLOAT-RETURN-${randomUUID()}`,
            paymentProvider: 'Internal',
            metadata: this.toJsonValue({
              agentId: agent.id,
              notes: dto.notes,
            }),
          },
          include: {
            ledgerTransaction: { select: { reference: true, description: true } },
          },
        }),
      ])

      return {
        agent: {
          id: agent.id,
          code: agent.code,
          name: agent.name,
          phoneNumber: agent.phoneNumber,
        },
        tenantWallet: updatedTenantWallet,
        agentWallet: updatedAgentWallet,
        billingTransaction,
      }
    })
  }

  async createSettlement(agentId: string, dto: CreateSettlementDto, tenantId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.getAgentForUpdate(tx, agentId, tenantId)
      const wallet = await this.findOrCreateAgentWallet(tx, agent)

      const periodStart = dto.periodStart ? new Date(dto.periodStart) : undefined
      const periodEnd = dto.periodEnd ? new Date(dto.periodEnd) : undefined

      if (periodStart && periodEnd && periodEnd < periodStart) {
        throw new BadRequestException('Settlement period end must be after the period start')
      }

      const commissions = await tx.agentCommission.findMany({
        where: {
          agentId: agent.id,
          status: CommissionStatus.ACCRUED,
          settlementId: null,
          ...(periodStart || periodEnd
            ? {
                createdAt: {
                  ...(periodStart ? { gte: periodStart } : {}),
                  ...(periodEnd ? { lte: periodEnd } : {}),
                },
              }
            : {}),
        },
        include: {
          sourceTransaction: { select: { id: true, grossAmountUgx: true } },
        },
        orderBy: { createdAt: 'asc' },
      })

      if (commissions.length === 0) {
        throw new BadRequestException('There are no accrued commissions available to settle for this agent')
      }

      const payableAmountUgx = commissions.reduce((total, commission) => total + commission.amountUgx, 0)
      const grossSalesUgx = commissions.reduce(
        (total, commission) => total + (commission.sourceTransaction?.grossAmountUgx ?? 0),
        0,
      )

      const settlement = await tx.settlement.create({
        data: {
          tenantId: agent.tenantId,
          agentId: agent.id,
          walletId: wallet.id,
          reference: `SET-${agent.code}-${Date.now()}`,
          status: SettlementStatus.READY,
          periodStart: periodStart ?? commissions[0].createdAt,
          periodEnd: periodEnd ?? commissions[commissions.length - 1].createdAt,
          openingFloatUgx: Math.max(wallet.balanceUgx - payableAmountUgx, 0),
          closingFloatUgx: wallet.balanceUgx,
          grossSalesUgx,
          commissionsUgx: payableAmountUgx,
          payableAmountUgx,
          notes: dto.notes?.trim(),
        },
      })

      await tx.agentCommission.updateMany({
        where: {
          id: { in: commissions.map((commission) => commission.id) },
        },
        data: {
          settlementId: settlement.id,
        },
      })

      return tx.settlement.findUnique({
        where: { id: settlement.id },
        include: {
          tenant: { select: { id: true, name: true } },
          agent: { select: { id: true, code: true, name: true, phoneNumber: true } },
          disbursements: { orderBy: { createdAt: 'desc' } },
          commissions: { orderBy: { createdAt: 'asc' } },
        },
      })
    })
  }

  async createDisbursement(agentId: string, dto: CreateDisbursementDto, tenantId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await this.getAgentForUpdate(tx, agentId, tenantId)
      const wallet = await this.findOrCreateAgentWallet(tx, agent)
      const settlement = await this.resolveSettlement(tx, agent.id, dto.settlementId)

      const disbursedSoFar = settlement.disbursements
        .filter((item) => item.status !== DisbursementStatus.FAILED && item.status !== DisbursementStatus.CANCELLED)
        .reduce((total, item) => total + item.amountUgx, 0)
      const remainingAmountUgx = settlement.payableAmountUgx - disbursedSoFar

      if (remainingAmountUgx <= 0) {
        throw new BadRequestException('This settlement has already been fully disbursed')
      }

      if (dto.amountUgx > remainingAmountUgx) {
        throw new BadRequestException('Disbursement amount exceeds the remaining payable balance')
      }

      if (wallet.balanceUgx < dto.amountUgx) {
        throw new BadRequestException('Agent wallet does not have enough balance to cover this disbursement')
      }

      const description = dto.notes?.trim() || `Commission disbursement for ${agent.name}`
      const posting = this.billingPostingService.buildDisbursementPosting({
        tenantId: agent.tenantId,
        walletId: wallet.id,
        amountUgx: dto.amountUgx,
        description,
      })

      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          tenantId: agent.tenantId,
          walletId: wallet.id,
          reference: `LEDGER-DISBURSE-${randomUUID()}`,
          type: posting.ledgerType,
          channel: posting.channel,
          description: posting.description,
          grossAmountUgx: posting.grossAmountUgx,
          feeAmountUgx: posting.feeAmountUgx,
          netAmountUgx: posting.netAmountUgx,
          sourceType: 'AgentDisbursement',
          sourceId: settlement.id,
          metadata: this.toJsonValue({
            agentId: agent.id,
            settlementId: settlement.id,
            method: dto.method ?? DisbursementMethod.MOBILE_MONEY,
          }),
          entries: {
            create: posting.entries,
          },
        },
      })

      const billingTransaction = await tx.billingTransaction.create({
        data: {
          tenantId: agent.tenantId,
          walletId: wallet.id,
          agentId: agent.id,
          ledgerTransactionId: ledgerTransaction.id,
          channel: BillingChannel.DISBURSEMENT,
          type: BillingTransactionType.AGENT_DISBURSEMENT,
          status: BillingTransactionStatus.COMPLETED,
          grossAmountUgx: posting.grossAmountUgx,
          feeAmountUgx: posting.feeAmountUgx,
          netAmountUgx: posting.netAmountUgx,
          customerReference: agent.phoneNumber,
          externalReference: `AGENT-DISBURSE-${randomUUID()}`,
          paymentProvider: 'Internal',
          metadata: this.toJsonValue({
            agentId: agent.id,
            settlementId: settlement.id,
            method: dto.method ?? DisbursementMethod.MOBILE_MONEY,
            destinationReference: dto.destinationReference,
            providerReference: dto.providerReference,
          }),
        },
      })

      const disbursement = await tx.disbursement.create({
        data: {
          tenantId: agent.tenantId,
          agentId: agent.id,
          settlementId: settlement.id,
          walletId: wallet.id,
          billingTransactionId: billingTransaction.id,
          reference: `DIS-${agent.code}-${Date.now()}`,
          method: dto.method ?? DisbursementMethod.MOBILE_MONEY,
          status: DisbursementStatus.COMPLETED,
          amountUgx: dto.amountUgx,
          destinationReference: dto.destinationReference ?? agent.phoneNumber,
          providerReference: dto.providerReference,
          notes: dto.notes?.trim(),
          metadata: this.toJsonValue({
            agentId: agent.id,
            settlementReference: settlement.reference,
          }),
          completedAt: new Date(),
        },
        include: {
          tenant: { select: { id: true, name: true } },
          agent: { select: { id: true, code: true, name: true, phoneNumber: true } },
          settlement: { select: { id: true, reference: true, payableAmountUgx: true } },
          billingTransaction: { select: { id: true, externalReference: true, status: true } },
        },
      })

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceUgx: {
            increment: posting.walletDeltaUgx,
          },
        },
      })

      const updatedDisbursedAmountUgx = disbursedSoFar + dto.amountUgx
      const settlementStatus =
        updatedDisbursedAmountUgx >= settlement.payableAmountUgx
          ? SettlementStatus.COMPLETED
          : SettlementStatus.PROCESSING

      await tx.settlement.update({
        where: { id: settlement.id },
        data: {
          status: settlementStatus,
        },
      })

      if (settlementStatus === SettlementStatus.COMPLETED) {
        await tx.agentCommission.updateMany({
          where: {
            settlementId: settlement.id,
            status: CommissionStatus.ACCRUED,
          },
          data: {
            status: CommissionStatus.SETTLED,
          },
        })
      }

      return {
        ...disbursement,
        wallet: {
          id: updatedWallet.id,
          balanceUgx: updatedWallet.balanceUgx,
          currency: updatedWallet.currency,
        },
      }
    })
  }

  private async getAgentForUpdate(
    tx: Prisma.TransactionClient,
    agentId: string,
    tenantId?: string,
  ) {
    const agent = await tx.agent.findUnique({
      where: { id: agentId },
    })

    if (!agent) {
      throw new NotFoundException('Agent not found')
    }

    if (tenantId && agent.tenantId !== tenantId) {
      throw new NotFoundException('Agent not found')
    }

    if (agent.status !== AgentStatus.ACTIVE) {
      throw new BadRequestException('Only active agents can process float or disbursement operations')
    }

    return agent
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
    agent: { id: string; tenantId: string },
  ) {
    const existingWallet = await tx.wallet.findFirst({
      where: {
        tenantId: agent.tenantId,
        ownerType: WalletOwnerType.AGENT,
        ownerReference: agent.id,
      },
    })

    if (existingWallet) {
      return existingWallet
    }

    return tx.wallet.create({
      data: {
        tenantId: agent.tenantId,
        ownerType: WalletOwnerType.AGENT,
        ownerReference: agent.id,
        agentId: agent.id,
      },
    })
  }

  private async getAccruedCommissionTotal(tx: Prisma.TransactionClient, agentId: string) {
    const aggregate = await tx.agentCommission.aggregate({
      where: {
        agentId,
        status: CommissionStatus.ACCRUED,
      },
      _sum: {
        amountUgx: true,
      },
    })

    return aggregate._sum.amountUgx ?? 0
  }

  private async resolveSettlement(
    tx: Prisma.TransactionClient,
    agentId: string,
    settlementId?: string,
  ) {
    const settlement = settlementId
      ? await tx.settlement.findUnique({
          where: { id: settlementId },
          include: {
            disbursements: true,
          },
        })
      : await tx.settlement.findFirst({
          where: {
            agentId,
            status: {
              in: [SettlementStatus.READY, SettlementStatus.PROCESSING],
            },
          },
          include: {
            disbursements: true,
          },
          orderBy: { createdAt: 'desc' },
        })

    if (!settlement || settlement.agentId !== agentId) {
      throw new NotFoundException('Settlement not found for agent')
    }

    if (settlement.status !== SettlementStatus.READY && settlement.status !== SettlementStatus.PROCESSING) {
      throw new BadRequestException('Settlement is not open for disbursement')
    }

    return settlement
  }

  private normalizePhoneNumber(phoneNumber: string) {
    const digits = phoneNumber.replace(/\D/g, '')

    if (/^256\d{9}$/.test(digits)) {
      return digits
    }

    if (/^0\d{9}$/.test(digits)) {
      return `256${digits.slice(1)}`
    }

    if (/^7\d{8}$/.test(digits)) {
      return `256${digits}`
    }

    throw new BadRequestException('Phone number must be a valid Uganda mobile number')
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue
  }
}
