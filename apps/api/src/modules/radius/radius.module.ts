import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RadiusController } from './radius.controller'
import { RadiusAuthorizationPolicyService } from './radius-authorization-policy.service'
import { RadiusCredentialService } from './radius-credential.service'
import { RadiusService } from './radius.service'
import { AccessLifecycleService } from './access-lifecycle.service'

@Module({
  imports: [AuthModule],
  controllers: [RadiusController],
  providers: [RadiusService, RadiusCredentialService, RadiusAuthorizationPolicyService, AccessLifecycleService],
  exports: [RadiusService, RadiusCredentialService, RadiusAuthorizationPolicyService],
})
export class RadiusModule {}
