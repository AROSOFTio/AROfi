import { Injectable, Logger } from '@nestjs/common'
import { SmsMessageStatus, SmsProvider, SubscriptionPlanTier } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { resolveEffectiveSubscriptionTier } from '../subscription/subscription-plan.util'

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

  constructor(private readonly prisma: PrismaService) {}

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

    const queued = await this.logMessage({
      ...input,
      provider,
      status: SmsMessageStatus.QUEUED,
      normalizedRecipient,
      segments,
      estimatedCostUgx,
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
      this.logger.warn(`Failed to send SMS to ${normalizedRecipient}: ${message}`)
      return false
    }
  }

  async sendBusinessSms(input: { tenantId: string; title: string; message: string; phoneNumbers: string[]; templateKey?: string }) {
    const text = `AROFi: ${input.title}\n${input.message}`.slice(0, 480)
    const results = await Promise.all(
      input.phoneNumbers.map((to) =>
        this.sendText({
          tenantId: input.tenantId,
          to,
          body: text,
          templateKey: input.templateKey ?? 'business_notification',
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
      },
    })
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
