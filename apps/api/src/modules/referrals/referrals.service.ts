import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  AuditSeverity,
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  DisbursementMethod,
  DisbursementStatus,
  LedgerDirection,
  LedgerTransactionType,
  NotificationAudience,
  PayoutNumberStatus,
  Prisma,
  ReferralCommissionStatus,
  ReferralRelationshipStatus,
  ReferralProfileStatus,
  ReferralWalletTransactionStatus,
  ReferralWalletTransactionType,
  SubscriptionPlanTier,
} from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { WalletsService } from '../wallets/wallets.service'

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletsService: WalletsService,
  ) {}

  async recordQualifiedSubscriptionPayment(input: {
    tenantId: string
    subscriptionPaymentId: string
    plan: SubscriptionPlanTier
    amountUgx: number
    paidAt: Date
    tx?: Prisma.TransactionClient
  }) {
    if (input.plan !== SubscriptionPlanTier.PRO) {
      return null
    }

    const client = input.tx ?? this.prisma
    const settings = await client.platformSetting.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global' },
      select: {
        referralProgramEnabled: true,
        referralCommissionBps: true,
        referralCommissionBasis: true,
        referralHoldingPeriodDays: true,
      },
    })
    if (!settings.referralProgramEnabled || settings.referralCommissionBps <= 0) {
      return null
    }

    const relationship = await client.referralRelationship.findUnique({
      where: { referredTenantId: input.tenantId },
      include: { referrerProfile: { include: { user: { select: { id: true } } } } },
    })
    if (!relationship || relationship.status === ReferralRelationshipStatus.REJECTED || relationship.status === ReferralRelationshipStatus.SUSPICIOUS) {
      return null
    }

    const existing = await client.referralCommission.findUnique({
      where: { subscriptionPaymentId: input.subscriptionPaymentId },
      select: { id: true, amountUgx: true },
    })
    if (existing) {
      return existing
    }

    const amountUgx = Math.round((input.amountUgx * settings.referralCommissionBps) / 10000)
    if (amountUgx <= 0) {
      return null
    }

    const holdUntil = settings.referralHoldingPeriodDays > 0
      ? new Date(input.paidAt.getTime() + settings.referralHoldingPeriodDays * 24 * 60 * 60 * 1000)
      : null
    const immediatelyAvailable = !holdUntil || holdUntil <= input.paidAt
    const status = immediatelyAvailable ? ReferralCommissionStatus.AVAILABLE : ReferralCommissionStatus.APPROVED
    const profileBefore = await client.referralProfile.findUniqueOrThrow({
      where: { id: relationship.referrerProfileId },
      select: { pendingBalanceUgx: true, availableBalanceUgx: true },
    })

    const commission = await client.referralCommission.create({
      data: {
        referrerProfileId: relationship.referrerProfileId,
        relationshipId: relationship.id,
        subscriptionPaymentId: input.subscriptionPaymentId,
        status,
        basisType: settings.referralCommissionBasis,
        basisAmountUgx: input.amountUgx,
        rateBps: settings.referralCommissionBps,
        amountUgx,
        holdUntil,
        approvedAt: input.paidAt,
        availableAt: immediatelyAvailable ? input.paidAt : null,
      },
    })

    await client.referralRelationship.update({
      where: { id: relationship.id },
      data: {
        status: ReferralRelationshipStatus.QUALIFIED,
        qualifiedAt: input.paidAt,
      },
    })

    if (immediatelyAvailable) {
      await client.referralProfile.update({
        where: { id: relationship.referrerProfileId },
        data: { availableBalanceUgx: { increment: amountUgx } },
      })
      await client.referralWalletTransaction.create({
        data: {
          referrerProfileId: relationship.referrerProfileId,
          relationshipId: relationship.id,
          commissionId: commission.id,
          type: ReferralWalletTransactionType.AVAILABLE_COMMISSION,
          status: ReferralWalletTransactionStatus.AVAILABLE,
          amountUgx,
          previousBalanceUgx: profileBefore.availableBalanceUgx,
          newBalanceUgx: profileBefore.availableBalanceUgx + amountUgx,
          description: 'Referral commission credited after confirmed Pro subscription payment',
        },
      })
    } else {
      await client.referralProfile.update({
        where: { id: relationship.referrerProfileId },
        data: { pendingBalanceUgx: { increment: amountUgx } },
      })
      await client.referralWalletTransaction.create({
        data: {
          referrerProfileId: relationship.referrerProfileId,
          relationshipId: relationship.id,
          commissionId: commission.id,
          type: ReferralWalletTransactionType.APPROVED_COMMISSION,
          status: ReferralWalletTransactionStatus.APPROVED,
          amountUgx,
          previousBalanceUgx: profileBefore.pendingBalanceUgx,
          newBalanceUgx: profileBefore.pendingBalanceUgx + amountUgx,
          description: 'Referral commission approved and waiting for holding period',
        },
      })
    }

    await client.notification.create({
      data: {
        title: immediatelyAvailable ? 'Referral commission credited' : 'Referral commission approved',
        body: `A referred business completed a qualifying Pro subscription payment. Referral commission: UGX ${amountUgx.toLocaleString('en-UG')}.`,
        audience: NotificationAudience.SINGLE_BUSINESS,
        tenantId: relationship.referrerProfile.tenantId,
      },
    })

    await client.auditLog.create({
      data: {
        tenantId: relationship.referrerProfile.tenantId,
        userId: relationship.referrerProfile.user.id,
        action: immediatelyAvailable ? 'referral.commission_credited' : 'referral.commission_approved',
        entity: 'ReferralCommission',
        entityId: commission.id,
        severity: AuditSeverity.INFO,
        details: {
          relationshipId: relationship.id,
          subscriptionPaymentId: input.subscriptionPaymentId,
          basisType: settings.referralCommissionBasis,
          basisAmountUgx: input.amountUgx,
          rateBps: settings.referralCommissionBps,
          amountUgx,
          holdUntil,
          availableImmediately: immediatelyAvailable,
        },
      },
    })

    return commission
  }

  async getMyDashboard(userId: string, origin = 'https://arofi.net') {
    const profile = await this.ensureProfile(userId)
    const [relationships, commissions, transactions, payoutNumbers] = await Promise.all([
      this.prisma.referralRelationship.findMany({
        where: { referrerProfileId: profile.id },
        include: {
          referredTenant: { select: { id: true, name: true, createdAt: true } },
          referredUser: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.referralCommission.findMany({
        where: { referrerProfileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.referralWalletTransaction.findMany({
        where: { referrerProfileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      profile.tenantId
        ? this.prisma.tenantPayoutNumber.findMany({
            where: { tenantId: profile.tenantId, status: PayoutNumberStatus.VERIFIED, verifiedAt: { not: null } },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 2,
            select: { id: true, network: true, normalizedPhone: true, label: true, isPrimary: true },
          })
        : [],
    ])

    const referralLink = `${origin.replace(/\/$/, '')}/register?ref=${encodeURIComponent(profile.code)}`
    return {
      profile: {
        id: profile.id,
        code: profile.code,
        status: profile.status,
        referralLink,
        availableBalanceUgx: profile.availableBalanceUgx,
        pendingBalanceUgx: profile.pendingBalanceUgx,
        withdrawnAmountUgx: profile.withdrawnAmountUgx,
        registeredPayoutPhone: profile.registeredPayoutPhone,
      },
      summary: {
        totalReferredAccounts: relationships.length,
        pendingReferrals: relationships.filter((item) => item.status === ReferralRelationshipStatus.PENDING).length,
        successfulReferrals: relationships.filter((item) => item.status === ReferralRelationshipStatus.QUALIFIED).length,
        rejectedOrInvalidReferrals: relationships.filter((item) =>
          item.status === ReferralRelationshipStatus.REJECTED || item.status === ReferralRelationshipStatus.SUSPICIOUS,
        ).length,
        totalReferralEarningsUgx: commissions
          .filter((item) => item.status !== ReferralCommissionStatus.REVERSED)
          .reduce((total, item) => total + item.amountUgx, 0),
        pendingCommissionUgx: commissions
          .filter((item) => item.status === ReferralCommissionStatus.PENDING || item.status === ReferralCommissionStatus.APPROVED)
          .reduce((total, item) => total + item.amountUgx, 0),
        availableWalletBalanceUgx: profile.availableBalanceUgx,
        withdrawnAmountUgx: profile.withdrawnAmountUgx,
      },
      referrals: relationships.map((relationship) => ({
        id: relationship.id,
        status: relationship.status,
        referredBusiness: relationship.referredTenant?.name ?? null,
        referredPerson: relationship.referredUser
          ? [relationship.referredUser.firstName, relationship.referredUser.lastName].filter(Boolean).join(' ') || relationship.referredUser.email
          : null,
        suspiciousReason: relationship.suspiciousReason,
        createdAt: relationship.createdAt,
        qualifiedAt: relationship.qualifiedAt,
      })),
      commissions,
      walletTransactions: transactions,
      payoutNumbers,
    }
  }

  async listForAdmin() {
    const [profiles, relationships, commissions, transactions] = await Promise.all([
      this.prisma.referralProfile.findMany({
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, accountType: true, tenant: { select: { id: true, name: true } } } },
          _count: { select: { referrals: true, commissions: true, walletTransactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.referralRelationship.findMany({
        include: {
          referrerProfile: { select: { code: true, user: { select: { email: true } } } },
          referredTenant: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.referralCommission.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.referralWalletTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    return {
      summary: {
        referrers: profiles.length,
        resellerAccounts: profiles.filter((profile) => profile.user.accountType === 'RESELLER').length,
        referredCustomers: relationships.length,
        pendingCommissions: commissions.filter((item) => item.status === ReferralCommissionStatus.PENDING).length,
        availableWalletBalancesUgx: profiles.reduce((total, profile) => total + profile.availableBalanceUgx, 0),
        suspiciousReferrals: relationships.filter((item) => item.status === ReferralRelationshipStatus.SUSPICIOUS).length,
      },
      profiles,
      relationships,
      commissions,
      walletTransactions: transactions,
    }
  }

  async exportReferralsCsv() {
    const rows = await this.prisma.referralRelationship.findMany({
      include: {
        referrerProfile: { select: { code: true, user: { select: { email: true, firstName: true, lastName: true, accountType: true } } } },
        referredTenant: { select: { name: true, domain: true } },
        referredUser: { select: { email: true, firstName: true, lastName: true, accountType: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    const csv = this.toCsv([
      ['Referral Code', 'Referrer Email', 'Referrer Name', 'Referred Business', 'Referred Email', 'Status', 'Suspicious Reason', 'Registered At', 'Qualified At'],
      ...rows.map((row) => [
        row.referralCode,
        row.referrerProfile.user.email,
        [row.referrerProfile.user.firstName, row.referrerProfile.user.lastName].filter(Boolean).join(' '),
        row.referredTenant?.name ?? '',
        row.referredUser?.email ?? '',
        row.status,
        row.suspiciousReason ?? '',
        row.createdAt.toISOString(),
        row.qualifiedAt?.toISOString() ?? '',
      ]),
    ])
    return { filename: `referral-report-${new Date().toISOString().slice(0, 10)}.csv`, contentType: 'text/csv; charset=utf-8', buffer: Buffer.from(csv) }
  }

  async exportWithdrawalsCsv() {
    const rows = await this.prisma.referralWalletTransaction.findMany({
      where: { type: { in: [ReferralWalletTransactionType.WITHDRAWAL_REQUEST, ReferralWalletTransactionType.WITHDRAWAL_PROCESSING, ReferralWalletTransactionType.PAID_WITHDRAWAL, ReferralWalletTransactionType.FAILED_WITHDRAWAL, ReferralWalletTransactionType.REJECTED_WITHDRAWAL] } },
      include: { referrerProfile: { select: { code: true, user: { select: { email: true, firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'desc' },
    })
    const csv = this.toCsv([
      ['Referral Code', 'Partner Email', 'Partner Name', 'Type', 'Status', 'Amount UGX', 'Previous Balance UGX', 'New Balance UGX', 'Description', 'Created At'],
      ...rows.map((row) => [
        row.referrerProfile.code,
        row.referrerProfile.user.email,
        [row.referrerProfile.user.firstName, row.referrerProfile.user.lastName].filter(Boolean).join(' '),
        row.type,
        row.status,
        row.amountUgx,
        row.previousBalanceUgx,
        row.newBalanceUgx,
        row.description,
        row.createdAt.toISOString(),
      ]),
    ])
    return { filename: `referral-withdrawals-${new Date().toISOString().slice(0, 10)}.csv`, contentType: 'text/csv; charset=utf-8', buffer: Buffer.from(csv) }
  }

  async requestWithdrawal(userId: string, dto: { amountUgx?: number; payoutNumberId?: string; secretKey?: string }) {
    const amountUgx = this.positiveInt(dto.amountUgx, 'amountUgx')
    const secretKey = dto.secretKey?.trim()
    if (!secretKey) {
      throw new BadRequestException('Enter your withdrawal secret PIN')
    }

    const settings = await this.prisma.platformSetting.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global' },
      select: {
        referralMinimumWithdrawalUgx: true,
        referralMaximumWithdrawalUgx: true,
        referralWithdrawalFeeBps: true,
        referralWithdrawalFlatFeeUgx: true,
      },
    })
    if (settings.referralMinimumWithdrawalUgx > 0 && amountUgx < settings.referralMinimumWithdrawalUgx) {
      throw new BadRequestException(`Minimum referral withdrawal is UGX ${settings.referralMinimumWithdrawalUgx.toLocaleString('en-US')}`)
    }
    if (settings.referralMaximumWithdrawalUgx && amountUgx > settings.referralMaximumWithdrawalUgx) {
      throw new BadRequestException(`Maximum referral withdrawal is UGX ${settings.referralMaximumWithdrawalUgx.toLocaleString('en-US')}`)
    }
    const feeUgx = Math.round((amountUgx * settings.referralWithdrawalFeeBps) / 10000) + settings.referralWithdrawalFlatFeeUgx
    const totalDebitUgx = amountUgx + feeUgx

    const result = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.referralProfile.findUnique({
        where: { userId },
        include: { user: { select: { tenantId: true } } },
      })
      if (!profile) throw new NotFoundException('Referral profile not found')
      const tenantId = profile.tenantId ?? profile.user.tenantId
      if (!tenantId) throw new BadRequestException('Referral withdrawals require a registered workspace')
      const payoutProfile = await tx.tenantPayoutProfile.findUnique({ where: { tenantId } })
      if (!payoutProfile) throw new BadRequestException('Set your withdrawal secret PIN before requesting referral withdrawals')
      const secretOk = await bcrypt.compare(secretKey, payoutProfile.secretHash)
      if (!secretOk) throw new BadRequestException('Invalid withdrawal secret PIN')
      const verifiedPayoutNumbers = await tx.tenantPayoutNumber.findMany({
        where: { tenantId, status: PayoutNumberStatus.VERIFIED, verifiedAt: { not: null } },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      })
      if (verifiedPayoutNumbers.length === 0) throw new NotFoundException('Registered verified payout number not found')
      const payoutNumber = dto.payoutNumberId
        ? verifiedPayoutNumbers.find((number) => number.id === dto.payoutNumberId)
        : verifiedPayoutNumbers[0]
      if (!payoutNumber) {
        throw new BadRequestException('Referral withdrawals can only go to one of your registered verified payout numbers')
      }
      if (profile.status !== ReferralProfileStatus.ACTIVE) {
        throw new BadRequestException('Referral withdrawals are not available while this profile is under review')
      }
      if (profile.availableBalanceUgx < totalDebitUgx) {
        throw new BadRequestException(`Insufficient referral wallet balance. Available balance is UGX ${profile.availableBalanceUgx.toLocaleString('en-US')}.`)
      }

      const reference = `REF-WD-${randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()}`
      const wallet = await tx.wallet.upsert({
        where: { tenantId_ownerType_ownerReference: { tenantId, ownerType: 'TENANT', ownerReference: tenantId } },
        update: {},
        create: {
          tenantId,
          ownerType: 'TENANT',
          ownerReference: tenantId,
          currency: 'UGX',
          balanceUgx: 0,
        },
      })
      const updated = await tx.referralProfile.update({
        where: { id: profile.id },
        data: {
          availableBalanceUgx: { decrement: totalDebitUgx },
          registeredPayoutPhone: payoutNumber.normalizedPhone,
        },
      })
      const withdrawal = await tx.referralWalletTransaction.create({
        data: {
          referrerProfileId: profile.id,
          type: ReferralWalletTransactionType.WITHDRAWAL_PROCESSING,
          status: ReferralWalletTransactionStatus.PROCESSING,
          amountUgx,
          previousBalanceUgx: profile.availableBalanceUgx,
          newBalanceUgx: updated.availableBalanceUgx,
          description: 'Referral wallet withdrawal sent to payout provider',
          metadata: { reference, payoutNumberId: payoutNumber.id, payoutPhone: payoutNumber.normalizedPhone, network: payoutNumber.network, feeUgx, totalDebitUgx },
        },
      })
      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          tenantId,
          walletId: wallet.id,
          reference: `LEDGER-${reference}`,
          type: LedgerTransactionType.DISBURSEMENT,
          channel: BillingChannel.DISBURSEMENT,
          description: 'Referral wallet withdrawal reserved',
          grossAmountUgx: totalDebitUgx,
          feeAmountUgx: feeUgx,
          netAmountUgx: -totalDebitUgx,
          sourceType: 'ReferralWithdrawal',
          sourceId: withdrawal.id,
          metadata: {
            referralProfileId: profile.id,
            referralWalletTransactionId: withdrawal.id,
            payoutNumberId: payoutNumber.id,
            payoutAmountUgx: amountUgx,
            totalDebitUgx,
            feeUgx,
          },
          entries: {
            create: [
              {
                tenantId,
                walletId: wallet.id,
                accountCode: 'referral_wallet',
                direction: LedgerDirection.DEBIT,
                amountUgx: totalDebitUgx,
                memo: 'Referral wallet withdrawal reserve',
              },
              {
                tenantId,
                accountCode: 'disbursement_clearing',
                direction: LedgerDirection.CREDIT,
                amountUgx,
                memo: 'Referral payout reserve',
              },
              ...(feeUgx > 0
                ? [{
                    tenantId,
                    accountCode: 'platform_revenue',
                    direction: LedgerDirection.CREDIT,
                    amountUgx: feeUgx,
                    memo: 'Referral withdrawal charge',
                  }]
                : []),
            ],
          },
        },
      })
      const billingTransaction = await tx.billingTransaction.create({
        data: {
          tenantId,
          walletId: wallet.id,
          ledgerTransactionId: ledgerTransaction.id,
          channel: BillingChannel.DISBURSEMENT,
          type: BillingTransactionType.AGENT_DISBURSEMENT,
          status: BillingTransactionStatus.PENDING,
          grossAmountUgx: totalDebitUgx,
          feeAmountUgx: feeUgx,
          netAmountUgx: -totalDebitUgx,
          customerReference: payoutNumber.normalizedPhone,
          externalReference: reference,
          metadata: {
            referralProfileId: profile.id,
            referralWalletTransactionId: withdrawal.id,
            payoutNumberId: payoutNumber.id,
            payoutAmountUgx: amountUgx,
            totalDebitUgx,
            feeUgx,
          },
        },
      })
      const disbursement = await tx.disbursement.create({
        data: {
          tenantId,
          walletId: wallet.id,
          billingTransactionId: billingTransaction.id,
          reference,
          method: DisbursementMethod.MOBILE_MONEY,
          status: DisbursementStatus.PROCESSING,
          network: payoutNumber.network,
          amountUgx,
          destinationReference: payoutNumber.normalizedPhone,
          notes: 'Referral withdrawal sent to payout provider.',
          metadata: {
            referralProfileId: profile.id,
            referralWalletTransactionId: withdrawal.id,
            payoutNumberId: payoutNumber.id,
            requestedByUserId: userId,
            payoutAmountUgx: amountUgx,
            totalDebitUgx,
            feeUgx,
          },
        },
      })
      await tx.notification.create({
        data: {
          title: 'Referral withdrawal started',
          body: `Referral withdrawal of UGX ${amountUgx.toLocaleString('en-UG')} has been sent to the payout provider.`,
          audience: NotificationAudience.SINGLE_BUSINESS,
          tenantId,
        },
      })
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'referral.withdrawal_sent_to_provider',
          entity: 'Disbursement',
          entityId: disbursement.id,
          severity: AuditSeverity.INFO,
          details: {
            amountUgx,
            feeUgx,
            totalDebitUgx,
            previousBalanceUgx: profile.availableBalanceUgx,
            newBalanceUgx: updated.availableBalanceUgx,
            payoutNumberId: payoutNumber.id,
            payoutPhone: payoutNumber.normalizedPhone,
            referralWalletTransactionId: withdrawal.id,
          },
        },
      })
      return { withdrawal, disbursementId: disbursement.id }
    })

    try {
      await this.walletsService.submitReservedWithdrawal(result.disbursementId)
    } catch (error) {
      await this.restoreFailedReferralWithdrawal(result.withdrawal.id, error instanceof Error ? error.message : 'Unable to submit referral payout to provider')
      throw error
    }
    return result.withdrawal
  }

  async rejectWithdrawal(transactionId: string, adminUserId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.referralWalletTransaction.findUnique({
        where: { id: transactionId },
        include: { referrerProfile: { include: { user: { select: { tenantId: true } } } } },
      })
      if (!withdrawal) throw new NotFoundException('Referral withdrawal not found')
      if (withdrawal.type !== ReferralWalletTransactionType.WITHDRAWAL_REQUEST || withdrawal.status !== ReferralWalletTransactionStatus.PENDING) {
        throw new BadRequestException('Only pending referral withdrawal requests can be rejected')
      }
      const releaseAmount = Math.max(0, withdrawal.previousBalanceUgx - withdrawal.newBalanceUgx)
      const profile = await tx.referralProfile.update({
        where: { id: withdrawal.referrerProfileId },
        data: { availableBalanceUgx: { increment: releaseAmount } },
      })
      const rejected = await tx.referralWalletTransaction.update({
        where: { id: withdrawal.id },
        data: {
          type: ReferralWalletTransactionType.REJECTED_WITHDRAWAL,
          status: ReferralWalletTransactionStatus.REJECTED,
          adminUserId,
          newBalanceUgx: profile.availableBalanceUgx,
          description: `Referral wallet withdrawal rejected: ${reason}`,
        },
      })
      await tx.notification.create({
        data: {
          title: 'Referral withdrawal rejected',
          body: `Referral withdrawal of UGX ${withdrawal.amountUgx.toLocaleString('en-UG')} was rejected. ${reason}`,
          audience: NotificationAudience.SINGLE_BUSINESS,
          tenantId: withdrawal.referrerProfile.tenantId ?? withdrawal.referrerProfile.user.tenantId,
        },
      })
      await tx.auditLog.create({
        data: {
          tenantId: withdrawal.referrerProfile.tenantId ?? withdrawal.referrerProfile.user.tenantId,
          userId: adminUserId,
          action: 'referral.withdrawal_rejected',
          entity: 'ReferralWalletTransaction',
          entityId: withdrawal.id,
          severity: AuditSeverity.WARNING,
          details: {
            referrerProfileId: withdrawal.referrerProfileId,
            amountUgx: withdrawal.amountUgx,
            releasedAmountUgx: releaseAmount,
            previousStatus: withdrawal.status,
            newStatus: ReferralWalletTransactionStatus.REJECTED,
            reason,
          },
        },
      })
      return rejected
    })
  }

  async suspendProfile(profileId: string, adminUserId: string, reason: string) {
    const profile = await this.prisma.referralProfile.update({
      where: { id: profileId },
      data: {
        status: ReferralProfileStatus.SUSPENDED,
        referralPrivilegesSuspendedAt: new Date(),
        suspensionReason: reason,
      },
    })
    await this.prisma.auditLog.create({
      data: {
        tenantId: profile.tenantId,
        userId: adminUserId,
        action: 'referral.profile_suspended',
        entity: 'ReferralProfile',
        entityId: profile.id,
        severity: AuditSeverity.WARNING,
        details: { reason },
      },
    })
    return profile
  }

  async reactivateProfile(profileId: string, adminUserId: string, reason: string) {
    const profile = await this.prisma.referralProfile.update({
      where: { id: profileId },
      data: {
        status: ReferralProfileStatus.ACTIVE,
        referralPrivilegesSuspendedAt: null,
        suspensionReason: null,
      },
    })
    await this.prisma.auditLog.create({
      data: {
        tenantId: profile.tenantId,
        userId: adminUserId,
        action: 'referral.profile_reactivated',
        entity: 'ReferralProfile',
        entityId: profile.id,
        severity: AuditSeverity.INFO,
        details: { reason },
      },
    })
    return profile
  }

  private async restoreFailedReferralWithdrawal(transactionId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.referralWalletTransaction.findUnique({
        where: { id: transactionId },
        include: { referrerProfile: true },
      })
      if (!withdrawal || withdrawal.status === ReferralWalletTransactionStatus.FAILED) return
      const metadata =
        typeof withdrawal.metadata === 'object' && withdrawal.metadata !== null && !Array.isArray(withdrawal.metadata)
          ? withdrawal.metadata as Record<string, unknown>
          : {}
      const reference = typeof metadata.reference === 'string' ? metadata.reference : null
      const releaseAmount = Math.max(0, withdrawal.previousBalanceUgx - withdrawal.newBalanceUgx)
      const profile = await tx.referralProfile.update({
        where: { id: withdrawal.referrerProfileId },
        data: { availableBalanceUgx: { increment: releaseAmount } },
      })
      if (reference) {
        const disbursement = await tx.disbursement.findUnique({
          where: { reference },
          select: { id: true, billingTransactionId: true },
        })
        if (disbursement) {
          await tx.disbursement.update({
            where: { id: disbursement.id },
            data: {
              status: DisbursementStatus.FAILED,
              failedAt: new Date(),
              notes: `Referral payout failed before provider acceptance: ${reason}`,
            },
          })
          if (disbursement.billingTransactionId) {
            await tx.billingTransaction.update({
              where: { id: disbursement.billingTransactionId },
              data: { status: BillingTransactionStatus.REVERSED },
            })
          }
        }
      }
      await tx.referralWalletTransaction.update({
        where: { id: withdrawal.id },
        data: {
          type: ReferralWalletTransactionType.FAILED_WITHDRAWAL,
          status: ReferralWalletTransactionStatus.FAILED,
          newBalanceUgx: profile.availableBalanceUgx,
          description: `Referral withdrawal failed before payout: ${reason}`,
        },
      })
      await tx.auditLog.create({
        data: {
          tenantId: withdrawal.referrerProfile.tenantId,
          action: 'referral.withdrawal_failed_restored',
          entity: 'ReferralWalletTransaction',
          entityId: withdrawal.id,
          severity: AuditSeverity.WARNING,
          details: { transactionId, releasedAmountUgx: releaseAmount, reason },
        },
      })
    })
  }

  private async ensureProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, email: true, firstName: true, lastName: true, referralProfile: true },
    })
    if (!user) {
      throw new NotFoundException('Account not found')
    }
    if (user.referralProfile) {
      return user.referralProfile
    }

    return this.prisma.referralProfile.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        status: ReferralProfileStatus.ACTIVE,
        code: await this.generateCode(user.email),
      },
    })
  }

  private positiveInt(value: unknown, field: string) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be greater than zero`)
    }
    return Math.round(parsed)
  }

  private toCsv(rows: unknown[][]) {
    return rows
      .map((row) => row.map((value) => {
        const text = value === null || value === undefined ? '' : String(value)
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
      }).join(','))
      .join('\n')
  }

  private async generateCode(seed: string) {
    const prefix = seed.split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'AROFI'
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const existing = await this.prisma.referralProfile.findUnique({ where: { code }, select: { id: true } })
      if (!existing) return code
    }
    return `AROFI${Date.now().toString(36).toUpperCase()}`
  }
}
