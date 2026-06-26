import { Injectable, Logger } from '@nestjs/common'
import { ChatMessageSender, SupportTicketChannel } from '@prisma/client'
import { PrismaService } from '../../prisma.service'

// Anonymous marketing-site visitors have no tenant context, so chat-derived
// support tickets are filed against AROFi's own internal placeholder tenant
// (same pattern wallets.service.ts uses for platform-level wallet entries).
const PLATFORM_TENANT_ID = 'platform'

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

  constructor(private readonly prisma: PrismaService) {}

  private async ensurePlatformTenantExists() {
    await this.prisma.tenant.upsert({
      where: { id: PLATFORM_TENANT_ID },
      update: {},
      create: { id: PLATFORM_TENANT_ID, name: 'AROFi Platform', domain: 'platform.internal' },
    })
  }

  async createSession(name: string): Promise<{ sessionId: string; code: string }> {
    const sessionId = Math.random().toString(36).substring(2, 10).toUpperCase()
    const visitorName = name || 'Visitor'

    let code = ''
    for (let attempts = 0; attempts < 20; attempts += 1) {
      const candidate = Math.random().toString(36).substring(2, 6).toUpperCase()
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
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!session) {
      return undefined
    }

    return {
      sessionId: session.sessionId,
      code: session.code,
      name: session.name,
      lastActive: session.lastActiveAt,
      messages: session.messages.map((message) => ({
        sender: message.sender === ChatMessageSender.VISITOR ? 'visitor' : 'admin',
        text: message.text,
        timestamp: message.createdAt.toISOString(),
      })),
    }
  }

  async sendMessageFromVisitor(sessionId: string, text: string): Promise<boolean> {
    const session = await this.prisma.chatSession.findUnique({ where: { sessionId } })
    if (!session) {
      return false
    }

    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { chatSessionId: session.id, sender: ChatMessageSender.VISITOR, text },
      }),
      this.prisma.chatSession.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() },
      }),
      ...(session.supportTicketId
        ? [
            this.prisma.supportTicketMessage.create({
              data: {
                ticketId: session.supportTicketId,
                authorName: session.name,
                authorRole: 'CUSTOMER',
                body: text,
              },
            }),
            this.prisma.supportTicket.update({
              where: { id: session.supportTicketId },
              data: { latestResponseAt: new Date() },
            }),
          ]
        : []),
    ])

    // Send via WAHA to the admin's phone
    const wahaUrl = process.env.WHATSAPP_GATEWAY_URL
    const wahaApiKey = process.env.WHATSAPP_GATEWAY_API_KEY
    const adminPhone = process.env.ROUTER_ALERTS_WHATSAPP_PHONE

    if (wahaUrl && adminPhone) {
      try {
        const cleanPhone = adminPhone.replace('+', '').trim()
        const chatId = cleanPhone.endsWith('@c.us') ? cleanPhone : `${cleanPhone}@c.us`
        const url = `${wahaUrl.replace(/\/$/, '')}/api/sendText`

        const waMessage = `💬 [Live Chat] #${session.code}\nVisitor: ${session.name}\n\n${text}`

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

  async handleWebhook(payload: any): Promise<void> {
    // WAHA sends events where the message content is in metadata/data.
    const event = payload?.event
    if (event !== 'message' && event !== 'message.any' && event !== 'message.created') {
      return
    }

    const messageData = payload?.data
    if (!messageData) {
      return
    }

    const body = messageData.body || ''
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

    // Scan for code in format #CODE (e.g. #A7F9)
    const match = body.match(/#([A-Z0-9]{4})/i)
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

    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { chatSessionId: session.id, sender: ChatMessageSender.ADMIN, text: cleanText },
      }),
      this.prisma.chatSession.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() },
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
          ]
        : []),
    ])

    this.logger.log(`Routed admin WhatsApp reply to session ${session.sessionId} (Code: #${code})`)
  }
}
