import { Injectable, NotFoundException } from '@nestjs/common'
import { ReferralCommissionStatus, ReferralRelationshipStatus, ReferralProfileStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

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
