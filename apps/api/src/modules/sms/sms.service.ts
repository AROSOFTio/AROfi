import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PaymentStatus, Prisma, SmsCreditLedgerType, SmsMessageStatus, SmsProvider, SubscriptionPlanTier } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { mapRawStatusToPaymentStatus } from '../payments/payment-provider.interface'
import { PaymentRouterService } from '../payments/payment-router.service'
import { PhoneNumberService } from '../payments/phone-number.service'
import { resolveEffectiveSubscriptionTier } from '../subscription/subscription-plan.util'
import { CheckoutSmsCreditsDto } from './dto/checkout-sms-credits.dto'

type SendSmsInput = {
  tenantId?: string | null
  to: string
  body: string
  templateKey?: string
  requirePaidPlan?: boolean
}

type AfricaTalkingRecipient = {
  status?: string
  statusCode?: number
  number?: string
  messageId?: string
  cost?: string
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRouterService: PaymentRouterService,
    private readonly phoneNumberService: PhoneNumberService,
  ) {}

  async sendText(input: SendSmsInput): Promise<boolean> {
    const normalizedRecipient = this.normalizeUgandanPhone(input.to)
    const body = input.body.trim()
    const segments = this.estimateSegments(body)
    const estimatedCostUgx = segments * this.costPerSegmentUgx()
    const provider = this.provider()

    if (!normalizedRecipient || !body) {
      await this.logMessage({
        ...input,
        provider,
        status: SmsMessageStatus.SKIPPED,
        normalizedRecipient,
        segments,
        estimatedCostUgx,
        errorMessage: !normalizedRecipient ? 'Invalid recipient phone number' : 'Empty SMS body',
      })
      return false
    }

    if (input.requirePaidPlan !== false && input.tenantId && !(await this.tenantCanUseSms(input.tenantId))) {
      await this.logMessage({
        ...input,
        provider,
        status: SmsMessageStatus.SKIPPED,
        normalizedRecipient,
        segments,
        estimatedCostUgx,
        errorMessage: 'SMS notifications are available to active Pro and Enterprise tenants only',
      })
      return false
    }

    if (!this.isConfigured()) {
      await this.logMessage({
        ...input,
        provider: SmsProvider.DISABLED,
        status: SmsMessageStatus.SKIPPED,
        normalizedRecipient,
        segments,
        estimatedCostUgx,
        errorMessage: 'SMS provider is not configured',
      })
      return false
    }

    const reservation = input.tenantId
      ? await this.reserveCredits(input.tenantId, segments)
      : { ok: true as const, source: null as string | null }

    if (!reservation.ok) {
      await this.logMessage({
        ...input,
        provider,
        status: SmsMessageStatus.SKIPPED,
        normalizedRecipient,
        segments,
        estimatedCostUgx,
        errorMessage: reservation.reason,
      })
      return false
    }

    const queued = await this.logMessage({
      ...input,
      provider,
      status: SmsMessageStatus.QUEUED,
      normalizedRecipient,
      segments,
      estimatedCostUgx,
      creditSource: reservation.source,
    })

    try {
      const response = await this.sendViaAfricasTalking(normalizedRecipient, body)
      const recipient = response.SMSMessageData?.Recipients?.[0] as AfricaTalkingRecipient | undefined
      const delivered = Boolean(response.SMSMessageData) && !String(recipient?.status ?? '').toLowerCase().includes('invalid')

      await this.prisma.smsMessage.update({
        where: { id: queued.id },
        data: {
          status: delivered ? SmsMessageStatus.SENT : SmsMessageStatus.FAILED,
          providerMessageId: recipient?.messageId,
          providerResponse: response,
          errorMessage: delivered ? null : recipient?.status ?? 'Provider did not accept the SMS',
          sentAt: delivered ? new Date() : null,
        },
      })

      if (!delivered && input.tenantId) {
        await this.refundCredits(input.tenantId, segments, reservation.source, queued.id, 'Provider did not accept the SMS')
      }
      return delivered
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.prisma.smsMessage.update({
        where: { id: queued.id },
        data: {
          status: SmsMessageStatus.FAILED,
          errorMessage: message,
        },
      })
      if (input.tenantId) {
        await this.refundCredits(input.tenantId, segments, reservation.source, queued.id, message)
      }
      this.logger.warn(`Failed to send SMS to ${normalizedRecipient}: ${message}`)
      return false
    }
  }

  async getWalletStatus(tenantId: string) {
    const settings = await this.ensureTenantSmsSettings(tenantId)
    const normalized = await this.ensureCurrentCycle(settings)
    const tier = resolveEffectiveSubscriptionTier(normalized.subscriptionPlan, normalized.subscriptionPlanExpiresAt)
    const includedRemaining = tier === SubscriptionPlanTier.FREE ? 0 : Math.max(0, normalized.smsMonthlyIncluded - normalized.smsMonthlyUsed)
    const pendingPurchase = await this.prisma.smsCreditPurchase.findFirst({
      where: { tenantId, status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING, PaymentStatus.INDETERMINATE] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, smsQuantity: true, amountUgx: true, statusMessage: true, createdAt: true },
    })

    return {
      enabled: tier === SubscriptionPlanTier.PRO || tier === SubscriptionPlanTier.ENTERPRISE,
      provider: this.provider(),
      providerConfigured: this.isConfigured(),
      currentPlan: tier,
      includedMonthly: normalized.smsMonthlyIncluded,
      includedUsed: normalized.smsMonthlyUsed,
      includedRemaining,
      purchasedBalance: normalized.smsPurchasedBalance,
      totalAvailable: includedRemaining + normalized.smsPurchasedBalance,
      unitPriceUgx: normalized.smsUnitPriceUgx,
      minimumPurchaseSms: 50,
      minimumPurchaseUgx: 50 * normalized.smsUnitPriceUgx,
      cycleStartedAt: normalized.smsMonthlyCycleStartedAt,
      pendingPurchase,
    }
  }

  async startCreditCheckout(tenantId: string, dto: CheckoutSmsCreditsDto) {
    const wallet = await this.getWalletStatus(tenantId)
    if (!wallet.enabled) {
      throw new BadRequestException('SMS top-ups are available to active Pro and Enterprise tenants only')
    }

    const smsQuantity = Math.max(50, Math.floor(dto.smsQuantity))
    const amountUgx = smsQuantity * wallet.unitPriceUgx
    const network = this.phoneNumberService.resolveNetwork(dto.phoneNumber)
    const normalizedPhone = this.phoneNumberService.normalizeForNetwork(dto.phoneNumber, network)
    const externalReference = `SMS-${tenantId.slice(0, 8)}-${Date.now()}`
    const provider = this.paymentRouterService.resolveCollection(network)
    const gatewayResponse = await provider.collectPayment({
      amountUgx,
      currency: 'UGX',
      phoneNumber: normalizedPhone,
      externalReference,
      narrative: `AROFi ${smsQuantity} SMS credits`,
      network,
    })
    const status = mapRawStatusToPaymentStatus(gatewayResponse.transactionStatus)

    const purchase = await this.prisma.smsCreditPurchase.create({
      data: {
        tenantId,
        status,
        smsQuantity,
        unitPriceUgx: wallet.unitPriceUgx,
        amountUgx,
        network,
        phoneNumber: normalizedPhone,
        externalReference,
        providerReference: gatewayResponse.transactionReference,
        statusMessage: gatewayResponse.statusMessage,
        requestPayload: { smsQuantity, amountUgx, phoneNumber: normalizedPhone, externalReference, network } as Prisma.InputJsonValue,
        responsePayload: gatewayResponse as Prisma.InputJsonValue,
        completedAt: status === PaymentStatus.COMPLETED ? new Date() : null,
        failedAt: this.isFailedPayment(status) ? new Date() : null,
      },
    })

    if (status === PaymentStatus.COMPLETED) {
      await this.creditPurchasedSms(purchase.id)
    }

    return this.getWalletStatus(tenantId)
  }

  async refreshCreditCheckout(tenantId: string) {
    const purchase = await this.prisma.smsCreditPurchase.findFirst({
      where: { tenantId, status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING, PaymentStatus.INDETERMINATE] } },
      orderBy: { createdAt: 'desc' },
    })
    if (!purchase) {
      throw new NotFoundException('No SMS credit checkout in progress')
    }

    const referenceId = purchase.providerReference ?? purchase.externalReference
    const gatewayResponse = await this.paymentRouterService.resolveCollection(purchase.network).getPaymentStatus(referenceId)
    const status = mapRawStatusToPaymentStatus(gatewayResponse.transactionStatus)

    await this.prisma.smsCreditPurchase.update({
      where: { id: purchase.id },
      data: {
        status,
        providerReference: gatewayResponse.transactionReference ?? purchase.providerReference,
        statusMessage: gatewayResponse.statusMessage,
        responsePayload: gatewayResponse as Prisma.InputJsonValue,
        completedAt: status === PaymentStatus.COMPLETED ? new Date() : purchase.completedAt,
        failedAt: this.isFailedPayment(status) ? new Date() : purchase.failedAt,
      },
    })

    if (status === PaymentStatus.COMPLETED) {
      await this.creditPurchasedSms(purchase.id)
    }

    return this.getWalletStatus(tenantId)
  }

  async sendBusinessSms(input: { tenantId: string; title: string; message: string; phoneNumbers: string[]; templateKey?: string; requirePaidPlan?: boolean }) {
    const text = `AROFi: ${input.title}\n${input.message}`.slice(0, 480)
    const results = await Promise.all(
      input.phoneNumbers.map((to) =>
        this.sendText({
          tenantId: input.tenantId,
          to,
          body: text,
          templateKey: input.templateKey ?? 'business_notification',
          requirePaidPlan: input.requirePaidPlan ?? false,
        }),
      ),
    )
    return {
      attempted: input.phoneNumbers.length,
      delivered: results.filter(Boolean).length,
      failed: results.filter((result) => !result).length,
    }
  }

  isConfigured(): boolean {
    return this.provider() === SmsProvider.AFRICAS_TALKING && Boolean(process.env.AFRICAS_TALKING_USERNAME && process.env.AFRICAS_TALKING_API_KEY)
  }

  private async tenantCanUseSms(tenantId: string): Promise<boolean> {
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
      select: { subscriptionPlan: true, subscriptionPlanExpiresAt: true },
    })
    if (!settings) {
      return false
    }

    const tier = resolveEffectiveSubscriptionTier(settings.subscriptionPlan, settings.subscriptionPlanExpiresAt)
    return tier === SubscriptionPlanTier.PRO || tier === SubscriptionPlanTier.ENTERPRISE
  }

  private async sendViaAfricasTalking(to: string, body: string) {
    const username = process.env.AFRICAS_TALKING_USERNAME
    const apiKey = process.env.AFRICAS_TALKING_API_KEY
    if (!username || !apiKey) {
      throw new Error("Africa's Talking username/API key missing")
    }

    const form = new URLSearchParams({
      username,
      to: `+${to}`,
      message: body,
    })
    const senderId = process.env.AFRICAS_TALKING_SENDER_ID?.trim()
    if (senderId) {
      form.set('from', senderId)
    }

    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey,
      },
      body: form,
    })

    const text = await response.text()
    let payload: any
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { raw: text }
    }

    if (!response.ok) {
      throw new Error(`Africa's Talking returned ${response.status}: ${text.slice(0, 200)}`)
    }

    return payload
  }

  private async logMessage(input: SendSmsInput & {
    provider: SmsProvider
    status: SmsMessageStatus
    normalizedRecipient?: string | null
    segments: number
    estimatedCostUgx: number
    errorMessage?: string | null
    creditSource?: string | null
  }) {
    return this.prisma.smsMessage.create({
      data: {
        tenantId: input.tenantId ?? null,
        provider: input.provider,
        status: input.status,
        templateKey: input.templateKey,
        recipient: input.to,
        normalizedRecipient: input.normalizedRecipient,
        body: input.body,
        segments: input.segments,
        estimatedCostUgx: input.estimatedCostUgx,
        errorMessage: input.errorMessage,
        creditSource: input.creditSource,
      },
    })
  }

  private async reserveCredits(tenantId: string, segments: number) {
    return this.prisma.$transaction(async (tx) => {
      const settings = await this.ensureTenantSmsSettings(tenantId, tx)
      const current = await this.ensureCurrentCycle(settings, tx)
      const tier = resolveEffectiveSubscriptionTier(current.subscriptionPlan, current.subscriptionPlanExpiresAt)
      if (tier === SubscriptionPlanTier.FREE) {
        return { ok: false as const, reason: 'SMS notifications are available to active Pro and Enterprise tenants only' }
      }

      const includedRemaining = Math.max(0, current.smsMonthlyIncluded - current.smsMonthlyUsed)
      if (includedRemaining >= segments) {
        const updated = await tx.tenantSetting.update({
          where: { tenantId },
          data: { smsMonthlyUsed: { increment: segments } },
          select: { smsPurchasedBalance: true },
        })
        await tx.smsCreditLedger.create({
          data: {
            tenantId,
            type: SmsCreditLedgerType.DEBIT,
            quantity: -segments,
            balanceAfter: updated.smsPurchasedBalance,
            note: 'SMS sent from monthly included allowance',
          },
        })
        return { ok: true as const, source: 'monthly_included' }
      }

      if (current.smsPurchasedBalance >= segments) {
        const updated = await tx.tenantSetting.update({
          where: { tenantId },
          data: { smsPurchasedBalance: { decrement: segments } },
          select: { smsPurchasedBalance: true },
        })
        await tx.smsCreditLedger.create({
          data: {
            tenantId,
            type: SmsCreditLedgerType.DEBIT,
            quantity: -segments,
            balanceAfter: updated.smsPurchasedBalance,
            unitPriceUgx: current.smsUnitPriceUgx,
            amountUgx: segments * current.smsUnitPriceUgx,
            note: 'SMS sent from purchased balance',
          },
        })
        return { ok: true as const, source: 'purchased' }
      }

      return { ok: false as const, reason: 'SMS balance exhausted. Buy more SMS credits to continue sending text notifications.' }
    })
  }

  private async refundCredits(tenantId: string, segments: number, source: string | null | undefined, smsMessageId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const settings = await this.ensureTenantSmsSettings(tenantId, tx)
      if (source === 'monthly_included') {
        await tx.tenantSetting.update({
          where: { tenantId },
          data: { smsMonthlyUsed: Math.max(0, settings.smsMonthlyUsed - segments) },
        })
      } else if (source === 'purchased') {
        await tx.tenantSetting.update({
          where: { tenantId },
          data: { smsPurchasedBalance: { increment: segments } },
        })
      } else {
        return
      }
      await tx.smsCreditLedger.create({
        data: {
          tenantId,
          type: SmsCreditLedgerType.REFUND,
          quantity: segments,
          smsMessageId,
          note: reason.slice(0, 250),
        },
      })
    })
  }

  private async creditPurchasedSms(purchaseId: string) {
    await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.smsCreditPurchase.findUnique({ where: { id: purchaseId } })
      if (!purchase || purchase.status !== PaymentStatus.COMPLETED || purchase.creditedAt) {
        return
      }
      const updated = await tx.tenantSetting.update({
        where: { tenantId: purchase.tenantId },
        data: { smsPurchasedBalance: { increment: purchase.smsQuantity } },
        select: { smsPurchasedBalance: true },
      })
      await tx.smsCreditPurchase.update({
        where: { id: purchase.id },
        data: { creditedAt: new Date() },
      })
      await tx.smsCreditLedger.create({
        data: {
          tenantId: purchase.tenantId,
          type: SmsCreditLedgerType.PURCHASE,
          quantity: purchase.smsQuantity,
          balanceAfter: updated.smsPurchasedBalance,
          unitPriceUgx: purchase.unitPriceUgx,
          amountUgx: purchase.amountUgx,
          purchaseId: purchase.id,
          note: 'SMS credits purchased',
        },
      })
    })
  }

  private async ensureTenantSmsSettings(tenantId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.tenantSetting.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId },
      select: {
        tenantId: true,
        subscriptionPlan: true,
        subscriptionPlanExpiresAt: true,
        smsMonthlyIncluded: true,
        smsMonthlyUsed: true,
        smsMonthlyCycleStartedAt: true,
        smsPurchasedBalance: true,
        smsUnitPriceUgx: true,
      },
    })
  }

  private async ensureCurrentCycle(
    settings: Awaited<ReturnType<SmsService['ensureTenantSmsSettings']>>,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const now = new Date()
    const cycleStart = settings.smsMonthlyCycleStartedAt
    const expired = !cycleStart || cycleStart.getUTCFullYear() !== now.getUTCFullYear() || cycleStart.getUTCMonth() !== now.getUTCMonth()
    if (!expired) {
      return settings
    }

    const updated = await tx.tenantSetting.update({
      where: { tenantId: settings.tenantId },
      data: {
        smsMonthlyUsed: 0,
        smsMonthlyCycleStartedAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      },
      select: {
        tenantId: true,
        subscriptionPlan: true,
        subscriptionPlanExpiresAt: true,
        smsMonthlyIncluded: true,
        smsMonthlyUsed: true,
        smsMonthlyCycleStartedAt: true,
        smsPurchasedBalance: true,
        smsUnitPriceUgx: true,
      },
    })
    await tx.smsCreditLedger.create({
      data: {
        tenantId: settings.tenantId,
        type: SmsCreditLedgerType.MONTHLY_INCLUDED,
        quantity: updated.smsMonthlyIncluded,
        balanceAfter: updated.smsPurchasedBalance,
        note: 'Monthly Pro SMS allowance reset',
      },
    })
    return updated
  }

  private isFailedPayment(status: PaymentStatus) {
    return status === PaymentStatus.FAILED || status === PaymentStatus.CANCELLED || status === PaymentStatus.EXPIRED
  }

  private provider(): SmsProvider {
    const value = process.env.SMS_PROVIDER?.trim().toUpperCase()
    return value === 'AFRICAS_TALKING' || value === 'AFRICASTALKING' ? SmsProvider.AFRICAS_TALKING : SmsProvider.DISABLED
  }

  private costPerSegmentUgx() {
    const configured = Number.parseInt(process.env.SMS_COST_PER_SEGMENT_UGX ?? '', 10)
    return Number.isFinite(configured) && configured > 0 ? configured : 40
  }

  private estimateSegments(message: string) {
    const gsmSafe = /^[\u000A\u000D\u0020-\u007E]*$/.test(message)
    const limit = gsmSafe ? 160 : 70
    return Math.max(1, Math.ceil(message.length / limit))
  }

  private normalizeUgandanPhone(phoneNumber: string): string | null {
    const digits = phoneNumber.replace(/[^0-9]/g, '')
    if (/^256(7|3)\d{8}$/.test(digits)) return digits
    if (/^0(7|3)\d{8}$/.test(digits)) return `256${digits.slice(1)}`
    if (/^(7|3)\d{8}$/.test(digits)) return `256${digits}`
    return digits.length >= 10 ? digits : null
  }
}
