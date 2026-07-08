import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { ComplianceController } from './compliance.controller'
import { ComplianceService } from './compliance.service'

@Module({
  imports: [AuthModule, MailModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
