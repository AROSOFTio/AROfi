import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { RadiusController } from './radius.controller'
import { RadiusAuthorizationPolicyService } from './radius-authorization-policy.service'
import { RadiusCredentialService } from './radius-credential.service'
import { RadiusService } from './radius.service'
import { AccessLifecycleService } from './access-lifecycle.service'
import { YoUgandaDisbursementService } from '../payments/yo-uganda-disbursement.service'

@Module({
  imports: [AuthModule, MailModule],
  controllers: [RadiusController],
  providers: [
    RadiusService,
    RadiusCredentialService,
    RadiusAuthorizationPolicyService,
    AccessLifecycleService,
    YoUgandaDisbursementService,
  ],
  exports: [RadiusService, RadiusCredentialService, RadiusAuthorizationPolicyService],
})
export class RadiusModule {}
