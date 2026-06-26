import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('session')
  createSession(@Body() body: { name?: string }) {
    return this.chatService.createSession(body.name || 'Visitor');
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() body: { sessionId: string; text: string }) {
    const success = await this.chatService.sendMessageFromVisitor(body.sessionId, body.text);
    return { success };
  }

  @Get('messages')
  async getMessages(@Query('sessionId') sessionId: string): Promise<any> {
    const session = await this.chatService.getSession(sessionId);
    return {
      messages: session ? session.messages : [],
      code: session ? session.code : null,
      name: session ? session.name : null,
    };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any) {
    await this.chatService.handleWebhook(payload);
    return { received: true };
  }
}
