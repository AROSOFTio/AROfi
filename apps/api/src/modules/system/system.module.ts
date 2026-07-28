import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { SystemController } from './system.controller'
import { SystemService } from './system.service'
import { PublicStatsController } from './public-stats.controller'

@Module({
  imports: [AuthModule, MailModule],
  controllers: [SystemController, PublicStatsController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
