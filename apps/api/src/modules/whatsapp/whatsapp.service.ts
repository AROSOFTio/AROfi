import { Injectable, Logger } from '@nestjs/common'

// Same WAHA (self-hosted WhatsApp gateway) instance chat.service.ts uses for
// admin support replies, reused here to message customers directly on their
// own number instead of the admin's.
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)

  isConfigured(): boolean {
    return Boolean(process.env.WHATSAPP_GATEWAY_URL)
  }

  async sendTextMessage(phoneNumber: string, text: string): Promise<boolean> {
    const wahaUrl = process.env.WHATSAPP_GATEWAY_URL
    if (!wahaUrl) {
      this.logger.warn(`WAHA gateway is not configured — skipping WhatsApp message to ${phoneNumber}`)
      return false
    }

    const cleanPhone = this.normalizeForWaha(phoneNumber)
    if (!cleanPhone) {
      this.logger.warn(`Cannot send WhatsApp message — invalid phone number: ${phoneNumber}`)
      return false
    }

    try {
      const url = `${wahaUrl.replace(/\/$/, '')}/api/sendText`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const apiKey = process.env.WHATSAPP_GATEWAY_API_KEY
      if (apiKey) {
        headers['X-Api-Key'] = apiKey
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chatId: `${cleanPhone}@c.us`,
          text,
          session: 'default',
        }),
      })

      if (!response.ok) {
        this.logger.warn(`WAHA returned ${response.status} sending to ${phoneNumber}`)
        return false
      }
      return true
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message to ${phoneNumber}`, error instanceof Error ? error.stack : String(error))
      return false
    }
  }

  // WAHA/WhatsApp expects MSISDN digits only, no leading + or 0. Our numbers
  // are already normalized to 256XXXXXXXXX by PhoneNumberService, but this
  // is defensive in case a raw local-format number (07XX...) reaches here.
  private normalizeForWaha(phoneNumber: string): string | null {
    const digits = phoneNumber.replace(/[^0-9]/g, '')
    if (!digits) return null
    if (digits.startsWith('256')) return digits
    if (digits.startsWith('0')) return `256${digits.slice(1)}`
    return digits
  }
}
