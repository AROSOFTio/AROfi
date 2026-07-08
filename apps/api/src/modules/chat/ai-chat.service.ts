import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const MAX_MESSAGE_LENGTH = 600
const MAX_HISTORY_TURNS = 6
const FALLBACK_REPLY =
  'Our AI assistant is warming up right now. Meanwhile, tap "Talk to Support" above, WhatsApp/call +256 787 726 388, or email support@arofi.net.'

// Kept in sync by hand with the marketing copy on the homepage (apps/admin-web/src/app/page.tsx)
// and the subscription plan catalog (apps/api/src/modules/subscription/subscription.service.ts).
const SYSTEM_PROMPT = `You are the AROFi website assistant. AROFi is a cloud WiFi hotspot billing platform for MikroTik router operators in Uganda and East Africa, built by AROSOFT Innovations Ltd (Kampala, Uganda).

What AROFi does:
- Turns any MikroTik RouterOS router into a billed WiFi hotspot in minutes (one setup command, RADIUS auth + captive portal built in).
- Collects payment via MTN Mobile Money and Airtel Money directly from customers' phones, plus supports printed/QR voucher codes.
- Every operator ("tenant") gets an isolated, branded dashboard — no IT team required, fully self-onboarding.
- Operators can add multiple routers, monitor them live, and reach any router remotely over AROFi's own secure VPN tunnel (no port forwarding or static IP needed).
- Sales, wallet balance and withdrawals are tracked in real time; withdrawals to an approved mobile money number are processed instantly and protected by a separate secret code.
- Operators get an instant email alert if a router goes offline.
- Support is available 24/7 via this chat, WhatsApp/phone (+256 787 726 388) and email (support@arofi.net).

Pricing (3 plans, no contract, cancel anytime):
- Starter — free forever, 0 UGX/month. Up to 5 routers/hotspots. AROFi only earns a small percentage fee on payments that actually go through (about 8% on mobile money, 2% on vouchers) — no charge if you make no sales.
- Pro — UGX 20,000/month. Up to 10 routers/hotspots, custom branding, lower fees (about 4% mobile money, 0% voucher — vouchers are free to sell on Pro).
- Enterprise — UGX 70,000/month. Unlimited routers, custom domain/SSL, custom SMS gateway, priority support, lowest gateway fee (~1.6%) with 0% platform fee.

How you should behave:
- Answer only questions about AROFi (product, pricing, setup, billing, routers, payments, support). For anything unrelated, politely redirect to what AROFi does.
- Be concise — 2-4 sentences unless the user asks for detail.
- Never invent numbers, features or policies that aren't listed above. If you don't know something, say so and point to support@arofi.net or +256 787 726 388.
- Never ask for or handle passwords, secret withdrawal codes, OTPs or full card/account numbers.
- You cannot access anyone's real account, balance or router — for account-specific issues, direct them to sign in or contact support.`

type ChatTurn = { role: 'user' | 'model'; text: string }

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name)

  constructor(private readonly configService: ConfigService) {}

  private isConfigured(): boolean {
    return Boolean(this.configService.get<string>('GEMINI_API_KEY'))
  }

  async reply(message: string, history: ChatTurn[] = []): Promise<{ reply: string; configured: boolean }> {
    const trimmed = (message ?? '').trim()
    if (!trimmed) {
      throw new BadRequestException('Message is required.')
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`)
    }

    if (!this.isConfigured()) {
      return { reply: FALLBACK_REPLY, configured: false }
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY')
    const model = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash'
    const recentHistory = history
      .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
      .slice(-MAX_HISTORY_TURNS)

    const contents = [
      ...recentHistory.map((turn) => ({
        role: turn.role === 'model' ? 'model' : 'user',
        parts: [{ text: turn.text.slice(0, MAX_MESSAGE_LENGTH) }],
      })),
      { role: 'user', parts: [{ text: trimmed }] },
    ]

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      )

      if (!response.ok) {
        this.logger.warn(`Gemini API returned ${response.status}: ${await response.text().catch(() => '')}`)
        return { reply: FALLBACK_REPLY, configured: true }
      }

      const data: any = await response.json()
      const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join('') as string | undefined

      if (!text?.trim()) {
        return { reply: FALLBACK_REPLY, configured: true }
      }

      return { reply: text.trim(), configured: true }
    } catch (error) {
      this.logger.warn(`Gemini API call failed: ${error instanceof Error ? error.message : error}`)
      return { reply: FALLBACK_REPLY, configured: true }
    }
  }
}
