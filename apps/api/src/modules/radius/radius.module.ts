import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { RadiusController } from './radius.controller'
import { RadiusAuthorizationPolicyService } from './radius-authorization-policy.service'
import { RadiusCredentialService } from './radius-credential.service'
import { RadiusService } from './radius.service'
import { AccessLifecycleService } from './access-lifecycle.service'
import { ExpiryRouterLogoutInitializer } from './expiry-router-logout.initializer'
import { RadiusDbListenerService } from './radius-db-listener.service'
import { RadiusSignalSyncService } from './radius-signal-sync.service'
import { YoUgandaDisbursementService } from '../payments/yo-uganda-disbursement.service'
import { MikrotikService } from '../routers/mikrotik.service'
import { RouterCredentialsService } from '../routers/router-credentials.service'

@Module({
  imports: [AuthModule, MailModule],
  controllers: [RadiusController],
  providers: [
    RadiusService,
    RadiusCredentialService,
    RadiusAuthorizationPolicyService,
    RadiusSignalSyncService,
    RadiusDbListenerService,
    AccessLifecycleService,
    ExpiryRouterLogoutInitializer,
    YoUgandaDisbursementService,
    MikrotikService,
    RouterCredentialsService,
  ],
  exports: [RadiusService, RadiusCredentialService, RadiusAuthorizationPolicyService],
})
export class RadiusModule {}
