import { Injectable } from '@nestjs/common'
import { BillingChannel, FeeSettingSource, Prisma, SubscriptionPlanTier } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { resolveEffectiveSubscriptionTier } from '../subscription/subscription-plan.util'
import { BILLING_FEE_BASIS_POINTS, PLATFORM_SETTINGS_ID } from './billing.constants'

@Injectable()
export class FeeEngineService {
  constructor(private readonly prisma: PrismaService) {}

  calculateBasisPointAmount(basisPoints: number, amountUgx: number) {
    return Math.round((amountUgx * basisPoints) / 10000)
  }

  async resolveFeeSetting(channel: BillingChannel, tenantId?: string | null, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma
    const [platformSettings, tenantSettings] = await Promise.all([
      client.platformSetting.upsert({
        where: { id: PLATFORM_SETTINGS_ID },
        update: {},
        create: { id: PLATFORM_SETTINGS_ID },
      }),
      tenantId
        ? client.tenantSetting.findUnique({
            where: { tenantId },
            select: {
              tenantMobileMoneyFeeBps: true,
              tenantVoucherFeeBps: true,
              subscriptionPlan: true,
              subscriptionPlanExpiresAt: true,
            },
          })
        : null,
    ])

    if (channel === BillingChannel.MOBILE_MONEY && tenantSettings?.tenantMobileMoneyFeeBps !== null && tenantSettings?.tenantMobileMoneyFeeBps !== undefined) {
      return {
        basisPoints: tenantSettings.tenantMobileMoneyFeeBps,
        source: FeeSettingSource.TENANT_OVERRIDE,
      }
    }

    if (channel === BillingChannel.VOUCHER && tenantSettings?.tenantVoucherFeeBps !== null && tenantSettings?.tenantVoucherFeeBps !== undefined) {
      return {
        basisPoints: tenantSettings.tenantVoucherFeeBps,
        source: FeeSettingSource.TENANT_OVERRIDE,
      }
    }

    const effectiveTier = tenantSettings
      ? resolveEffectiveSubscriptionTier(tenantSettings.subscriptionPlan, tenantSettings.subscriptionPlanExpiresAt)
      : SubscriptionPlanTier.FREE

    if (channel === BillingChannel.MOBILE_MONEY) {
      if (effectiveTier === SubscriptionPlanTier.PRO) {
        return { basisPoints: platformSettings.proMobileMoneyFeeBps, source: FeeSettingSource.PLAN_TIER }
      }
      if (effectiveTier === SubscriptionPlanTier.ENTERPRISE) {
        return { basisPoints: platformSettings.enterpriseMobileMoneyFeeBps, source: FeeSettingSource.PLAN_TIER }
      }
      return {
        basisPoints: platformSettings.mobileMoneyFeeBps,
        source: FeeSettingSource.GLOBAL_DEFAULT,
      }
    }

    if (channel === BillingChannel.VOUCHER) {
      if (effectiveTier === SubscriptionPlanTier.PRO) {
        return { basisPoints: platformSettings.proVoucherFeeBps, source: FeeSettingSource.PLAN_TIER }
      }
      if (effectiveTier === SubscriptionPlanTier.ENTERPRISE) {
        return { basisPoints: platformSettings.enterpriseVoucherFeeBps, source: FeeSettingSource.PLAN_TIER }
      }
      return {
        basisPoints: platformSettings.voucherFeeBps,
        source: FeeSettingSource.GLOBAL_DEFAULT,
      }
    }

    return {
      basisPoints: BILLING_FEE_BASIS_POINTS[channel] ?? 0,
      source: FeeSettingSource.GLOBAL_DEFAULT,
    }
  }

  async calculateFeeAmount(channel: BillingChannel, grossAmountUgx: number, tenantId?: string | null, tx?: Prisma.TransactionClient) {
    const { basisPoints } = await this.resolveFeeSetting(channel, tenantId, tx)
    return this.calculateBasisPointAmount(basisPoints, grossAmountUgx)
  }

  async calculateBreakdown(channel: BillingChannel, grossAmountUgx: number, tenantId?: string | null, tx?: Prisma.TransactionClient) {
    const feeSetting = await this.resolveFeeSetting(channel, tenantId, tx)
    const feeAmountUgx = this.calculateBasisPointAmount(feeSetting.basisPoints, grossAmountUgx)
    const netAmountUgx = grossAmountUgx - feeAmountUgx

    return {
      grossAmountUgx,
      feeAmountUgx,
      netAmountUgx,
      feeBasisPoints: feeSetting.basisPoints,
      feeSource: feeSetting.source,
      basisPoints: feeSetting.basisPoints,
    }
  }
}
