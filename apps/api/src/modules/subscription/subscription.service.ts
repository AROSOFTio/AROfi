import { Injectable, BadRequestException, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PaymentNetwork, PaymentStatus, Prisma, SubscriptionPlanTier } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PLATFORM_SETTINGS_ID } from '../billing/billing.constants'
import { MailService } from '../mail/mail.service'
import { PaymentRouterService } from '../payments/payment-router.service'
import { PhoneNumberService } from '../payments/phone-number.service'
import { mapRawStatusToPaymentStatus } from '../payments/payment-provider.interface'
import { SubscriptionPlanKey } from './dto/select-plan.dto'

// How far ahead of expiry to start emailing a renewal reminder.
const EXPIRY_REMINDER_WINDOW_DAYS = 3

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
  ENTERPRISE: {
    name: 'Enterprise Plan',
    amountUgx: 70000,
    routerLimit: 'Unlimited Routers',
    features: ['Cloud WinBox Tunnels', 'Priority Support', 'Custom Domains & SMS Gateway (coming soon)'],
  },
}

const DAY_MS = 24 * 60 * 60 * 1000

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
  subscriptionExpiryReminderSentForExpiresAt?: string
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
  ) {}

  onModuleInit() {
    if (process.env.SUBSCRIPTION_EXPIRY_REMINDERS_ENABLED === 'false') {
      return
    }
    const intervalMs = Number.parseInt(process.env.SUBSCRIPTION_EXPIRY_REMINDER_INTERVAL_MS ?? '21600000', 10) // 6h default
    this.reminderTimer = setInterval(() => {
      void this.sendExpiryReminders().catch((error) => this.logger.error(error))
    }, intervalMs)
    void this.sendExpiryReminders().catch((error) => this.logger.error(error))
  }

  onModuleDestroy() {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer)
    }
  }

  // Reminds tenants on a paid plan whose subscription renews within the next
  // few days, so a lapsed payment doesn't silently drop them back to Free.
  // Dedupes per renewal cycle by remembering which expiresAt it last
  // reminded for, in the same JSON prefs blob the checkout flow already uses.
  private async sendExpiryReminders() {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + EXPIRY_REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000)

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
      const alreadyRemindedForThisCycle = prefs.subscriptionExpiryReminderSentForExpiresAt === row.subscriptionPlanExpiresAt.toISOString()
      if (alreadyRemindedForThisCycle) continue

      const recipientEmail = row.tenant.supportEmail ?? row.tenant.users[0]?.email
      if (!recipientEmail) continue

      const recipientName = row.tenant.users[0]
        ? `${row.tenant.users[0].firstName ?? ''} ${row.tenant.users[0].lastName ?? ''}`.trim() || row.tenant.name
        : row.tenant.name

      const daysRemaining = Math.max(0, Math.ceil((row.subscriptionPlanExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))

      try {
        await this.mailService.sendSubscriptionExpiryReminderEmail({
          to: recipientEmail,
          tenantName: row.tenant.name,
          recipientName,
          plan: row.subscriptionPlan as 'PRO' | 'ENTERPRISE',
          expiresAt: row.subscriptionPlanExpiresAt,
          daysRemaining,
        })

        await this.prisma.tenantSetting.update({
          where: { tenantId: row.tenantId },
          data: {
            routerOnboardingPreferences: {
              ...prefs,
              subscriptionExpiryReminderSentForExpiresAt: row.subscriptionPlanExpiresAt.toISOString(),
            } as Prisma.InputJsonValue,
          },
        })
      } catch (error) {
        this.logger.warn(
          `Failed to send subscription expiry reminder for tenant ${row.tenantId}: ${error instanceof Error ? error.message : String(error)}`,
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
      ENTERPRISE: this.formatCommissionSummary(
        platformSettings.enterpriseMobileMoneyFeeBps,
        platformSettings.enterpriseVoucherFeeBps,
      ),
    }

    return Object.entries(SUBSCRIPTION_PLAN_CATALOG).map(([key, value]) => ({
      key,
      ...value,
      amountUgx: key === 'PRO' ? platformSettings.proSubscriptionPriceUgx : value.amountUgx,
      durationDays: key === 'PRO' ? platformSettings.proSubscriptionDurationDays : value.durationDays,
      commissionSummary: commissionSummaryByPlan[key as SubscriptionPlanKey],
    }))
  }

  private formatCommissionSummary(mobileMoneyFeeBps: number, voucherFeeBps: number) {
    return `${mobileMoneyFeeBps / 100}% Mobile Money / ${voucherFeeBps / 100}% Voucher`
  }

  async getStatus(tenantId: string) {
    const prefs = await this.getPreferences(tenantId)
    return this.presentStatus(prefs)
  }

  async selectPlan(tenantId: string, plan: SubscriptionPlanKey) {
    const prefs = await this.getPreferences(tenantId)

    if (plan === 'FREE') {
      prefs.selectedPlan = 'FREE'
      prefs.planSelectionConfirmed = true
      prefs.subscriptionStatus = 'ACTIVE'
      prefs.subscriptionPendingPlan = undefined
      prefs.subscriptionPaidUntil = undefined
      prefs.subscriptionPayment = undefined
      await this.persistActivePlan(tenantId, 'FREE', null)
    } else {
      prefs.subscriptionPendingPlan = plan
      prefs.planSelectionConfirmed = true
      prefs.subscriptionStatus = 'PENDING_PAYMENT'
      prefs.subscriptionPayment = undefined
      if (!prefs.selectedPlan) {
        prefs.selectedPlan = 'FREE'
      }
    }

    await this.savePreferences(tenantId, prefs)
    return this.presentStatus(prefs)
  }

  async skipPayment(tenantId: string) {
    const prefs = await this.getPreferences(tenantId)

    if (!prefs.subscriptionPendingPlan) {
      throw new BadRequestException('No pending plan to skip. Select a paid plan first.')
    }

    prefs.subscriptionStatus = 'SKIPPED'
    prefs.subscriptionPayment = undefined
    await this.savePreferences(tenantId, prefs)
    return this.presentStatus(prefs)
  }

  async startCheckout(tenantId: string, phoneNumber: string) {
    const prefs = await this.getPreferences(tenantId)
    const plan = prefs.subscriptionPendingPlan

    if (!plan) {
      throw new BadRequestException('Select a Pro or Enterprise plan before checking out')
    }

    const planDefinition = await this.resolvePlanDefinition(plan)
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

    prefs.subscriptionStatus = 'PENDING_PAYMENT'
    prefs.subscriptionPayment = {
      id: randomUUID(),
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

    await this.savePreferences(tenantId, prefs)
    return this.presentStatus(prefs)
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
      const paidUntil = new Date(Date.now() + planDefinition.durationDays * DAY_MS)
      prefs.selectedPlan = payment.plan
      prefs.subscriptionStatus = 'ACTIVE'
      prefs.subscriptionPendingPlan = undefined
      prefs.subscriptionPaidUntil = paidUntil.toISOString()
      prefs.subscriptionPayment = undefined
      await this.persistActivePlan(tenantId, payment.plan, paidUntil)
    } else if (status === PaymentStatus.FAILED || status === PaymentStatus.CANCELLED || status === PaymentStatus.EXPIRED) {
      prefs.subscriptionStatus = 'PENDING_PAYMENT'
      prefs.subscriptionPayment = undefined
    } else {
      prefs.subscriptionPayment = payment
    }

    await this.savePreferences(tenantId, prefs)
    return this.presentStatus(prefs)
  }

  private presentStatus(prefs: SubscriptionPreferences) {
    return {
      selectedPlan: prefs.selectedPlan ?? 'FREE',
      planSelectionConfirmed: Boolean(prefs.planSelectionConfirmed),
      subscriptionStatus: prefs.subscriptionStatus ?? 'ACTIVE',
      pendingPlan: prefs.subscriptionPendingPlan ?? null,
      paidUntil: prefs.subscriptionPaidUntil ?? null,
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
      },
    })

    return {
      ...base,
      amountUgx: platformSettings.proSubscriptionPriceUgx,
      durationDays: platformSettings.proSubscriptionDurationDays,
    }
  }

  private async getPreferences(tenantId: string): Promise<SubscriptionPreferences> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, tenantSettings: { select: { routerOnboardingPreferences: true } } },
    })

    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    const raw = (tenant.tenantSettings?.routerOnboardingPreferences as SubscriptionPreferences | null) ?? {}
    return { ...raw }
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
  private async persistActivePlan(tenantId: string, plan: SubscriptionPlanKey, expiresAt: Date | null) {
    const data = {
      subscriptionPlan: plan as SubscriptionPlanTier,
      subscriptionPlanExpiresAt: expiresAt,
    }

    await this.prisma.tenantSetting.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    })
  }
}
