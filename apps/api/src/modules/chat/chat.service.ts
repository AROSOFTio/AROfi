import { Injectable, Logger } from '@nestjs/common';

interface ChatMessage {
  sender: 'visitor' | 'admin';
  text: string;
  timestamp: string;
}

interface ChatSession {
  sessionId: string;
  code: string;
  name: string;
  messages: ChatMessage[];
  lastActive: Date;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private sessions = new Map<string, ChatSession>();
  private codesToSessionId = new Map<string, string>();

  createSession(name: string): { sessionId: string; code: string } {
    const sessionId = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    // Generate a unique 4-character code (e.g., A7F9)
    let code = '';
    do {
      code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (this.codesToSessionId.has(code));

    const session: ChatSession = {
      sessionId,
      code,
      name: name || 'Visitor',
      messages: [],
      lastActive: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.codesToSessionId.set(code, sessionId);

    this.logger.log(`Created new chat session: ${sessionId} (Code: #${code}) for ${session.name}`);
    return { sessionId, code };
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  async sendMessageFromVisitor(sessionId: string, text: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Append to messages
    session.messages.push({
      sender: 'visitor',
      text,
      timestamp: new Date().toISOString(),
    });
    session.lastActive = new Date();

    // Send via WAHA to the admin's phone
    const wahaUrl = process.env.WHATSAPP_GATEWAY_URL;
    const wahaApiKey = process.env.WHATSAPP_GATEWAY_API_KEY;
    const adminPhone = process.env.ROUTER_ALERTS_WHATSAPP_PHONE;

    if (wahaUrl && adminPhone) {
      try {
        const cleanPhone = adminPhone.replace('+', '').trim();
        const chatId = cleanPhone.endsWith('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;
        const url = `${wahaUrl.replace(/\/$/, '')}/api/sendText`;

        const waMessage = `💬 [Live Chat] #${session.code}\nVisitor: ${session.name}\n\n${text}`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (wahaApiKey) {
          headers['X-Api-Key'] = wahaApiKey;
        }

        await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chatId,
            text: waMessage,
            session: 'default',
          }),
        });
      } catch (err) {
        this.logger.error(`Failed to send visitor message to admin WhatsApp: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return true;
  }

  async handleWebhook(payload: any): Promise<void> {
    // WAHA sends events where the message content is in metadata/data.
    const event = payload?.event;
    if (event !== 'message' && event !== 'message.any' && event !== 'message.created') {
      return;
    }

    const messageData = payload?.data;
    if (!messageData) {
      return;
    }

    const body = messageData.body || '';
    const from = messageData.from || ''; // Sender's phone number, e.g. "256770000000@c.us"
    const fromMe = messageData.fromMe;

    const adminPhone = process.env.ROUTER_ALERTS_WHATSAPP_PHONE;
    if (!adminPhone) {
      return;
    }

    const cleanAdminPhone = adminPhone.replace('+', '').trim();

    // Verify the message comes from the admin.
    // If the WAHA gateway uses a separate SIM card, "fromMe" is false, and "from" is the admin's personal phone.
    // If the admin uses the same SIM card as the gateway, "fromMe" is true.
    const isFromAdmin = from.includes(cleanAdminPhone) || fromMe === true;

    if (!isFromAdmin) {
      return;
    }

    // Scan for code in format #CODE (e.g. #A7F9)
    const match = body.match(/#([A-Z0-9]{4})/i);
    if (!match) {
      return;
    }

    const code = match[1].toUpperCase();
    const sessionId = this.codesToSessionId.get(code);
    if (!sessionId) {
      this.logger.warn(`Received reply for code #${code} but no active session was found.`);
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Strip the `#CODE` and leading whitespace/colons to get the reply text
    const cleanText = body.replace(new RegExp(`#${code}`, 'i'), '').replace(/^[:\s-]+/, '').trim();

    if (!cleanText) {
      return;
    }

    // Append admin's reply
    session.messages.push({
      sender: 'admin',
      text: cleanText,
      timestamp: new Date().toISOString(),
    });
    session.lastActive = new Date();

    this.logger.log(`Routed admin WhatsApp reply to session ${sessionId} (Code: #${code})`);
  }
}
