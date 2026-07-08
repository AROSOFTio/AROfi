import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AiChatService } from './ai-chat.service';
import { ChatController } from './chat.controller';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { RoutersModule } from '../routers/routers.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [MailModule, AuthModule, RoutersModule, BillingModule],
  controllers: [ChatController],
  providers: [ChatService, AiChatService],
  exports: [ChatService],
})
export class ChatModule {}
