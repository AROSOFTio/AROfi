import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PaymentNetwork, PaymentStatus, Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PaymentRouterService } from '../payments/payment-router.service'
import { PhoneNumberService } from '../payments/phone-number.service'
import { mapRawStatusToPaymentStatus } from '../payments/payment-provider.interface'
import { SubscriptionPlanKey } from './dto/select-plan.dto'

export const SUBSCRIPTION_PLAN_CATALOG: Record<SubscriptionPlanKey, {
  name: string
  amountUgx: number
  commissionSummary: string
  routerLimit: string
  features: string[]
}> = {
  FREE: {
    name: 'Starter (Free)',
    amountUgx: 0,
    commissionSummary: '8% Mobile Money / 2% Voucher',
    routerLimit: 'Up to 5 Routers',
    features: ['Cloud WinBox Tunnels', 'Free Analytics', 'AROFi branding'],
  },
  PRO: {
    name: 'Pro Plan',
    amountUgx: 20000,
    commissionSummary: '4% Mobile Money / 0% Voucher',
    routerLimit: 'Up to 10 Routers',
    features: ['Cloud WinBox Tunnels', 'Custom Branding', '30-day analytics history'],
  },
  ENTERPRISE: {
    name: 'Enterprise Plan',
    amountUgx: 70000,
    commissionSummary: '1.6% mm gateway fee / 0% platform fee',
    routerLimit: 'Unlimited Routers',
    features: ['Cloud WinBox Tunnels', 'Custom Domains & SSL', 'Custom SMS Gateway API', 'Priority Support'],
  },
}

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
  subscriptionStatus?: 'ACTIVE' | 'PENDING_PAYMENT' | 'SKIPPED'
  subscriptionPendingPlan?: SubscriptionPlanKey
  subscriptionPaidUntil?: string
  subscriptionPayment?: SubscriptionPaymentState
  [key: string]: unknown
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRouterService: PaymentRouterService,
    private readonly phoneNumberService: PhoneNumberService,
  ) {}

  getPlanCatalog() {
    return Object.entries(SUBSCRIPTION_PLAN_CATALOG).map(([key, value]) => ({ key, ...value }))
  }

  async getStatus(tenantId: string) {
    const prefs = await this.getPreferences(tenantId)
    return this.presentStatus(prefs)
  }

  async selectPlan(tenantId: string, plan: SubscriptionPlanKey) {
    const prefs = await this.getPreferences(tenantId)

    if (plan === 'FREE') {
      prefs.selectedPlan = 'FREE'
      prefs.subscriptionStatus = 'ACTIVE'
      prefs.subscriptionPendingPlan = undefined
      prefs.subscriptionPaidUntil = undefined
      prefs.subscriptionPayment = undefined
    } else {
      prefs.subscriptionPendingPlan = plan
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

    const planDefinition = SUBSCRIPTION_PLAN_CATALOG[plan]
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
      prefs.selectedPlan = payment.plan
      prefs.subscriptionStatus = 'ACTIVE'
      prefs.subscriptionPendingPlan = undefined
      prefs.subscriptionPaidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      prefs.subscriptionPayment = undefined
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

  private async getPreferences(tenantId: string): Promise<SubscriptionPreferences> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, tenantSettings: { select: { routerOnboardingPreferences: true } } },
    })

    if (!tenant) {
      throw new NotFoundException('Tenant not found')
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
}
