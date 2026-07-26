import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  AgentStatus,
  AuditSeverity,
  FeatureLimit,
  KycDocumentType,
  PaymentNetwork,
  PaymentProvider,
  PackageStatus,
  Prisma,
  SessionStatus,
  SubscriptionPlanTier,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PLATFORM_SETTINGS_ID } from '../billing/billing.constants'
import { resolveEffectiveSubscriptionTier } from '../subscription/subscription-plan.util'
import type { AuthenticatedAdminUser } from '../auth/auth.module'
import { AddSupportTicketMessageDto } from './dto/add-support-ticket-message.dto'
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto'
import { UpdateFeatureLimitDto } from './dto/update-feature-limit.dto'
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto'
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto'
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto'

type FeatureUsageSnapshot = {
  packages: number
  routers: number
  hotspots: number
  agents: number
  voucherBatches: number
  activeSessions: number
  openSupportTickets: number
}

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlatformSettings() {
    const settings = await this.prisma.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
    })

    return this.presentPlatformSettings(settings)
  }

  async updatePlatformSettings(dto: UpdatePlatformSettingsDto, actor: AuthenticatedAdminUser) {
    const data: Prisma.PlatformSettingUpdateInput = {}

    if (dto.mobileMoneyFeePercent !== undefined) data.mobileMoneyFeeBps = this.percentToBps(dto.mobileMoneyFeePercent, 'mobileMoneyFeePercent')
    if (dto.voucherFeePercent !== undefined) data.voucherFeeBps = this.percentToBps(dto.voucherFeePercent, 'voucherFeePercent')
    if (dto.proMobileMoneyFeePercent !== undefined) data.proMobileMoneyFeeBps = this.percentToBps(dto.proMobileMoneyFeePercent, 'proMobileMoneyFeePercent')
    if (dto.proVoucherFeePercent !== undefined) data.proVoucherFeeBps = this.percentToBps(dto.proVoucherFeePercent, 'proVoucherFeePercent')
    if (dto.proSubscriptionPriceUgx !== undefined) data.proSubscriptionPriceUgx = this.nonNegativeInt(dto.proSubscriptionPriceUgx, 'proSubscriptionPriceUgx')
    if (dto.proSubscriptionDurationDays !== undefined) data.proSubscriptionDurationDays = this.positiveInt(dto.proSubscriptionDurationDays, 'proSubscriptionDurationDays')
    if (dto.proPlanEnabled !== undefined) data.proPlanEnabled = dto.proPlanEnabled
    if (dto.proRenewalRule !== undefined) data.proRenewalRule = this.nonEmptyTrim(dto.proRenewalRule, 'proRenewalRule')
    if (dto.proGracePeriodDays !== undefined) data.proGracePeriodDays = this.nonNegativeInt(dto.proGracePeriodDays, 'proGracePeriodDays')
    if (dto.subscriptionExpiryNotificationDays !== undefined) {
      data.subscriptionExpiryNotificationDays = this.sanitizeExpiryDays(dto.subscriptionExpiryNotificationDays)
    }
    if (dto.freePlanDescription !== undefined) data.freePlanDescription = this.nonEmptyTrim(dto.freePlanDescription, 'freePlanDescription')
    if (dto.proPlanDescription !== undefined) data.proPlanDescription = this.nonEmptyTrim(dto.proPlanDescription, 'proPlanDescription')
    if (dto.freePlanBenefits !== undefined) data.freePlanBenefits = this.nonEmptyTrim(dto.freePlanBenefits, 'freePlanBenefits')
    if (dto.proPlanBenefits !== undefined) data.proPlanBenefits = this.nonEmptyTrim(dto.proPlanBenefits, 'proPlanBenefits')
    if (dto.referralProgramEnabled !== undefined) data.referralProgramEnabled = dto.referralProgramEnabled
    if (dto.resellerRegistrationEnabled !== undefined) data.resellerRegistrationEnabled = dto.resellerRegistrationEnabled
    if (dto.referralCommissionPercent !== undefined) data.referralCommissionBps = this.percentToBps(dto.referralCommissionPercent, 'referralCommissionPercent')
    if (dto.referralHoldingPeriodDays !== undefined) data.referralHoldingPeriodDays = this.nonNegativeInt(dto.referralHoldingPeriodDays, 'referralHoldingPeriodDays')
    if (dto.enterpriseMobileMoneyFeePercent !== undefined) {
      data.enterpriseMobileMoneyFeeBps = this.percentToBps(dto.enterpriseMobileMoneyFeePercent, 'enterpriseMobileMoneyFeePercent')
    }
    if (dto.enterpriseVoucherFeePercent !== undefined) {
      data.enterpriseVoucherFeeBps = this.percentToBps(dto.enterpriseVoucherFeePercent, 'enterpriseVoucherFeePercent')
    }
    if (dto.freeRouterLimit !== undefined) data.freeRouterLimit = this.positiveInt(dto.freeRouterLimit, 'freeRouterLimit')
    if (dto.proRouterLimit !== undefined) data.proRouterLimit = this.positiveInt(dto.proRouterLimit, 'proRouterLimit')
    if (dto.enterpriseRouterLimit !== undefined) {
      data.enterpriseRouterLimit = dto.enterpriseRouterLimit === null ? null : this.positiveInt(dto.enterpriseRouterLimit, 'enterpriseRouterLimit')
    }
    if (dto.freeAnalyticsHistoryDays !== undefined) data.freeAnalyticsHistoryDays = this.positiveInt(dto.freeAnalyticsHistoryDays, 'freeAnalyticsHistoryDays')
    if (dto.proAnalyticsHistoryDays !== undefined) data.proAnalyticsHistoryDays = this.positiveInt(dto.proAnalyticsHistoryDays, 'proAnalyticsHistoryDays')
    if (dto.enterpriseAnalyticsHistoryDays !== undefined) {
      data.enterpriseAnalyticsHistoryDays =
        dto.enterpriseAnalyticsHistoryDays === null ? null : this.positiveInt(dto.enterpriseAnalyticsHistoryDays, 'enterpriseAnalyticsHistoryDays')
    }
    if (dto.minimumWithdrawalUgx !== undefined) data.minimumWithdrawalUgx = this.nonNegativeInt(dto.minimumWithdrawalUgx, 'minimumWithdrawalUgx')
    if (dto.withdrawalFeePercent !== undefined) data.withdrawalFeeBps = this.percentToBps(dto.withdrawalFeePercent, 'withdrawalFeePercent')
    if (dto.withdrawalFlatFeeUgx !== undefined) data.withdrawalFlatFeeUgx = this.nonNegativeInt(dto.withdrawalFlatFeeUgx, 'withdrawalFlatFeeUgx')
    if (dto.requireWithdrawalApproval !== undefined) data.requireWithdrawalApproval = dto.requireWithdrawalApproval
    if (dto.instantWithdrawalsEnabled !== undefined) data.instantWithdrawalsEnabled = dto.instantWithdrawalsEnabled
    if (dto.requireApprovalForFirstWithdrawal !== undefined) data.requireApprovalForFirstWithdrawal = dto.requireApprovalForFirstWithdrawal
    if (dto.requireApprovalAboveAmountUgx !== undefined) {
      data.requireApprovalAboveAmountUgx =
        dto.requireApprovalAboveAmountUgx === null ? null : this.nonNegativeInt(dto.requireApprovalAboveAmountUgx, 'requireApprovalAboveAmountUgx')
    }
    if (dto.failedSecretAttemptsBeforeLock !== undefined) {
      data.failedSecretAttemptsBeforeLock = this.positiveInt(dto.failedSecretAttemptsBeforeLock, 'failedSecretAttemptsBeforeLock')
    }
    if (dto.withdrawalLockMinutes !== undefined) data.withdrawalLockMinutes = this.positiveInt(dto.withdrawalLockMinutes, 'withdrawalLockMinutes')
    if (dto.payoutNumberChangeRequiresApproval !== undefined) data.payoutNumberChangeRequiresApproval = dto.payoutNumberChangeRequiresApproval
    if (dto.maxPayoutNumbers !== undefined) data.maxPayoutNumbers = this.positiveInt(dto.maxPayoutNumbers, 'maxPayoutNumbers')
    if (dto.allowedPaymentNetworks !== undefined) data.allowedPaymentNetworks = this.sanitizeNetworks(dto.allowedPaymentNetworks)
    if (dto.mtnCollectionProvider !== undefined) data.mtnCollectionProvider = this.sanitizeProvider(dto.mtnCollectionProvider)
    if (dto.airtelCollectionProvider !== undefined) data.airtelCollectionProvider = this.sanitizeProvider(dto.airtelCollectionProvider)
    if (dto.mtnDisbursementProvider !== undefined) data.mtnDisbursementProvider = this.sanitizeProvider(dto.mtnDisbursementProvider)
    if (dto.airtelDisbursementProvider !== undefined) data.airtelDisbursementProvider = this.sanitizeProvider(dto.airtelDisbursementProvider)
    if (dto.routerAutoConnectEnabled !== undefined) data.routerAutoConnectEnabled = dto.routerAutoConnectEnabled
    if (dto.captivePortalFallbackMessage !== undefined) data.captivePortalFallbackMessage = dto.captivePortalFallbackMessage.trim()
    if (dto.supportPhone !== undefined) data.supportPhone = this.nullableTrim(dto.supportPhone)
    if (dto.supportEmail !== undefined) data.supportEmail = this.nullableTrim(dto.supportEmail)
    if (dto.supportUrl !== undefined) data.supportUrl = this.nullableTrim(dto.supportUrl)
    if (dto.voucherTemplateDefaultStyle !== undefined) data.voucherTemplateDefaultStyle = dto.voucherTemplateDefaultStyle.trim()
    if (dto.auditLoggingEnabled !== undefined) data.auditLoggingEnabled = dto.auditLoggingEnabled

    await this.prisma.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
    })

    const settings = await this.prisma.platformSetting.update({
      where: { id: PLATFORM_SETTINGS_ID },
      data,
    })

    await this.writeAudit({
      actor,
      action: 'platform.settings.updated',
      entity: 'PlatformSetting',
      entityId: settings.id,
      details: data,
    })

    return this.presentPlatformSettings(settings)
  }

  async getCommissionRates() {
    const [settings, tenants] = await Promise.all([
      this.prisma.platformSetting.upsert({
        where: { id: PLATFORM_SETTINGS_ID },
        update: {},
        create: { id: PLATFORM_SETTINGS_ID },
      }),
      this.prisma.tenant.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          tenantSettings: {
            select: {
              tenantMobileMoneyFeeBps: true,
              tenantVoucherFeeBps: true,
              subscriptionPlan: true,
              subscriptionPlanExpiresAt: true,
            },
          },
        },
      }),
    ])

    const globalRates = {
      freeMobileMoneyFeePercent: this.bpsToPercent(settings.mobileMoneyFeeBps),
      freeVoucherFeePercent: this.bpsToPercent(settings.voucherFeeBps),
      proMobileMoneyFeePercent: this.bpsToPercent(settings.proMobileMoneyFeeBps),
      proVoucherFeePercent: this.bpsToPercent(settings.proVoucherFeeBps),
      enterpriseMobileMoneyFeePercent: this.bpsToPercent(settings.enterpriseMobileMoneyFeeBps),
      enterpriseVoucherFeePercent: this.bpsToPercent(settings.enterpriseVoucherFeeBps),
    }

    const tenantRates = tenants.map((tenant) => {
      const s = tenant.tenantSettings
      const tier = s
        ? resolveEffectiveSubscriptionTier(s.subscriptionPlan, s.subscriptionPlanExpiresAt)
        : SubscriptionPlanTier.FREE
      const overrideMm = this.bpsToPercent(s?.tenantMobileMoneyFeeBps)
      const overrideVoucher = this.bpsToPercent(s?.tenantVoucherFeeBps)
      const defaultMm =
        tier === SubscriptionPlanTier.ENTERPRISE
          ? globalRates.enterpriseMobileMoneyFeePercent
          : tier === SubscriptionPlanTier.PRO
          ? globalRates.proMobileMoneyFeePercent
          : globalRates.freeMobileMoneyFeePercent
      const defaultVoucher =
        tier === SubscriptionPlanTier.ENTERPRISE
          ? globalRates.enterpriseVoucherFeePercent
          : tier === SubscriptionPlanTier.PRO
          ? globalRates.proVoucherFeePercent
          : globalRates.freeVoucherFeePercent
      return {
        id: tenant.id,
        name: tenant.name,
        subscriptionPlan: tier,
        overrideMobileMoneyFeePercent: overrideMm,
        overrideVoucherFeePercent: overrideVoucher,
        effectiveMobileMoneyFeePercent: overrideMm ?? defaultMm,
        effectiveVoucherFeePercent: overrideVoucher ?? defaultVoucher,
      }
    })

    return { globalRates, tenants: tenantRates }
  }

  async getTenantSettings(tenantId: string) {
    const [tenant, platformSettings] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { tenantSettings: true, payoutNumbers: true, payoutProfile: true },
      }),
      this.prisma.platformSetting.upsert({
        where: { id: PLATFORM_SETTINGS_ID },
        update: {},
        create: { id: PLATFORM_SETTINGS_ID },
      }),
    ])

    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    const settings =
      tenant.tenantSettings ??
      (await this.prisma.tenantSetting.create({
        data: { tenantId },
      }))
    const effectiveTier = resolveEffectiveSubscriptionTier(
      settings.subscriptionPlan,
      settings.subscriptionPlanExpiresAt,
    )
    const defaultMobileMoneyFeeBps =
      effectiveTier === SubscriptionPlanTier.ENTERPRISE
        ? platformSettings.enterpriseMobileMoneyFeeBps
        : effectiveTier === SubscriptionPlanTier.PRO
          ? platformSettings.proMobileMoneyFeeBps
          : platformSettings.mobileMoneyFeeBps
    const defaultVoucherFeeBps =
      effectiveTier === SubscriptionPlanTier.ENTERPRISE
        ? platformSettings.enterpriseVoucherFeeBps
        : effectiveTier === SubscriptionPlanTier.PRO
          ? platformSettings.proVoucherFeeBps
          : platformSettings.voucherFeeBps

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        logoUrl: tenant.logoUrl,
        brandColor: tenant.brandColor,
        portalTemplate: tenant.portalTemplate,
        supportPhone: tenant.supportPhone,
        supportEmail: tenant.supportEmail,
      },
      settings: {
        ...settings,
        tenantMobileMoneyFeePercent: this.bpsToPercent(settings.tenantMobileMoneyFeeBps),
        tenantVoucherFeePercent: this.bpsToPercent(settings.tenantVoucherFeeBps),
        withdrawalSecretConfigured: Boolean(tenant.payoutProfile),
        payoutNumbers: tenant.payoutNumbers,
      },
      payment: {
        acceptedNetworks: platformSettings.allowedPaymentNetworks,
        collectionMode: 'AUTOMATIC',
        effectiveMobileMoneyFeePercent: this.bpsToPercent(
          settings.tenantMobileMoneyFeeBps ?? defaultMobileMoneyFeeBps,
        ),
        effectiveVoucherFeePercent: this.bpsToPercent(
          settings.tenantVoucherFeeBps ?? defaultVoucherFeeBps,
        ),
      },
    }
  }

  async updateTenantSettings(tenantId: string, dto: UpdateTenantSettingsDto, actor: AuthenticatedAdminUser, canManageFees: boolean) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, tenantSettings: { select: { subscriptionPlan: true, subscriptionPlanExpiresAt: true } } },
    })
    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    const tenantData: Prisma.TenantUpdateInput = {}
    const settingsData: Prisma.TenantSettingUpdateInput = {}

    // Custom branding (logo, brand color, portal template) is a Pro/Enterprise
    // perk - Free tenants stay on AROFi's default look. DevAdmin can still set
    // it manually as a courtesy/override via canManageFees.
    const effectiveTier = tenant.tenantSettings
      ? resolveEffectiveSubscriptionTier(tenant.tenantSettings.subscriptionPlan, tenant.tenantSettings.subscriptionPlanExpiresAt)
      : SubscriptionPlanTier.FREE
    const canCustomizeBranding = canManageFees || effectiveTier !== SubscriptionPlanTier.FREE
    const wantsCustomLogo = dto.logoUrl !== undefined && this.nullableTrim(dto.logoUrl) !== null
    const wantsCustomBrandColor = dto.brandColor !== undefined && this.nullableTrim(dto.brandColor) !== null
    // Portal template selection is available to all tenants; only custom logo
    // and brand colour are reserved for Pro/Enterprise branding.
    if (!canCustomizeBranding && (wantsCustomLogo || wantsCustomBrandColor)) {
      throw new BadRequestException('Custom logo and brand colour require a Pro or Enterprise plan')
    }

    if (dto.businessName !== undefined) {
      const businessName = dto.businessName.trim()
      tenantData.name = businessName
      settingsData.businessName = businessName
    }
    if (dto.logoUrl !== undefined) {
      tenantData.logoUrl = this.nullableTrim(dto.logoUrl)
      settingsData.logoUrl = this.nullableTrim(dto.logoUrl)
    }
    if (dto.brandColor !== undefined) {
      tenantData.brandColor = this.nullableTrim(dto.brandColor)
      settingsData.brandColor = this.nullableTrim(dto.brandColor)
    }
    if (dto.portalTemplate !== undefined) {
      tenantData.portalTemplate = dto.portalTemplate.trim()
      settingsData.portalTemplate = dto.portalTemplate.trim()
    }
    // Support contact email/phone double as the business's verified identity
    // details (the same ones captured during onboarding), so — like the
    // sign-in email — a vendor can't silently change them here. Only Dev
    // Admin can apply them directly; vendors file a request via the Support
    // Hub instead (see SupportContactChangePanel on the frontend) and a
    // reviewer applies the change.
    if (canManageFees && dto.supportPhone !== undefined) {
      tenantData.supportPhone = this.nullableTrim(dto.supportPhone)
      settingsData.supportPhone = this.nullableTrim(dto.supportPhone)
    }
    if (canManageFees && dto.supportEmail !== undefined) {
      tenantData.supportEmail = this.nullableTrim(dto.supportEmail)
      settingsData.supportEmail = this.nullableTrim(dto.supportEmail)
    }

    if (canManageFees) {
      if (dto.tenantMobileMoneyFeePercent !== undefined) {
        settingsData.tenantMobileMoneyFeeBps =
          dto.tenantMobileMoneyFeePercent === null ? null : this.percentToBps(dto.tenantMobileMoneyFeePercent, 'tenantMobileMoneyFeePercent')
      }
      if (dto.tenantVoucherFeePercent !== undefined) {
        settingsData.tenantVoucherFeeBps =
          dto.tenantVoucherFeePercent === null ? null : this.percentToBps(dto.tenantVoucherFeePercent, 'tenantVoucherFeePercent')
      }
    }

    if (dto.routerAutoConnectEnabled !== undefined) settingsData.routerAutoConnectEnabled = dto.routerAutoConnectEnabled
    if (dto.routerOnboardingPreferences !== undefined) settingsData.routerOnboardingPreferences = dto.routerOnboardingPreferences as Prisma.InputJsonValue
    if (dto.voucherPrintDefaultTemplate !== undefined) settingsData.voucherPrintDefaultTemplate = this.nullableTrim(dto.voucherPrintDefaultTemplate)
    if (dto.termsAccepted) {
      settingsData.termsAcceptedAt = new Date()
      settingsData.termsAcceptedByUserId = actor.id
    }
    if (canManageFees && dto.kycCompleted !== undefined) settingsData.kycCompleted = dto.kycCompleted
    if (canManageFees && dto.accountActive !== undefined) settingsData.accountActive = dto.accountActive
    if (canManageFees && dto.fraudHold !== undefined) settingsData.fraudHold = dto.fraudHold
    if (dto.redeemableWhenGenerated !== undefined) settingsData.redeemableWhenGenerated = dto.redeemableWhenGenerated
    if (dto.allowDeviceReset !== undefined) settingsData.allowDeviceReset = dto.allowDeviceReset
    if (dto.maxResetsPerActivation !== undefined) settingsData.maxResetsPerActivation = this.nonNegativeInt(dto.maxResetsPerActivation, 'maxResetsPerActivation')
    if (dto.allowUnboundCaptiveAccess !== undefined) settingsData.allowUnboundCaptiveAccess = dto.allowUnboundCaptiveAccess
    if (dto.antiTetheringRuleEnabled !== undefined) settingsData.antiTetheringRuleEnabled = dto.antiTetheringRuleEnabled
    if (dto.supportText !== undefined) settingsData.supportText = this.nullableTrim(dto.supportText)

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(tenantData).length > 0) {
        await tx.tenant.update({ where: { id: tenantId }, data: tenantData })
      }
      await tx.tenantSetting.upsert({
        where: { tenantId },
        update: {},
        create: { tenantId },
      })
      await tx.tenantSetting.update({
        where: { tenantId },
        data: settingsData,
      })
      await this.writeAudit(
        {
          actor,
          tenantId,
          action: 'tenant.settings.updated',
          entity: 'TenantSetting',
          entityId: tenantId,
          details: { tenantData, settingsData },
        },
        tx,
      )
    })

    return this.getTenantSettings(tenantId)
  }

  async getOverview(tenantId?: string) {
    const [audit, featureLimits, support] = await Promise.all([
      this.getAuditLogs(tenantId),
      this.getFeatureLimits(tenantId),
      this.getSupportTickets(tenantId),
    ])

    const warningOrExceededLimits = featureLimits.items.filter(
      (limit) => limit.health === 'warning' || limit.health === 'exceeded' || limit.health === 'blocked',
    ).length
    const criticalAudits = audit.items.filter((item) => item.severity === 'CRITICAL').length

    return {
      summary: {
        auditEntries: audit.summary.totalEntries,
        criticalAudits,
        warningOrExceededLimits,
        openSupportTickets: support.summary.open,
        inProgressSupportTickets: support.summary.inProgress,
      },
      audit,
      featureLimits,
      support,
    }
  }

  async getAuditLogs(tenantId?: string) {
    const where = tenantId ? { tenantId } : undefined
    const items = await this.prisma.auditLog.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return {
      summary: {
        totalEntries: items.length,
        info: items.filter((item) => item.severity === 'INFO').length,
        warning: items.filter((item) => item.severity === 'WARNING').length,
        error: items.filter((item) => item.severity === 'ERROR').length,
        critical: items.filter((item) => item.severity === 'CRITICAL').length,
      },
      items,
    }
  }

  async getFeatureLimits(tenantId?: string) {
    const where = tenantId ? { tenantId } : undefined
    const limits = await this.prisma.featureLimit.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ tenantId: 'asc' }, { category: 'asc' }, { code: 'asc' }],
    })

    const usageByTenant = new Map<string, FeatureUsageSnapshot>()
    const tenantIds = Array.from(
      new Set(limits.map((limit) => limit.tenantId).filter((value): value is string => Boolean(value))),
    )

    await Promise.all(
      tenantIds.map(async (id) => {
        usageByTenant.set(id, await this.buildFeatureUsageSnapshot(id))
      }),
    )

    const items = limits.map((limit) => {
      const usage = limit.tenantId ? usageByTenant.get(limit.tenantId) : undefined
      const currentUsage = this.resolveCurrentUsage(limit, usage)
      const usagePercentage =
        limit.limitValue && limit.limitValue > 0
          ? Math.round((currentUsage / limit.limitValue) * 100)
          : null

      return {
        ...limit,
        currentUsage,
        usagePercentage,
        remaining:
          limit.limitValue === null
            ? null
            : Math.max(limit.limitValue - currentUsage, 0),
        health: this.resolveLimitHealth({
          isEnabled: limit.isEnabled,
          hardLimit: limit.hardLimit,
          limitValue: limit.limitValue,
          warningThresholdPct: limit.warningThresholdPct,
          currentUsage,
        }),
      }
    })

    return {
      summary: {
        totalLimits: items.length,
        enabled: items.filter((item) => item.isEnabled).length,
        warning: items.filter((item) => item.health === 'warning').length,
        exceeded: items.filter((item) => item.health === 'exceeded' || item.health === 'blocked').length,
      },
      items,
    }
  }

  async updateFeatureLimit(limitId: string, dto: UpdateFeatureLimitDto, tenantId?: string) {
    const existing = await this.prisma.featureLimit.findUnique({
      where: { id: limitId },
    })

    if (!existing) {
      throw new NotFoundException('Feature limit not found')
    }

    if (tenantId && existing.tenantId !== tenantId) {
      throw new NotFoundException('Feature limit not found')
    }

    return this.prisma.featureLimit.update({
      where: { id: limitId },
      data: {
        name: dto.name?.trim(),
        category: dto.category,
        description: dto.description?.trim(),
        unit: dto.unit?.trim(),
        isEnabled: dto.isEnabled,
        limitValue: dto.limitValue,
        warningThresholdPct: dto.warningThresholdPct,
        hardLimit: dto.hardLimit,
        notes: dto.notes?.trim(),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
  }

  async getSupportTickets(tenantId?: string) {
    const where = tenantId ? { tenantId } : undefined
    const items = await this.prisma.supportTicket.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 120,
    })

    return {
      summary: {
        totalTickets: items.length,
        open: items.filter((ticket) => ticket.status === SupportTicketStatus.OPEN).length,
        inProgress: items.filter((ticket) => ticket.status === SupportTicketStatus.IN_PROGRESS).length,
        pendingCustomer: items.filter((ticket) => ticket.status === SupportTicketStatus.PENDING_CUSTOMER).length,
        resolved: items.filter((ticket) => ticket.status === SupportTicketStatus.RESOLVED).length,
        critical: items.filter((ticket) => ticket.priority === SupportTicketPriority.CRITICAL).length,
      },
      items,
    }
  }

  async createSupportTicket(dto: CreateSupportTicketDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: {
        id: true,
        tenantSettings: { select: { subscriptionPlan: true, subscriptionPlanExpiresAt: true } },
      },
    })

    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    const reference = await this.resolveTicketReference(dto.tenantId, dto.reference)
    // Enterprise's "Priority Support" perk: tickets default to HIGH instead of
    // NORMAL when the submitter doesn't pick a priority explicitly.
    const effectiveTier = tenant.tenantSettings
      ? resolveEffectiveSubscriptionTier(tenant.tenantSettings.subscriptionPlan, tenant.tenantSettings.subscriptionPlanExpiresAt)
      : SubscriptionPlanTier.FREE
    const defaultPriority = effectiveTier === SubscriptionPlanTier.ENTERPRISE ? SupportTicketPriority.HIGH : SupportTicketPriority.NORMAL

    return this.prisma.supportTicket.create({
      data: {
        tenantId: dto.tenantId,
        reference,
        subject: dto.subject.trim(),
        category: dto.category.trim(),
        priority: dto.priority ?? defaultPriority,
        status: dto.status ?? SupportTicketStatus.OPEN,
        channel: dto.channel,
        customerReference: dto.customerReference?.trim(),
        phoneNumber: dto.phoneNumber?.trim(),
        email: dto.email?.trim(),
        openedBy: dto.openedBy?.trim(),
        assignedTo: dto.assignedTo?.trim(),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  }

  async updateSupportTicket(ticketId: string, dto: UpdateSupportTicketDto, tenantId?: string) {
    const existing = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    })

    if (!existing) {
      throw new NotFoundException('Support ticket not found')
    }

    if (tenantId && existing.tenantId !== tenantId) {
      throw new NotFoundException('Support ticket not found')
    }

    const resolvedStatuses = new Set<SupportTicketStatus>([
      SupportTicketStatus.RESOLVED,
      SupportTicketStatus.CLOSED,
    ])
    const nextStatus = dto.status ?? existing.status
    const now = new Date()

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: dto.status,
        priority: dto.priority,
        assignedTo: dto.assignedTo?.trim(),
        latestResponseAt: now,
        resolvedAt: resolvedStatuses.has(nextStatus) ? existing.resolvedAt ?? now : null,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  }

  async addSupportTicketMessage(ticketId: string, dto: AddSupportTicketMessageDto, tenantId?: string) {
    const existing = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        tenantId: true,
        status: true,
      },
    })

    if (!existing) {
      throw new NotFoundException('Support ticket not found')
    }

    if (tenantId && existing.tenantId !== tenantId) {
      throw new NotFoundException('Support ticket not found')
    }

    const now = new Date()
    const reopenedStatus =
      existing.status === SupportTicketStatus.RESOLVED || existing.status === SupportTicketStatus.CLOSED
        ? SupportTicketStatus.IN_PROGRESS
        : existing.status

    await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: {
          ticketId,
          authorName: dto.authorName.trim(),
          authorRole: dto.authorRole.trim(),
          body: dto.body.trim(),
          isInternal: dto.isInternal ?? false,
        },
      }),
      this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: {
          latestResponseAt: now,
          status: reopenedStatus,
          resolvedAt: reopenedStatus === SupportTicketStatus.IN_PROGRESS ? null : undefined,
        },
      }),
    ])

    return this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  }

  private async buildFeatureUsageSnapshot(tenantId: string): Promise<FeatureUsageSnapshot> {
    const [
      packages,
      routers,
      hotspots,
      agents,
      voucherBatches,
      activeSessions,
      openSupportTickets,
    ] = await this.prisma.$transaction([
      this.prisma.package.count({
        where: {
          tenantId,
          status: {
            in: [PackageStatus.ACTIVE, PackageStatus.DRAFT],
          },
        },
      }),
      this.prisma.router.count({ where: { tenantId } }),
      this.prisma.hotspot.count({ where: { tenantId } }),
      this.prisma.agent.count({
        where: {
          tenantId,
          status: AgentStatus.ACTIVE,
        },
      }),
      this.prisma.voucherBatch.count({
        where: {
          tenantId,
        },
      }),
      this.prisma.networkSession.count({
        where: {
          tenantId,
          status: SessionStatus.ACTIVE,
        },
      }),
      this.prisma.supportTicket.count({
        where: {
          tenantId,
          status: {
            in: [
              SupportTicketStatus.OPEN,
              SupportTicketStatus.IN_PROGRESS,
              SupportTicketStatus.PENDING_CUSTOMER,
            ],
          },
        },
      }),
    ])

    return {
      packages,
      routers,
      hotspots,
      agents,
      voucherBatches,
      activeSessions,
      openSupportTickets,
    }
  }

  private resolveCurrentUsage(limit: FeatureLimit, usage?: FeatureUsageSnapshot) {
    if (!usage) {
      return 0
    }

    switch (limit.code) {
      case 'packages':
        return usage.packages
      case 'routers':
        return usage.routers
      case 'hotspots':
        return usage.hotspots
      case 'agents':
        return usage.agents
      case 'voucher_batches':
        return usage.voucherBatches
      case 'active_sessions':
        return usage.activeSessions
      case 'open_support_tickets':
        return usage.openSupportTickets
      default:
        return 0
    }
  }

  private resolveLimitHealth(input: {
    isEnabled: boolean
    hardLimit: boolean
    limitValue: number | null
    warningThresholdPct: number
    currentUsage: number
  }) {
    if (!input.isEnabled) {
      return 'disabled'
    }

    if (input.limitValue === null || input.limitValue <= 0) {
      return 'unlimited'
    }

    if (input.currentUsage >= input.limitValue) {
      return input.hardLimit ? 'blocked' : 'exceeded'
    }

    const usagePercentage = Math.round((input.currentUsage / input.limitValue) * 100)
    if (usagePercentage >= input.warningThresholdPct) {
      return 'warning'
    }

    return 'healthy'
  }

  private async resolveTicketReference(tenantId: string, preferredReference?: string) {
    const cleanedPreferredReference = preferredReference?.trim().toUpperCase()
    if (cleanedPreferredReference) {
      return cleanedPreferredReference
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const generatedReference = `SUP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID()
        .slice(0, 6)
        .toUpperCase()}`
      const existing = await this.prisma.supportTicket.findFirst({
        where: {
          tenantId,
          reference: generatedReference,
        },
        select: { id: true },
      })

      if (!existing) {
        return generatedReference
      }
    }

    return `SUP-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`
  }

  private presentPlatformSettings(settings: {
    id: string
    mobileMoneyFeeBps: number
    voucherFeeBps: number
    proMobileMoneyFeeBps: number
    proVoucherFeeBps: number
    proSubscriptionPriceUgx: number
    proSubscriptionDurationDays: number
    proPlanEnabled: boolean
    proRenewalRule: string
    proGracePeriodDays: number
    subscriptionExpiryNotificationDays: string
    freePlanDescription: string
    proPlanDescription: string
    freePlanBenefits: string
    proPlanBenefits: string
    referralProgramEnabled: boolean
    resellerRegistrationEnabled: boolean
    referralCommissionBps: number
    referralHoldingPeriodDays: number
    enterpriseMobileMoneyFeeBps: number
    enterpriseVoucherFeeBps: number
    minimumWithdrawalUgx: number
    withdrawalFeeBps: number
    withdrawalFlatFeeUgx: number
    requireWithdrawalApproval: boolean
    instantWithdrawalsEnabled: boolean
    requireApprovalForFirstWithdrawal: boolean
    requireApprovalAboveAmountUgx: number | null
    failedSecretAttemptsBeforeLock: number
    withdrawalLockMinutes: number
    payoutNumberChangeRequiresApproval: boolean
    maxPayoutNumbers: number
    allowedPaymentNetworks: PaymentNetwork[]
    mtnCollectionProvider: PaymentProvider
    airtelCollectionProvider: PaymentProvider
    mtnDisbursementProvider: PaymentProvider
    airtelDisbursementProvider: PaymentProvider
    routerAutoConnectEnabled: boolean
    captivePortalFallbackMessage: string
    supportPhone: string | null
    supportEmail: string | null
    supportUrl: string | null
    voucherTemplateDefaultStyle: string
    auditLoggingEnabled: boolean
    updatedAt: Date
  }) {
    return {
      ...settings,
      mobileMoneyFeePercent: this.bpsToPercent(settings.mobileMoneyFeeBps),
      voucherFeePercent: this.bpsToPercent(settings.voucherFeeBps),
      proMobileMoneyFeePercent: this.bpsToPercent(settings.proMobileMoneyFeeBps),
      proVoucherFeePercent: this.bpsToPercent(settings.proVoucherFeeBps),
      referralCommissionPercent: this.bpsToPercent(settings.referralCommissionBps),
      enterpriseMobileMoneyFeePercent: this.bpsToPercent(settings.enterpriseMobileMoneyFeeBps),
      enterpriseVoucherFeePercent: this.bpsToPercent(settings.enterpriseVoucherFeeBps),
      withdrawalFeePercent: this.bpsToPercent(settings.withdrawalFeeBps),
    }
  }

  private percentToBps(value: number, field: string) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      throw new BadRequestException(`${field} must be between 0 and 100`)
    }
    return Math.round(numeric * 100)
  }

  private bpsToPercent(value?: number | null) {
    return value === null || value === undefined ? null : value / 100
  }

  private nonNegativeInt(value: number, field: string) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new BadRequestException(`${field} must be zero or greater`)
    }
    return Math.round(numeric)
  }

  private nonEmptyTrim(value: string, field: string) {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) {
      throw new BadRequestException(`${field} is required`)
    }
    return trimmed
  }

  private sanitizeExpiryDays(value: string) {
    const days = String(value)
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 60)
    const unique = Array.from(new Set(days)).sort((a, b) => b - a)
    if (unique.length === 0) {
      throw new BadRequestException('subscriptionExpiryNotificationDays must include at least one day between 0 and 60')
    }
    return unique.join(',')
  }

  private positiveInt(value: number, field: string) {
    const numeric = this.nonNegativeInt(value, field)
    if (numeric < 1) {
      throw new BadRequestException(`${field} must be at least 1`)
    }
    return numeric
  }

  private sanitizeNetworks(networks: PaymentNetwork[]) {
    const allowed = networks.filter((network) => network === PaymentNetwork.MTN || network === PaymentNetwork.AIRTEL)
    return Array.from(new Set(allowed))
  }

  private sanitizeProvider(provider: PaymentProvider) {
    if (!Object.values(PaymentProvider).includes(provider)) {
      throw new BadRequestException('Unsupported provider mode')
    }
    return provider
  }

  private nullableTrim(value?: string | null) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  private async writeAudit(
    input: {
      actor: AuthenticatedAdminUser
      tenantId?: string | null
      action: string
      entity: string
      entityId?: string
      details?: unknown
      severity?: AuditSeverity
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma
    const platformSettings = await client.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
    })
    if (!platformSettings.auditLoggingEnabled) {
      return
    }

    await client.auditLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        userId: input.actor.id,
        actorName: input.actor.displayName,
        actorEmail: input.actor.email,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        severity: input.severity ?? AuditSeverity.INFO,
        details: this.toJsonValue(input.details ?? {}),
      },
    })
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue
  }

  async uploadKycDocument(
    tenantId: string,
    uploadedById: string,
    documentType: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    const allowedTypes = Object.values(KycDocumentType)
    if (!allowedTypes.includes(documentType as KycDocumentType)) {
      throw new BadRequestException(`documentType must be one of: ${allowedTypes.join(', ')}`)
    }

    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF, JPEG, or PNG files are accepted')
    }

    const maxBytes = 8 * 1024 * 1024
    if (file.size > maxBytes) {
      throw new BadRequestException('File must be 8MB or smaller')
    }

    const document = await this.prisma.kycDocument.create({
      data: {
        tenantId,
        documentType: documentType as KycDocumentType,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileData: file.buffer,
        uploadedById,
      },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        createdAt: true,
      },
    })

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: uploadedById,
        action: 'kyc.document_uploaded',
        entity: 'KycDocument',
        entityId: document.id,
        details: { documentType, fileName: file.originalname },
      },
    })

    return document
  }

  async listKycDocuments(tenantId?: string) {
    return this.prisma.kycDocument.findMany({
      where: tenantId ? { tenantId } : undefined,
      select: {
        id: true,
        documentType: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        reviewNotes: true,
        reviewedAt: true,
        createdAt: true,
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getKycDocumentFile(documentId: string, tenantId?: string) {
    const document = await this.prisma.kycDocument.findUnique({ where: { id: documentId } })
    if (!document || (tenantId && document.tenantId !== tenantId)) {
      throw new NotFoundException('Document not found')
    }
    return document
  }

  async reviewKycDocument(documentId: string, reviewerId: string, approve: boolean, notes?: string) {
    const document = await this.prisma.kycDocument.findUnique({ where: { id: documentId } })
    if (!document) {
      throw new NotFoundException('Document not found')
    }

    const updated = await this.prisma.kycDocument.update({
      where: { id: documentId },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewedById: reviewerId,
        reviewNotes: notes?.trim() || null,
        reviewedAt: new Date(),
      },
      select: {
        id: true,
        documentType: true,
        status: true,
        reviewNotes: true,
        reviewedAt: true,
        tenantId: true,
      },
    })

    await this.prisma.auditLog.create({
      data: {
        tenantId: updated.tenantId,
        userId: reviewerId,
        action: approve ? 'kyc.document_approved' : 'kyc.document_rejected',
        entity: 'KycDocument',
        entityId: updated.id,
        severity: approve ? 'INFO' : 'WARNING',
        details: { notes: notes?.trim() || null },
      },
    })

    return updated
  }
}
