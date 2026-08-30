import { Injectable, Logger } from '@nestjs/common'
import { ChatMessageSender, SupportTicketChannel, SupportTicketStatus } from '@prisma/client'
import { randomBytes, timingSafeEqual } from 'crypto'
import { PrismaService } from '../../prisma.service'

// Anonymous marketing-site visitors have no tenant context, so chat-derived
// support tickets are filed against AROFi's own internal placeholder tenant
// (same pattern wallets.service.ts uses for platform-level wallet entries).
const PLATFORM_TENANT_ID = 'platform'
const MAX_VISITOR_NAME_LENGTH = 80
const MAX_CHAT_MESSAGE_LENGTH = 2000
const FINAL_TICKET_STATUSES = new Set<SupportTicketStatus>([
  SupportTicketStatus.RESOLVED,
  SupportTicketStatus.CLOSED,
])

export interface ChatMessage {
  sender: 'visitor' | 'admin'
  text: string
  timestamp: string
}

export interface ChatSession {
  sessionId: string
  code: string
  name: string
  messages: ChatMessage[]
  lastActive: Date
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  private warnedMissingWebhookSecret = false

  constructor(private readonly prisma: PrismaService) {}

  private async ensurePlatformTenantExists() {
    await this.prisma.tenant.upsert({
      where: { id: PLATFORM_TENANT_ID },
      update: {},
      create: { id: PLATFORM_TENANT_ID, name: 'AROFi Platform', domain: 'platform.internal' },
    })
  }

  async createSession(name: string): Promise<{ sessionId: string; code: string }> {
    const sessionId = randomBytes(12).toString('hex').toUpperCase()
    const visitorName = this.normalizeText(name || 'Website Visitor', MAX_VISITOR_NAME_LENGTH) || 'Website Visitor'

    let code = ''
    for (let attempts = 0; attempts < 20; attempts += 1) {
      const candidate = randomBytes(4).toString('hex').slice(0, 6).toUpperCase()
      const existing = await this.prisma.chatSession.findUnique({ where: { code: candidate } })
      if (!existing) {
        code = candidate
        break
      }
    }
    if (!code) {
      throw new Error('Could not generate a unique chat session code')
    }

    await this.ensurePlatformTenantExists()
    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId: PLATFORM_TENANT_ID,
        reference: `CHAT-${sessionId}`,
        subject: `Live chat with ${visitorName}`,
        category: 'Live Chat',
        channel: SupportTicketChannel.CHAT,
        openedBy: visitorName,
      },
    })

    await this.prisma.chatSession.create({
      data: {
        sessionId,
        code,
        name: visitorName,
        supportTicketId: ticket.id,
      },
    })

    this.logger.log(`Created new chat session: ${sessionId} (Code: #${code}) for ${visitorName}, ticket ${ticket.reference}`)
    return { sessionId, code }
  }

  async getSession(sessionId: string): Promise<ChatSession | undefined> {
    const session = await this.prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        supportTicket: {
          include: {
            messages: {
              where: { isInternal: false },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    })
    if (!session) {
      return undefined
    }

    // The support ticket is the canonical human-support thread. Visitor chat
    // messages are already mirrored into it, and replies made by AROFi staff
    // in Support Floor are written there too. Reading that thread here makes
    // dashboard replies appear back in the public website chat without a
    // separate paid chat provider.
    const ticketMessages = session.supportTicket?.messages ?? []
    const messages: ChatMessage[] = ticketMessages.length > 0
      ? ticketMessages.map((message) => ({
          sender: message.authorRole === 'CUSTOMER' ? 'visitor' : 'admin',
          text: message.body,
          timestamp: message.createdAt.toISOString(),
        }))
      : session.messages.map((message) => ({
          sender: message.sender === ChatMessageSender.VISITOR ? 'visitor' : 'admin',
          text: message.text,
          timestamp: message.createdAt.toISOString(),
        }))

    return {
      sessionId: session.sessionId,
      code: session.code,
      name: session.name,
      lastActive: session.lastActiveAt,
      messages,
    }
  }

  async sendMessageFromVisitor(sessionId: string, text: string): Promise<boolean> {
    const cleanText = this.normalizeText(text, MAX_CHAT_MESSAGE_LENGTH)
    if (!cleanText) {
      return false
    }

    const session = await this.prisma.chatSession.findUnique({
      where: { sessionId },
      include: { supportTicket: { select: { status: true } } },
    })
    if (!session) {
      return false
    }

    const now = new Date()
    const reopenTicket = session.supportTicket && FINAL_TICKET_STATUSES.has(session.supportTicket.status)

    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { chatSessionId: session.id, sender: ChatMessageSender.VISITOR, text: cleanText },
      }),
      this.prisma.chatSession.update({
        where: { id: session.id },
        data: { lastActiveAt: now },
      }),
      ...(session.supportTicketId
        ? [
            this.prisma.supportTicketMessage.create({
              data: {
                ticketId: session.supportTicketId,
                authorName: session.name,
                authorRole: 'CUSTOMER',
                body: cleanText,
              },
            }),
            this.prisma.supportTicket.update({
              where: { id: session.supportTicketId },
              data: {
                latestResponseAt: now,
                ...(reopenTicket ? { status: SupportTicketStatus.OPEN, resolvedAt: null } : {}),
              },
            }),
          ]
        : []),
    ])

    // Optional immediate notification/fallback: if self-hosted WAHA is
    // configured, mirror the visitor message to the support phone. The public
    // website chat itself does not depend on WhatsApp.
    const wahaUrl = process.env.WHATSAPP_GATEWAY_URL
    const wahaApiKey = process.env.WHATSAPP_GATEWAY_API_KEY
    const adminPhone = process.env.ROUTER_ALERTS_WHATSAPP_PHONE

    if (wahaUrl && adminPhone) {
      try {
        const cleanPhone = adminPhone.replace('+', '').trim()
        const chatId = cleanPhone.endsWith('@c.us') ? cleanPhone : `${cleanPhone}@c.us`
        const url = `${wahaUrl.replace(/\/$/, '')}/api/sendText`

        const waMessage = `Live Chat #${session.code}\nVisitor: ${session.name}\n\n${cleanText}`

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (wahaApiKey) {
          headers['X-Api-Key'] = wahaApiKey
        }

        await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chatId,
            text: waMessage,
            session: 'default',
          }),
        })
      } catch (err) {
        this.logger.error(`Failed to send visitor message to admin WhatsApp: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return true
  }

  async handleWebhook(payload: any, providedSecret?: string): Promise<void> {
    if (!this.isWebhookAuthorized(providedSecret)) {
      return
    }

    // WAHA sends events where the message content is in metadata/data.
    const event = payload?.event
    if (event !== 'message' && event !== 'message.any' && event !== 'message.created') {
      return
    }

    const messageData = payload?.data
    if (!messageData) {
      return
    }

    const body = this.normalizeText(messageData.body || '', MAX_CHAT_MESSAGE_LENGTH)
    const from = messageData.from || '' // Sender's phone number, e.g. "256770000000@c.us"
    const fromMe = messageData.fromMe

    const adminPhone = process.env.ROUTER_ALERTS_WHATSAPP_PHONE
    if (!adminPhone) {
      return
    }

    const cleanAdminPhone = adminPhone.replace('+', '').trim()

    // Verify the message comes from the admin.
    // If the WAHA gateway uses a separate SIM card, "fromMe" is false, and "from" is the admin's personal phone.
    // If the admin uses the same SIM card as the gateway, "fromMe" is true.
    const isFromAdmin = from.includes(cleanAdminPhone) || fromMe === true

    if (!isFromAdmin) {
      return
    }

    // Scan for code in format #CODE. New sessions use 6 chars; 4-char codes
    // are still accepted so active chats created before this change can close.
    const match = body.match(/#([A-Z0-9]{4,8})/i)
    if (!match) {
      return
    }

    const code = match[1].toUpperCase()
    const session = await this.prisma.chatSession.findUnique({ where: { code } })
    if (!session) {
      this.logger.warn(`Received reply for code #${code} but no active session was found.`)
      return
    }

    // Strip the `#CODE` and leading whitespace/colons to get the reply text
    const cleanText = body.replace(new RegExp(`#${code}`, 'i'), '').replace(/^[:\s-]+/, '').trim()

    if (!cleanText) {
      return
    }

    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { chatSessionId: session.id, sender: ChatMessageSender.ADMIN, text: cleanText },
      }),
      this.prisma.chatSession.update({
        where: { id: session.id },
        data: { lastActiveAt: now },
      }),
      ...(session.supportTicketId
        ? [
            this.prisma.supportTicketMessage.create({
              data: {
                ticketId: session.supportTicketId,
                authorName: 'Admin',
                authorRole: 'ADMIN',
                body: cleanText,
              },
            }),
            this.prisma.supportTicket.update({
              where: { id: session.supportTicketId },
              data: { latestResponseAt: now },
            }),
          ]
        : []),
    ])

    this.logger.log(`Routed admin WhatsApp reply to session ${session.sessionId} (Code: #${code})`)
  }

  private normalizeText(value: unknown, maxLength: number) {
    if (typeof value !== 'string') {
      return ''
    }

    return value.trim().slice(0, maxLength)
  }

  private isWebhookAuthorized(providedSecret?: string) {
    const expectedSecret = process.env.WAHA_WEBHOOK_SECRET?.trim()
    if (!expectedSecret) {
      if (process.env.NODE_ENV === 'production') {
        if (!this.warnedMissingWebhookSecret) {
          this.logger.error('WAHA_WEBHOOK_SECRET is required in production; chat webhook ignored.')
          this.warnedMissingWebhookSecret = true
        }
        return false
      }

      return true
    }

    if (!providedSecret) {
      return false
    }

    return this.safeEqual(providedSecret.trim(), expectedSecret)
  }

  private safeEqual(actual: string, expected: string) {
    const actualBuffer = Buffer.from(actual)
    const expectedBuffer = Buffer.from(expected)

    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  }
}
