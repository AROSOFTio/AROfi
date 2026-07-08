import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AiChatService } from './ai-chat.service';
import { ChatController } from './chat.controller';

@Module({
  controllers: [ChatController],
  providers: [ChatService, AiChatService],
  exports: [ChatService],
})
export class ChatModule {}
