import { Injectable, BadRequestException, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { AuditSeverity, NotificationAudience, PaymentNetwork, PaymentStatus, Prisma, SubscriptionPlanTier } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PLATFORM_SETTINGS_ID } from '../billing/billing.constants'
import { MailService } from '../mail/mail.service'
import { RealtimeEventsService } from '../events/realtime-events.service'
import { PaymentRouterService } from '../payments/payment-router.service'
import { PhoneNumberService } from '../payments/phone-number.service'
import { mapRawStatusToPaymentStatus } from '../payments/payment-provider.interface'
import { ReferralsService } from '../referrals/referrals.service'
import { SubscriptionPlanKey } from './dto/select-plan.dto'

const EXPIRY_NOTIFICATION_DAYS = [7, 3, 1, 0] as const

// Commission rates are intentionally NOT listed here: they are DevAdmin-configured
// (PlatformSetting.{mobileMoneyFeeBps,voucherFeeBps,proMobileMoneyFeeBps,...}) and
// must be read live in getPlanCatalog() below, never hardcoded, so a DevAdmin rate
// change takes effect immediately for every tenant on that tier without a redeploy.
export const SUBSCRIPTION_PLAN_CATALOG: Record<SubscriptionPlanKey, {
  name: string
  amountUgx: number
  durationDays?: number
  routerLimit: string
  features: string[]
}> = {
  FREE: {
    name: 'Starter (Free)',
    amountUgx: 0,
    routerLimit: 'Up to 5 Routers',
    features: ['Cloud WinBox Tunnels', '7-day analytics history', 'AROFi branding'],
  },
  PRO: {
    name: 'Pro Plan',
    amountUgx: 20000,
    durationDays: 30,
    routerLimit: 'Up to 10 Routers',
    features: ['Cloud WinBox Tunnels', 'Custom Branding', '30-day analytics history'],
  },
}

const DAY_MS = 24 * 60 * 60 * 1000
const STALE_SUBSCRIPTION_CHECKOUT_MS = 15 * 60 * 1000
const PENDING_SUBSCRIPTION_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.INITIATED,
  PaymentStatus.PENDING,
  PaymentStatus.INDETERMINATE,
])
const FAILED_SUBSCRIPTION_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
  PaymentStatus.EXPIRED,
])

type SubscriptionPaymentState = {
  id: string
  plan: SubscriptionPlanKey
  amountUgx: number
  network: PaymentNetwork
  phoneNumber: string
  externalReference: string
  providerReference?: string
  status: PaymentStatus
  statusMessage?: string
  initiatedAt: string
}

type SubscriptionPreferences = {
  selectedPlan?: SubscriptionPlanKey
  planSelectionConfirmed?: boolean
  subscriptionStatus?: 'ACTIVE' | 'PENDING_PAYMENT' | 'SKIPPED'
  subscriptionPendingPlan?: SubscriptionPlanKey
  subscriptionPaidUntil?: string
  subscriptionPayment?: SubscriptionPaymentState
  subscriptionDowngradeScheduledAt?: string
  subscriptionDowngradeEffectiveAt?: string
  subscriptionLastPaymentPhoneNumber?: string
  subscriptionExpiryReminderSentForExpiresAt?: string
  subscriptionExpiryNotifications?: Record<string, string>
  subscriptionAutoDowngradedAt?: string
  [key: string]: unknown
}

@Injectable()
export class SubscriptionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionService.name)
  private reminderTimer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRouterService: PaymentRouterService,
    private readonly phoneNumberService: PhoneNumberService,
    private readonly mailService: MailService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly referralsService: ReferralsService,
  ) {}

  onModuleInit() {
    if (process.env.SUBSCRIPTION_EXPIRY_REMINDERS_ENABLED === 'false') {
      return
    }
    const intervalMs = Number.parseInt(process.env.SUBSCRIPTION_EXPIRY_REMINDER_INTERVAL_MS ?? '21600000', 10) // 6h default
    this.reminderTimer = setInterval(() => {
      void this.processSubscriptionLifecycle().catch((error) => this.logger.error(error))
    }, intervalMs)
    void this.processSubscriptionLifecycle().catch((error) => this.logger.error(error))
  }

  onModuleDestroy() {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer)
    }
  }

  private async processSubscriptionLifecycle() {
    await this.sendExpiryNotifications()
    await this.downgradeExpiredSubscriptions()
  }

  // Reminds paid-plan tenants at the configured 7/3/1/0 day windows. Dedupes
  // by (tenant, expiry timestamp, interval) in the same preferences JSON blob
  // used by the checkout flow.
  private async sendExpiryNotifications() {
    const now = new Date()
    const expiryNotificationDays = await this.getExpiryNotificationDays()
    const windowEnd = new Date(now.getTime() + Math.max(...expiryNotificationDays) * DAY_MS)

    const expiringTenants = await this.prisma.tenantSetting.findMany({
      where: {
        subscriptionPlan: { in: [SubscriptionPlanTier.PRO, SubscriptionPlanTier.ENTERPRISE] },
        subscriptionPlanExpiresAt: { gte: now, lte: windowEnd },
      },
      select: {
        tenantId: true,
        subscriptionPlan: true,
        subscriptionPlanExpiresAt: true,
        routerOnboardingPreferences: true,
        tenant: {
          select: {
            name: true,
            supportEmail: true,
            users: { select: { email: true, firstName: true, lastName: true }, take: 1 },
          },
        },
      },
    })

    for (const row of expiringTenants) {
      if (!row.subscriptionPlanExpiresAt) continue

      const prefs = (row.routerOnboardingPreferences as SubscriptionPreferences | null) ?? {}
      const daysRemaining = Math.max(0, Math.ceil((row.subscriptionPlanExpiresAt.getTime() - now.getTime()) / DAY_MS))
      if (!expiryNotificationDays.includes(daysRemaining)) continue

      const expiryKey = row.subscriptionPlanExpiresAt.toISOString()
      const notificationKey = `${expiryKey}:${daysRemaining}`
      const sentMap = prefs.subscriptionExpiryNotifications ?? {}
      if (sentMap[notificationKey]) continue

      const recipientEmail = row.tenant.supportEmail ?? row.tenant.users[0]?.email

      const recipientName = row.tenant.users[0]
        ? `${row.tenant.users[0].firstName ?? ''} ${row.tenant.users[0].lastName ?? ''}`.trim() || row.tenant.name
        : row.tenant.name

      const title = daysRemaining === 0
        ? `${row.subscriptionPlan} subscription expires today`
        : `${row.subscriptionPlan} subscription expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
      const body = [
        `Your ${row.subscriptionPlan} subscription for ${row.tenant.name} expires on ${row.subscriptionPlanExpiresAt.toLocaleDateString('en-UG')}.`,
        daysRemaining === 0 ? 'Renew today to keep your current plan fees.' : `You have ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining to renew from Settings > Subscription Plan.`,
        'If you do not renew, your account will automatically move to the Starter (Free) plan. Your account, router, customer bundles, Mobile Money collection, vouchers, and internet services will remain active.',
        'After downgrade, Starter fees apply: 8% on Mobile Money sales and 2% on voucher sales.',
      ].join('\n\n')

      try {
        await this.prisma.notification.create({
          data: {
            title,
            body,
            audience: NotificationAudience.SINGLE_BUSINESS,
            tenantId: row.tenantId,
          },
        })

        if (recipientEmail) {
          await this.mailService.sendSubscriptionExpiryReminderEmail({
            to: recipientEmail,
            tenantName: row.tenant.name,
            recipientName,
            plan: row.subscriptionPlan as 'PRO' | 'ENTERPRISE',
            expiresAt: row.subscriptionPlanExpiresAt,
            daysRemaining,
          })
        }

        await this.prisma.tenantSetting.update({
          where: { tenantId: row.tenantId },
          data: {
            routerOnboardingPreferences: {
              ...prefs,
              subscriptionExpiryNotifications: {
                ...sentMap,
                [notificationKey]: new Date().toISOString(),
              },
              subscriptionExpiryReminderSentForExpiresAt: row.subscriptionPlanExpiresAt.toISOString(),
            } as Prisma.InputJsonValue,
          },
        })
      } catch (error) {
        this.logger.warn(
          `Failed to send subscription expiry notification for tenant ${row.tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  private async downgradeExpiredSubscriptions() {
    const now = new Date()
    const expiredTenants = await this.prisma.tenantSetting.findMany({
      where: {
        subscriptionPlan: { in: [SubscriptionPlanTier.PRO, SubscriptionPlanTier.ENTERPRISE] },
        subscriptionPlanExpiresAt: { lte: now },
      },
      select: {
        tenantId: true,
        subscriptionPlan: true,
        subscriptionPlanExpiresAt: true,
        routerOnboardingPreferences: true,
        tenant: {
          select: {
            name: true,
            supportEmail: true,
            users: { select: { email: true, firstName: true, lastName: true }, take: 1 },
          },
        },
      },
    })

    for (const row of expiredTenants) {
      if (!row.subscriptionPlanExpiresAt) continue
      const downgradedAt = new Date()
      const previousPlan = row.subscriptionPlan
      const expiryIso = row.subscriptionPlanExpiresAt.toISOString()
      const prefs = (row.routerOnboardingPreferences as SubscriptionPreferences | null) ?? {}

      try {
        await this.prisma.$transaction(async (tx) => {
          const current = await tx.tenantSetting.findUnique({
            where: { tenantId: row.tenantId },
            select: { subscriptionPlan: true, subscriptionPlanExpiresAt: true, routerOnboardingPreferences: true },
          })
          if (
            !current?.subscriptionPlanExpiresAt ||
            current.subscriptionPlan === SubscriptionPlanTier.FREE ||
            current.subscriptionPlanExpiresAt.getTime() > now.getTime()
          ) {
            return
          }

          const currentPrefs = (current.routerOnboardingPreferences as SubscriptionPreferences | null) ?? prefs
          await tx.tenantSetting.update({
            where: { tenantId: row.tenantId },
            data: {
              subscriptionPlan: SubscriptionPlanTier.FREE,
              subscriptionPlanExpiresAt: null,
              routerOnboardingPreferences: {
                ...currentPrefs,
                selectedPlan: 'FREE',
                subscriptionStatus: 'ACTIVE',
                subscriptionPendingPlan: undefined,
                subscriptionPayment: undefined,
                subscriptionPaidUntil: undefined,
                subscriptionAutoDowngradedAt: downgradedAt.toISOString(),
              } as Prisma.InputJsonValue,
            },
          })

          await tx.auditLog.create({
            data: {
              tenantId: row.tenantId,
              action: 'subscription.auto_downgraded',
              entity: 'TenantSetting',
              entityId: row.tenantId,
              severity: AuditSeverity.INFO,
              details: {
                previousPlan,
                newPlan: SubscriptionPlanTier.FREE,
                expiredAt: expiryIso,
                downgradedAt: downgradedAt.toISOString(),
                reason: 'Paid subscription expired without renewal',
                servicesRemainActive: true,
              } as Prisma.InputJsonValue,
            },
          })

          await tx.notification.create({
            data: {
              title: 'Subscription moved to Starter',
              body: [
                `Your ${previousPlan} subscription for ${row.tenant.name} expired on ${row.subscriptionPlanExpiresAt!.toLocaleDateString('en-UG')}.`,
                'Your account has automatically moved to the Starter (Free) plan.',
                'Your account, router, customer bundles, Mobile Money collection, vouchers, and internet services remain active.',
                'Starter fees now apply: 8% on Mobile Money sales and 2% on voucher sales.',
              ].join('\n\n'),
              audience: NotificationAudience.SINGLE_BUSINESS,
              tenantId: row.tenantId,
            },
          })
        })

        const recipientEmail = row.tenant.supportEmail ?? row.tenant.users[0]?.email
        if (recipientEmail) {
          const recipientName = row.tenant.users[0]
            ? `${row.tenant.users[0].firstName ?? ''} ${row.tenant.users[0].lastName ?? ''}`.trim() || row.tenant.name
            : row.tenant.name
          await this.mailService.sendSubscriptionDowngradeEmail({
            to: recipientEmail,
            tenantName: row.tenant.name,
            recipientName,
            previousPlan: previousPlan as 'PRO' | 'ENTERPRISE',
            expiredAt: row.subscriptionPlanExpiresAt,
          })
        }

        this.realtimeEvents.publish('alert', {
          tenantId: row.tenantId,
          data: {
            category: 'subscription',
            action: 'auto_downgraded',
            previousPlan,
            newPlan: SubscriptionPlanTier.FREE,
            expiredAt: expiryIso,
          },
        })
      } catch (error) {
        this.logger.error(
          `Failed to auto-downgrade expired subscription for tenant ${row.tenantId}`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    }
  }

  async getPlanCatalog() {
    const platformSettings = await this.prisma.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
    })

    const commissionSummaryByPlan: Record<SubscriptionPlanKey, string> = {
      FREE: this.formatCommissionSummary(platformSettings.mobileMoneyFeeBps, platformSettings.voucherFeeBps),
      PRO: this.formatCommissionSummary(platformSettings.proMobileMoneyFeeBps, platformSettings.proVoucherFeeBps),
    }

    return Object.entries(SUBSCRIPTION_PLAN_CATALOG).map(([key, value]) => ({
      key,
      ...value,
      enabled: key === 'PRO' ? platformSettings.proPlanEnabled : true,
      amountUgx: key === 'PRO' ? platformSettings.proSubscriptionPriceUgx : value.amountUgx,
      durationDays: key === 'PRO' ? platformSettings.proSubscriptionDurationDays : value.durationDays,
      description: key === 'FREE'
        ? platformSettings.freePlanDescription
        : key === 'PRO'
          ? platformSettings.proPlanDescription
          : value.features.join('. '),
      renewalRule: key === 'PRO' ? platformSettings.proRenewalRule : 'NO_SUBSCRIPTION_PAYMENT',
      gracePeriodDays: key === 'PRO' ? platformSettings.proGracePeriodDays : 0,
      expiryNotificationDays: platformSettings.subscriptionExpiryNotificationDays,
      features: key === 'FREE'
        ? this.splitPipeList(platformSettings.freePlanBenefits)
        : key === 'PRO'
          ? this.splitPipeList(platformSettings.proPlanBenefits)
          : value.features,
      commissionSummary: commissionSummaryByPlan[key as SubscriptionPlanKey],
    }))
  }

  private formatCommissionSummary(mobileMoneyFeeBps: number, voucherFeeBps: number) {
    return `${mobileMoneyFeeBps / 100}% Mobile Money / ${voucherFeeBps / 100}% Voucher`
  }

  async getStatus(tenantId: string) {
    const { prefs, tenantSettings } = await this.getPreferenceState(tenantId)
    const normalizedPrefs = await this.clearStaleCheckout(tenantId, prefs)
    const payments = await this.prisma.subscriptionPayment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        plan: true,
        status: true,
        amountUgx: true,
        durationDays: true,
        network: true,
        phoneNumber: true,
        externalReference: true,
        providerReference: true,
        statusMessage: true,
        initiatedAt: true,
        completedAt: true,
        failedAt: true,
        createdAt: true,
      },
    })
    return { ...this.presentStatus(normalizedPrefs, tenantSettings), payments }
  }

  async selectPlan(tenantId: string, plan: SubscriptionPlanKey) {
    const prefs = await this.getPreferences(tenantId)
    const tenantSettings = await this.getTenantPlanState(tenantId)

    if (plan === 'FREE') {
      const activePaidPlan =
        tenantSettings?.subscriptionPlan &&
        tenantSettings.subscriptionPlan !== SubscriptionPlanTier.FREE &&
        tenantSettings.subscriptionPlanExpiresAt &&
        tenantSettings.subscriptionPlanExpiresAt.getTime() > Date.now()

      prefs.selectedPlan = 'FREE'
      prefs.planSelectionConfirmed = true
      prefs.subscriptionStatus = 'ACTIVE'
      prefs.subscriptionPendingPlan = undefined
      prefs.subscriptionPaidUntil = undefined
      prefs.subscriptionPayment = undefined
      if (activePaidPlan) {
        prefs.subscriptionDowngradeScheduledAt = new Date().toISOString()
        prefs.subscriptionDowngradeEffectiveAt = tenantSettings.subscriptionPlanExpiresAt!.toISOString()
        await this.savePreferences(tenantId, prefs)
        return this.presentStatus(prefs, tenantSettings)
      }
      prefs.subscriptionDowngradeScheduledAt = undefined
      prefs.subscriptionDowngradeEffectiveAt = undefined
      await this.persistActivePlan(tenantId, 'FREE', null)
    } else {
      if (
        tenantSettings?.subscriptionPlan === plan &&
        tenantSettings.subscriptionPlanExpiresAt &&
        tenantSettings.subscriptionPlanExpiresAt.getTime() > Date.now() &&
        prefs.subscriptionDowngradeEffectiveAt
      ) {
        prefs.selectedPlan = plan
        prefs.subscriptionStatus = 'ACTIVE'
        prefs.subscriptionPendingPlan = undefined
        prefs.subscriptionPayment = undefined
        prefs.subscriptionDowngradeScheduledAt = undefined
        prefs.subscriptionDowngradeEffectiveAt = undefined
        await this.savePreferences(tenantId, prefs)
        return this.presentStatus(prefs, tenantSettings)
      }
      const planDefinition = await this.resolvePlanDefinition(plan)
      if (plan === 'PRO' && !planDefinition.enabled) {
        throw new BadRequestException('The Pro plan is currently disabled by Main Admin')
      }
      prefs.subscriptionPendingPlan = plan
      prefs.planSelectionConfirmed = true
      prefs.subscriptionStatus = 'PENDING_PAYMENT'
      prefs.subscriptionPayment = undefined
      prefs.subscriptionDowngradeScheduledAt = undefined
      prefs.subscriptionDowngradeEffectiveAt = undefined
      if (!prefs.selectedPlan) {
        prefs.selectedPlan = 'FREE'
      }
    }

    await this.savePreferences(tenantId, prefs)
    return this.presentStatus(prefs, tenantSettings)
  }

  async skipPayment(tenantId: string) {
    const prefs = await this.getPreferences(tenantId)

    if (!prefs.subscriptionPendingPlan) {
      throw new BadRequestException('No pending plan to skip. Select a paid plan first.')
    }

    prefs.subscriptionStatus = 'SKIPPED'
    prefs.subscriptionPayment = undefined
    await this.savePreferences(tenantId, prefs)
    const tenantSettings = await this.getTenantPlanState(tenantId)
    return this.presentStatus(prefs, tenantSettings)
  }

  async startCheckout(tenantId: string, phoneNumber: string) {
    const prefs = await this.getPreferences(tenantId)
    const plan = prefs.subscriptionPendingPlan

    if (!plan) {
      throw new BadRequestException('Select Pro before checking out')
    }

    if (
      prefs.subscriptionPayment &&
      PENDING_SUBSCRIPTION_PAYMENT_STATUSES.has(prefs.subscriptionPayment.status) &&
      Date.now() - new Date(prefs.subscriptionPayment.initiatedAt).getTime() < 2 * 60 * 1000
    ) {
      return this.presentStatus(prefs)
    }

    const planDefinition = await this.resolvePlanDefinition(plan)
    if (plan === 'PRO' && !planDefinition.enabled) {
      throw new BadRequestException('The Pro plan is currently disabled by Main Admin')
    }
    const network = this.phoneNumberService.resolveNetwork(phoneNumber)
    const normalizedPhone = this.phoneNumberService.normalizeForNetwork(phoneNumber, network)
    const externalReference = `SUB-${tenantId.slice(0, 8)}-${Date.now()}`

    const collectionProvider = this.paymentRouterService.resolveCollection(network)
    const gatewayResponse = await collectionProvider.collectPayment({
      amountUgx: planDefinition.amountUgx,
      currency: 'UGX',
      phoneNumber: normalizedPhone,
      externalReference,
      narrative: `AROFi ${planDefinition.name} subscription`,
      network,
    })

    const status = mapRawStatusToPaymentStatus(gatewayResponse.transactionStatus)
    const subscriptionPayment = await this.prisma.subscriptionPayment.create({
      data: {
        tenantId,
        plan: plan as SubscriptionPlanTier,
        status,
        amountUgx: planDefinition.amountUgx,
        durationDays: planDefinition.durationDays,
        currency: 'UGX',
        network,
        phoneNumber: normalizedPhone,
        externalReference,
        providerReference: gatewayResponse.transactionReference,
        statusMessage: gatewayResponse.statusMessage,
        requestPayload: {
          amountUgx: planDefinition.amountUgx,
          currency: 'UGX',
          phoneNumber: normalizedPhone,
          externalReference,
          network,
        } as Prisma.InputJsonValue,
        responsePayload: gatewayResponse as Prisma.InputJsonValue,
        completedAt: status === PaymentStatus.COMPLETED ? new Date() : null,
        failedAt: FAILED_SUBSCRIPTION_PAYMENT_STATUSES.has(status) ? new Date() : null,
      },
    })

    prefs.subscriptionStatus = 'PENDING_PAYMENT'
    prefs.subscriptionPayment = {
      id: subscriptionPayment.id,
      plan,
      amountUgx: planDefinition.amountUgx,
      network,
      phoneNumber: normalizedPhone,
      externalReference,
      providerReference: gatewayResponse.transactionReference,
      status,
      statusMessage: gatewayResponse.statusMessage,
      initiatedAt: new Date().toISOString(),
    }
    prefs.subscriptionLastPaymentPhoneNumber = normalizedPhone

    await this.savePreferences(tenantId, prefs)
    const tenantSettings = await this.getTenantPlanState(tenantId)
    return this.presentStatus(prefs, tenantSettings)
  }

  async refreshCheckoutStatus(tenantId: string) {
    const prefs = await this.getPreferences(tenantId)
    const payment = prefs.subscriptionPayment

    if (!payment) {
      throw new NotFoundException('No subscription checkout in progress')
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      return this.presentStatus(prefs)
    }

    const referenceId = payment.providerReference ?? payment.externalReference
    const gatewayResponse = await this.paymentRouterService
      .resolveCollection(payment.network)
      .getPaymentStatus(referenceId)

    const status = mapRawStatusToPaymentStatus(gatewayResponse.transactionStatus)
    payment.status = status
    payment.statusMessage = gatewayResponse.statusMessage
    if (gatewayResponse.transactionReference) {
      payment.providerReference = gatewayResponse.transactionReference
    }

    if (status === PaymentStatus.COMPLETED) {
      const planDefinition = await this.resolvePlanDefinition(payment.plan)
      if (payment.amountUgx !== planDefinition.amountUgx) {
        throw new BadRequestException('Subscription payment amount no longer matches the active plan price')
      }
      const tenantSettings = await this.getTenantPlanState(tenantId)
      const activeExpiry = tenantSettings?.subscriptionPlan === payment.plan && tenantSettings.subscriptionPlanExpiresAt && tenantSettings.subscriptionPlanExpiresAt.getTime() > Date.now()
        ? tenantSettings.subscriptionPlanExpiresAt.getTime()
        : Date.now()
      const paidUntil = new Date(activeExpiry + planDefinition.durationDays * DAY_MS)
      prefs.selectedPlan = payment.plan
      prefs.subscriptionStatus = 'ACTIVE'
      prefs.subscriptionPendingPlan = undefined
      prefs.subscriptionPaidUntil = paidUntil.toISOString()
      prefs.subscriptionPayment = undefined
      prefs.subscriptionDowngradeScheduledAt = undefined
      prefs.subscriptionDowngradeEffectiveAt = undefined
      await this.prisma.$transaction(async (tx) => {
        await tx.subscriptionPayment.updateMany({
          where: { OR: [{ id: payment.id }, { externalReference: payment.externalReference }] },
          data: {
            status,
            providerReference: payment.providerReference,
            statusMessage: payment.statusMessage,
            responsePayload: gatewayResponse as Prisma.InputJsonValue,
            completedAt: new Date(),
            failedAt: null,
          },
        })
        await this.persistActivePlan(tenantId, payment.plan, paidUntil, tx)
        await tx.auditLog.create({
          data: {
            tenantId,
            action: 'subscription.payment_verified',
            entity: 'SubscriptionPayment',
            entityId: payment.id,
            severity: AuditSeverity.INFO,
            details: {
              plan: payment.plan,
              amountUgx: payment.amountUgx,
              externalReference: payment.externalReference,
              providerReference: payment.providerReference,
              paidUntil: paidUntil.toISOString(),
            } as Prisma.InputJsonValue,
          },
        })
        await tx.notification.create({
          data: {
            title: `${payment.plan} plan activated`,
            body: `Payment confirmed. Your ${payment.plan} plan is active until ${paidUntil.toLocaleDateString('en-UG')}.`,
            audience: NotificationAudience.SINGLE_BUSINESS,
            tenantId,
          },
        })
        const referralCommission = await this.referralsService.recordQualifiedSubscriptionPayment({
          tenantId,
          subscriptionPaymentId: payment.id,
          plan: payment.plan as SubscriptionPlanTier,
          amountUgx: payment.amountUgx,
          paidAt: new Date(),
          tx,
        })
        await tx.platformSetting.update({
          where: { id: PLATFORM_SETTINGS_ID },
          data: {
            platformWalletBalanceUgx: {
              increment: Math.max(0, payment.amountUgx - (referralCommission?.amountUgx ?? 0)),
            },
          },
        })
      })
    } else if (status === PaymentStatus.FAILED || status === PaymentStatus.CANCELLED || status === PaymentStatus.EXPIRED) {
      prefs.subscriptionStatus = 'PENDING_PAYMENT'
      prefs.subscriptionPayment = undefined
      await this.prisma.subscriptionPayment.updateMany({
        where: { OR: [{ id: payment.id }, { externalReference: payment.externalReference }] },
        data: {
          status,
          providerReference: payment.providerReference,
          statusMessage: payment.statusMessage,
          responsePayload: gatewayResponse as Prisma.InputJsonValue,
          failedAt: new Date(),
        },
      })
    } else {
      prefs.subscriptionPayment = payment
      await this.prisma.subscriptionPayment.updateMany({
        where: { OR: [{ id: payment.id }, { externalReference: payment.externalReference }] },
        data: {
          status,
          providerReference: payment.providerReference,
          statusMessage: payment.statusMessage,
          responsePayload: gatewayResponse as Prisma.InputJsonValue,
        },
      })
    }

    await this.savePreferences(tenantId, prefs)
    const tenantSettings = await this.getTenantPlanState(tenantId)
    return this.presentStatus(prefs, tenantSettings)
  }

  private presentStatus(prefs: SubscriptionPreferences, tenantSettings?: { subscriptionPlan: SubscriptionPlanTier; subscriptionPlanExpiresAt: Date | null } | null) {
    const expiresAt = tenantSettings?.subscriptionPlanExpiresAt?.toISOString() ?? prefs.subscriptionPaidUntil ?? null
    const remainingDays = expiresAt
      ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS))
      : null
    return {
      selectedPlan: prefs.selectedPlan ?? 'FREE',
      currentPlan: tenantSettings?.subscriptionPlan ?? prefs.selectedPlan ?? 'FREE',
      planSelectionConfirmed: Boolean(prefs.planSelectionConfirmed),
      subscriptionStatus: prefs.subscriptionStatus ?? 'ACTIVE',
      pendingPlan: prefs.subscriptionPendingPlan ?? null,
      paidUntil: expiresAt,
      remainingDays,
      downgradeScheduledAt: prefs.subscriptionDowngradeScheduledAt ?? null,
      downgradeEffectiveAt: prefs.subscriptionDowngradeEffectiveAt ?? null,
      lastPaymentPhoneNumber: prefs.subscriptionLastPaymentPhoneNumber ?? null,
      checkout: prefs.subscriptionPayment
        ? {
            status: prefs.subscriptionPayment.status,
            statusMessage: prefs.subscriptionPayment.statusMessage,
            amountUgx: prefs.subscriptionPayment.amountUgx,
            plan: prefs.subscriptionPayment.plan,
          }
        : null,
    }
  }

  private async resolvePlanDefinition(plan: SubscriptionPlanKey) {
    const base = SUBSCRIPTION_PLAN_CATALOG[plan]
    if (plan !== 'PRO') {
      return {
        ...base,
        enabled: true,
        durationDays: base.durationDays ?? 30,
      }
    }

    const platformSettings = await this.prisma.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
      select: {
        proSubscriptionPriceUgx: true,
        proSubscriptionDurationDays: true,
        proPlanEnabled: true,
      },
    })

    return {
      ...base,
      enabled: platformSettings.proPlanEnabled,
      amountUgx: platformSettings.proSubscriptionPriceUgx,
      durationDays: platformSettings.proSubscriptionDurationDays,
    }
  }

  private async getExpiryNotificationDays() {
    const settings = await this.prisma.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
      select: { subscriptionExpiryNotificationDays: true },
    })
    const configured = settings.subscriptionExpiryNotificationDays
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((day) => Number.isInteger(day) && day >= 0)
    return configured.length > 0 ? Array.from(new Set(configured)) : [...EXPIRY_NOTIFICATION_DAYS]
  }

  private splitPipeList(value: string) {
    return value.split('|').map((item) => item.trim()).filter(Boolean)
  }

  private async getTenantPlanState(tenantId: string) {
    return this.prisma.tenantSetting.findUnique({
      where: { tenantId },
      select: { subscriptionPlan: true, subscriptionPlanExpiresAt: true },
    })
  }

  private async getPreferenceState(tenantId: string): Promise<{
    prefs: SubscriptionPreferences
    tenantSettings: { subscriptionPlan: SubscriptionPlanTier; subscriptionPlanExpiresAt: Date | null } | null
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        tenantSettings: {
          select: {
            routerOnboardingPreferences: true,
            subscriptionPlan: true,
            subscriptionPlanExpiresAt: true,
          },
        },
      },
    })

    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    const raw = (tenant.tenantSettings?.routerOnboardingPreferences as SubscriptionPreferences | null) ?? {}
    return {
      prefs: { ...raw },
      tenantSettings: tenant.tenantSettings
        ? {
            subscriptionPlan: tenant.tenantSettings.subscriptionPlan,
            subscriptionPlanExpiresAt: tenant.tenantSettings.subscriptionPlanExpiresAt,
          }
        : null,
    }
  }

  private async getPreferences(tenantId: string): Promise<SubscriptionPreferences> {
    return (await this.getPreferenceState(tenantId)).prefs
  }

  private async clearStaleCheckout(tenantId: string, prefs: SubscriptionPreferences) {
    if (
      prefs.subscriptionStatus === 'PENDING_PAYMENT' &&
      prefs.subscriptionPayment &&
      PENDING_SUBSCRIPTION_PAYMENT_STATUSES.has(prefs.subscriptionPayment.status) &&
      Date.now() - new Date(prefs.subscriptionPayment.initiatedAt).getTime() > STALE_SUBSCRIPTION_CHECKOUT_MS
    ) {
      prefs.subscriptionPayment = undefined
      await this.savePreferences(tenantId, prefs)
    }
    return prefs
  }

  private async savePreferences(tenantId: string, prefs: SubscriptionPreferences) {
    await this.prisma.tenantSetting.upsert({
      where: { tenantId },
      update: { routerOnboardingPreferences: prefs as Prisma.InputJsonValue },
      create: { tenantId, routerOnboardingPreferences: prefs as Prisma.InputJsonValue },
    })
  }

  // Writes the authoritative plan columns the fee engine and reporting read
  // directly (TenantSetting.subscriptionPlan/subscriptionPlanExpiresAt),
  // separate from the JSON checkout-flow bookkeeping in routerOnboardingPreferences.
  private async persistActivePlan(tenantId: string, plan: SubscriptionPlanKey, expiresAt: Date | null, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma
    const data = {
      subscriptionPlan: plan as SubscriptionPlanTier,
      subscriptionPlanExpiresAt: expiresAt,
    }

    await client.tenantSetting.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    })
  }
}
