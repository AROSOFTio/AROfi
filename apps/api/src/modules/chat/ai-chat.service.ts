import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SupportTicketChannel } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { MailService } from '../mail/mail.service'
import { AuthService, AccessScopeService } from '../auth/auth.module'
import { PERMISSIONS } from '../auth/permissions.constants'
import { RoutersService } from '../routers/routers.service'
import { BillingService } from '../billing/billing.service'

function hasPermission(user: { permissions: string[] }, permission: string) {
  return user.permissions.includes(permission) || user.permissions.includes('ALL')
}

const MAX_MESSAGE_LENGTH = 600
const MAX_HISTORY_TURNS = 6
const LEAD_DEDUPE_WINDOW_MS = 30 * 60 * 1000
const SUPPORT_NOTIFY_EMAIL = 'support@arofi.net'
const PLATFORM_TENANT_ID = 'platform'
const ASSISTANT_NAME = 'Aria'

const FALLBACK_REPLY =
  `${ASSISTANT_NAME} is warming up right now. Meanwhile, tap "Talk to Support" above, WhatsApp/call +256 787 726 388, or email support@arofi.net.`

// Kept in sync by hand with the marketing copy on the homepage (apps/admin-web/src/app/page.tsx)
// and the subscription plan catalog (apps/api/src/modules/subscription/subscription.service.ts).
const BASE_SYSTEM_PROMPT = `You are ${ASSISTANT_NAME}, AROFi's AI assistant. AROFi is a cloud WiFi hotspot billing platform for MikroTik router operators in Uganda and East Africa, built by AROSOFT Innovations Ltd (Kampala, Uganda).

What AROFi does:
- Turns any MikroTik RouterOS router into a billed WiFi hotspot in minutes (one setup command, RADIUS auth + captive portal built in).
- Collects payment via MTN Mobile Money and Airtel Money directly from customers' phones, plus supports printed/QR voucher codes.
- Every operator ("tenant") gets an isolated, branded dashboard — no IT team required, fully self-onboarding.
- Operators can add multiple routers, monitor them live, and reach any router remotely over AROFi's own secure VPN tunnel (no port forwarding or static IP needed).
- Sales, wallet balance and withdrawals are tracked in real time; withdrawals to an approved mobile money number are processed instantly and protected by a separate secret code.
- Operators get an instant email alert if a router goes offline.
- Support is available 24/7 via this chat, WhatsApp/phone (+256 787 726 388) and email (support@arofi.net).

Pricing (3 plans, no contract, cancel anytime):
- Starter — free forever, 0 UGX/month. Up to 5 routers/hotspots. AROFi does not charge a platform fee on Starter — you only ever pay the mobile money provider's own gateway fee on payments that actually go through, plus a 2% fee on vouchers. No sales, no charge.
- Pro — UGX 20,000/month. Up to 10 routers/hotspots, custom branding, a discounted ~5% mobile money gateway fee, and vouchers are free to sell (0% fee).
- Enterprise — UGX 70,000/month. Unlimited routers, custom domain/SSL, custom SMS gateway, priority support, the lowest gateway fee (~1.6%) with 0% platform fee.
Always describe the mobile money percentage as the payment gateway's own processing fee, not a charge AROFi keeps — AROFi's own cut is the monthly plan price (or nothing, on Starter).

Common troubleshooting you can help with (give practical steps, then point to the relevant /docs article for full detail):
- Router shows offline: check the router has internet access and power, confirm the RouterOS API/WinBox service is enabled, then re-run the setup command from the dashboard. Full guide: /docs (see "Router onboarding step-by-step").
- Can't reach a router remotely / need WinBox from outside the site: AROFi provides a secure VPN/SSTP tunnel — no port forwarding needed. Guide: /docs ("Remote WinBox Access (SSTP VPN)").
- A payment didn't go through: ask the customer to confirm they approved the MTN/Airtel prompt on their phone and have sufficient balance; failed payments are not charged. If it still shows pending after a few minutes, direct them to Support.
- Withdrawal is delayed or blocked: withdrawals need a verified primary payout number and the withdrawal secret code; large or unusual withdrawals may need manual review — direct them to Support for a specific case.
- Forgot password / can't log in: use the "Forgot password" link on the sign-in page, or contact Support to help recover the account.
- Customers can tether/share the paid connection: MikroTik hotspot sharing can be blocked — guide: /docs ("Block Hotspot Sharing/Tethering on MikroTik RouterOS").

How you should behave:
- Answer only questions about AROFi (product, pricing, setup, billing, routers, payments, troubleshooting, support). For anything unrelated, politely redirect to what AROFi does.
- Be concise — 2-4 sentences unless the user asks for detail or troubleshooting steps.
- Never invent numbers, features or policies that aren't listed above. If you don't know something, say so and point to support@arofi.net or +256 787 726 388.
- Never ask for or handle passwords, secret withdrawal codes, OTPs or full card/account numbers.
- If the visitor shares an email address or a phone number anywhere in their message (e.g. offering it so the team can follow up, or as part of describing an issue), extract exactly what they typed into contactEmail / contactPhone in your structured response so the team can follow up. Leave these fields empty otherwise, and never ask for both in the same turn if the user has already provided one earlier in the conversation.`

const PUBLIC_VISITOR_ADDENDUM = `
This visitor is browsing anonymously (not signed in). Focus on general product information: what AROFi does, pricing, how to get started, and high-level troubleshooting. You cannot access anyone's real account, balance or router — for account-specific issues, direct them to sign in or contact support, and offer to pass their contact details to the team.
- If it would genuinely help, suggest 1-2 relevant page links from this exact list (use the path as given, do not invent other paths): "/" (home), "/#features" (Features), "/#pricing" (Pricing), "/#faq" (FAQ), "/#contact" (Contact), "/docs" (Documentation), "/blog" (Blog), "/register" (Sign up), "/login" (Sign in). Only include links when they're actually relevant to what was just discussed.`

const PUBLIC_LINK_PATHS = new Set(['/', '/#features', '/#pricing', '/#faq', '/#contact', '/docs', '/blog', '/register', '/login'])
const AUTHENTICATED_LINK_PATHS = new Set(['/dashboard', '/routers', '/earnings', '/disbursements', '/sessions', '/support', '/settings', '/docs'])

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    links: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          path: { type: 'STRING' },
        },
        required: ['label', 'path'],
      },
    },
    contactEmail: { type: 'STRING' },
    contactPhone: { type: 'STRING' },
  },
  required: ['reply'],
}

type ChatTurn = { role: 'user' | 'model'; text: string }
type SuggestedLink = { label: string; path: string }
type AiChatResult = { reply: string; configured: boolean; links: SuggestedLink[]; authenticated: boolean; assistantName: string }

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name)
  private readonly recentLeads = new Map<string, number>()

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
    private readonly accessScope: AccessScopeService,
    private readonly routersService: RoutersService,
    private readonly billingService: BillingService,
  ) {}

  private isConfigured(): boolean {
    return Boolean(this.configService.get<string>('GEMINI_API_KEY'))
  }

  async reply(message: string, history: ChatTurn[] = [], rawToken?: string | null): Promise<AiChatResult> {
    const trimmed = (message ?? '').trim()
    if (!trimmed) {
      throw new BadRequestException('Message is required.')
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`)
    }

    const user = await this.authService.tryAuthenticateFromRawToken(rawToken)
    const authenticated = Boolean(user)

    if (!this.isConfigured()) {
      return { reply: FALLBACK_REPLY, configured: false, links: [], authenticated, assistantName: ASSISTANT_NAME }
    }

    const systemPrompt = await this.buildSystemPrompt(user)
    const allowedLinks = authenticated ? new Set([...PUBLIC_LINK_PATHS, ...AUTHENTICATED_LINK_PATHS]) : PUBLIC_LINK_PATHS

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
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
              maxOutputTokens: 500,
              temperature: 0.4,
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      )

      if (!response.ok) {
        this.logger.warn(`Gemini API returned ${response.status}: ${await response.text().catch(() => '')}`)
        return { reply: FALLBACK_REPLY, configured: true, links: [], authenticated, assistantName: ASSISTANT_NAME }
      }

      const data: any = await response.json()
      const rawText = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join('') as string | undefined
      if (!rawText?.trim()) {
        return { reply: FALLBACK_REPLY, configured: true, links: [], authenticated, assistantName: ASSISTANT_NAME }
      }

      const parsed = this.parseStructuredReply(rawText)
      if (!parsed?.reply?.trim()) {
        return { reply: FALLBACK_REPLY, configured: true, links: [], authenticated, assistantName: ASSISTANT_NAME }
      }

      const links = this.sanitizeLinks(parsed.links, allowedLinks)

      // Anonymous visitors only — logged-in users already have a real
      // account on file, so there's nothing to "capture" for them.
      if (!authenticated) {
        this.captureLead(parsed.contactEmail, parsed.contactPhone, trimmed).catch((error) =>
          this.logger.warn(`Lead capture failed: ${error instanceof Error ? error.message : error}`),
        )
      }

      return { reply: parsed.reply.trim(), configured: true, links, authenticated, assistantName: ASSISTANT_NAME }
    } catch (error) {
      this.logger.warn(`Gemini API call failed: ${error instanceof Error ? error.message : error}`)
      return { reply: FALLBACK_REPLY, configured: true, links: [], authenticated, assistantName: ASSISTANT_NAME }
    }
  }

  private async buildSystemPrompt(user: Awaited<ReturnType<AuthService['tryAuthenticateFromRawToken']>>): Promise<string> {
    if (!user) {
      return BASE_SYSTEM_PROMPT + PUBLIC_VISITOR_ADDENDUM
    }

    const snapshot = await this.buildAccountSnapshot(user).catch((error) => {
      this.logger.warn(`Account snapshot failed for AI chat: ${error instanceof Error ? error.message : error}`)
      return null
    })

    const snapshotBlock = snapshot
      ? `\n\nLive account snapshot for ${user.displayName} (${user.tenantName ?? 'their account'}) as of right now — you may reference these real numbers directly when answering:\n${snapshot}`
      : `\n\nThis user is signed in, but live account data could not be loaded right now — answer from general knowledge and suggest they check their dashboard directly for exact figures.`

    return `${BASE_SYSTEM_PROMPT}
${snapshotBlock}

This visitor is SIGNED IN as ${user.displayName}${user.tenantName ? ` at ${user.tenantName}` : ''}. For signed-in users, act as their support and troubleshooting copilot: answer questions about their own routers, revenue, sessions and performance using the live snapshot above, proactively point out anything that looks off (e.g. offline/degraded routers, unusually low revenue), and give practical advice. Do not discuss marketing/pricing pitches unless asked. Never reveal or ask for passwords, OTPs, or the withdrawal secret code, and never guess at numbers not present in the snapshot — say so and suggest checking the relevant dashboard page instead.
- If it would help, suggest 1-2 relevant in-app page links from this exact list (do not invent other paths): "/dashboard" (Dashboard), "/routers" (Routers), "/earnings" (Wallet & Earnings), "/disbursements" (Withdrawals), "/sessions" (Sessions), "/support" (Support), "/settings" (Settings), "/docs" (Documentation).`
  }

  private async buildAccountSnapshot(user: NonNullable<Awaited<ReturnType<AuthService['tryAuthenticateFromRawToken']>>>): Promise<string | null> {
    if (!user.tenantId) {
      // Platform staff without a specific tenant selected — no single
      // account's data to summarize.
      return null
    }

    const tenantId = this.accessScope.resolveTenantScope(user, undefined)
    if (!tenantId) return null

    // Mirror the same @RequirePermissions checks the /routers and /billing
    // controllers enforce — this service call bypasses their guards, so the
    // permission check has to happen here instead.
    const [routers, billing] = await Promise.all([
      hasPermission(user, PERMISSIONS.routersRead) ? this.routersService.getOverview(tenantId) : null,
      hasPermission(user, PERMISSIONS.billingRead) ? this.billingService.getOverview(tenantId) : null,
    ])

    const r = routers?.summary
    const b = billing?.summary
    const lines: string[] = []
    if (r) {
      lines.push(
        `Routers: ${r.totalRouters} total — ${r.healthyRouters} healthy, ${r.degradedRouters} degraded, ${r.offlineRouters} offline, ${r.liveRouters} live right now.`,
      )
    }
    if (b) {
      lines.push(`Revenue today: UGX ${b.todayGrossSalesUgx.toLocaleString()}. Revenue this month: UGX ${b.monthGrossSalesUgx.toLocaleString()}.`)
      lines.push(`Wallet balance: UGX ${b.walletBalanceUgx.toLocaleString()}. Pending withdrawals: UGX ${b.pendingWithdrawalUgx.toLocaleString()}.`)
      lines.push(`Active users right now: ${b.activeUsers}. Routers currently online: ${b.onlineRouters}.`)
    }
    return lines.length ? lines.join('\n') : null
  }

  private parseStructuredReply(rawText: string): { reply: string; links?: unknown; contactEmail?: string; contactPhone?: string } | null {
    try {
      return JSON.parse(rawText)
    } catch {
      // Model didn't honor the schema — fall back to treating the raw text as the reply.
      return { reply: rawText }
    }
  }

  private sanitizeLinks(links: unknown, allowedPaths: Set<string>): SuggestedLink[] {
    if (!Array.isArray(links)) return []
    const seen = new Set<string>()
    const result: SuggestedLink[] = []
    for (const entry of links) {
      const label = (entry as any)?.label
      const path = (entry as any)?.path
      if (typeof label !== 'string' || typeof path !== 'string') continue
      if (!allowedPaths.has(path) || seen.has(path)) continue
      seen.add(path)
      result.push({ label: label.slice(0, 40), path })
      if (result.length >= 2) break
    }
    return result
  }

  private async captureLead(email: string | undefined, phone: string | undefined, originalMessage: string) {
    const cleanEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? email.trim() : undefined
    const cleanPhone = phone && /\d{7,15}/.test(phone.replace(/[^\d]/g, '')) ? phone.trim() : undefined
    if (!cleanEmail && !cleanPhone) return

    const dedupeKey = (cleanEmail ?? '') + '|' + (cleanPhone ?? '')
    const lastSeen = this.recentLeads.get(dedupeKey)
    if (lastSeen && Date.now() - lastSeen < LEAD_DEDUPE_WINDOW_MS) return
    this.recentLeads.set(dedupeKey, Date.now())

    await this.prisma.tenant.upsert({
      where: { id: PLATFORM_TENANT_ID },
      update: {},
      create: { id: PLATFORM_TENANT_ID, name: 'AROFi Platform', domain: 'platform.internal' },
    })

    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId: PLATFORM_TENANT_ID,
        reference: `AI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        subject: `AI chat lead — ${cleanEmail || cleanPhone}`,
        category: 'AI Chat Lead',
        channel: SupportTicketChannel.CHAT,
        openedBy: cleanEmail || cleanPhone || 'Website visitor',
        email: cleanEmail,
        phoneNumber: cleanPhone,
      },
    })

    await this.mailService.sendMail({
      to: SUPPORT_NOTIFY_EMAIL,
      subject: `New AI chat lead: ${cleanEmail || cleanPhone}`,
      html: `<p>The homepage AI assistant captured a visitor's contact details.</p>
        <p><strong>Email:</strong> ${cleanEmail || '—'}<br/><strong>Phone:</strong> ${cleanPhone || '—'}</p>
        <p><strong>Last message:</strong> ${this.escapeHtml(originalMessage)}</p>
        <p>Ticket reference: ${ticket.reference}</p>`,
    })
  }

  private escapeHtml(input: string) {
    return input.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)
  }
}
