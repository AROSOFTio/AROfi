import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  NotificationAudience,
  Prisma,
  ReferralCommissionStatus,
  ReferralRelationshipStatus,
  ReferralProfileStatus,
  ReferralWalletTransactionStatus,
  ReferralWalletTransactionType,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordQualifiedSubscriptionPayment(input: {
    tenantId: string
    subscriptionPaymentId: string
    amountUgx: number
    paidAt: Date
    tx?: Prisma.TransactionClient
  }) {
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
      select: { id: true },
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

    return commission
  }

  async getMyDashboard(userId: string, origin = 'https://arofi.net') {
    const profile = await this.ensureProfile(userId)
    const [relationships, commissions, transactions] = await Promise.all([
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

  async requestWithdrawal(userId: string, dto: { amountUgx?: number; payoutPhone?: string }) {
    const amountUgx = this.positiveInt(dto.amountUgx, 'amountUgx')
    const payoutPhone = dto.payoutPhone?.trim()
    if (!payoutPhone) {
      throw new BadRequestException('Enter the Mobile Money number for this referral withdrawal')
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

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.referralProfile.findUnique({
        where: { userId },
        include: { user: { select: { tenantId: true } } },
      })
      if (!profile) throw new NotFoundException('Referral profile not found')
      if (profile.status !== ReferralProfileStatus.ACTIVE) {
        throw new BadRequestException('Referral withdrawals are not available while this profile is under review')
      }
      if (profile.availableBalanceUgx < totalDebitUgx) {
        throw new BadRequestException(`Insufficient referral wallet balance. Available balance is UGX ${profile.availableBalanceUgx.toLocaleString('en-US')}.`)
      }

      const updated = await tx.referralProfile.update({
        where: { id: profile.id },
        data: {
          availableBalanceUgx: { decrement: totalDebitUgx },
          registeredPayoutPhone: payoutPhone,
        },
      })
      const withdrawal = await tx.referralWalletTransaction.create({
        data: {
          referrerProfileId: profile.id,
          type: ReferralWalletTransactionType.WITHDRAWAL_REQUEST,
          status: ReferralWalletTransactionStatus.PENDING,
          amountUgx,
          previousBalanceUgx: profile.availableBalanceUgx,
          newBalanceUgx: updated.availableBalanceUgx,
          description: 'Referral wallet withdrawal requested',
          metadata: { payoutPhone, feeUgx, totalDebitUgx },
        },
      })
      await tx.notification.create({
        data: {
          title: 'Referral withdrawal requested',
          body: `Referral withdrawal request received for UGX ${amountUgx.toLocaleString('en-UG')}.`,
          audience: NotificationAudience.SINGLE_BUSINESS,
          tenantId: profile.tenantId ?? profile.user.tenantId,
        },
      })
      return withdrawal
    })
  }

  async approveWithdrawal(transactionId: string, adminUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.referralWalletTransaction.findUnique({
        where: { id: transactionId },
        include: { referrerProfile: { include: { user: { select: { tenantId: true } } } } },
      })
      if (!withdrawal) throw new NotFoundException('Referral withdrawal not found')
      if (withdrawal.type !== ReferralWalletTransactionType.WITHDRAWAL_REQUEST || withdrawal.status !== ReferralWalletTransactionStatus.PENDING) {
        throw new BadRequestException('Only pending referral withdrawal requests can be approved')
      }
      await tx.referralProfile.update({
        where: { id: withdrawal.referrerProfileId },
        data: { withdrawnAmountUgx: { increment: withdrawal.amountUgx } },
      })
      const paid = await tx.referralWalletTransaction.update({
        where: { id: withdrawal.id },
        data: {
          type: ReferralWalletTransactionType.PAID_WITHDRAWAL,
          status: ReferralWalletTransactionStatus.PAID,
          adminUserId,
          description: 'Referral wallet withdrawal approved and marked paid',
        },
      })
      await tx.notification.create({
        data: {
          title: 'Referral withdrawal paid',
          body: `Referral withdrawal of UGX ${withdrawal.amountUgx.toLocaleString('en-UG')} has been approved and marked paid.`,
          audience: NotificationAudience.SINGLE_BUSINESS,
          tenantId: withdrawal.referrerProfile.tenantId ?? withdrawal.referrerProfile.user.tenantId,
        },
      })
      return paid
    })
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
      return rejected
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
