import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { AiChatService } from './ai-chat.service';
import { ACCESS_COOKIE_NAME } from '../auth/auth.module';

function extractAccessToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACCESS_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly aiChatService: AiChatService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @Post('ai')
  @HttpCode(HttpStatus.OK)
  async askAi(
    @Body() body: { message: string; history?: Array<{ role: 'user' | 'model'; text: string }> },
    @Headers('cookie') cookieHeader?: string,
  ) {
    return this.aiChatService.reply(body.message, body.history, extractAccessToken(cookieHeader));
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('session')
  createSession(@Body() body: { name?: string }) {
    return this.chatService.createSession(body.name || 'Visitor');
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() body: { sessionId: string; text: string }) {
    const success = await this.chatService.sendMessageFromVisitor(body.sessionId, body.text);
    return { success };
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('messages')
  async getMessages(@Query('sessionId') sessionId: string): Promise<any> {
    const session = await this.chatService.getSession(sessionId);
    return {
      messages: session ? session.messages : [],
      code: session ? session.code : null,
      name: session ? session.name : null,
    };
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-arofi-webhook-secret') arofiSecret?: string,
    @Headers('x-webhook-secret') webhookSecret?: string,
    @Headers('x-api-key') apiKey?: string,
    @Query('secret') querySecret?: string,
  ) {
    await this.chatService.handleWebhook(payload, arofiSecret || webhookSecret || apiKey || querySecret);
    return { received: true };
  }
}
