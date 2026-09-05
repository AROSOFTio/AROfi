import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { RadiusModule } from '../radius/radius.module'
import { SmsModule } from '../sms/sms.module'
import { CaptivePortalResilienceInitializer } from './captive-portal-resilience.initializer'
import { MikrotikAloginController } from './mikrotik-alogin.controller'
import { MikrotikCompatibilityInitializer } from './mikrotik-compatibility.initializer'
import { MikrotikInstantLoginInterceptor } from './mikrotik-instant-login.interceptor'
import { MikrotikService } from './mikrotik.service'
import { PortalPackageClarityInitializer } from './portal-package-clarity.initializer'
import { PremiumCaptivePortalInitializer } from './premium-captive-portal.initializer'
import { RouterCaptiveFlowInitializer } from './router-captive-flow.initializer'
import { RouterCompatibilityController } from './router-compatibility.controller'
import { RouterCompatibilityService } from './router-compatibility.service'
import { RouterCredentialsService } from './router-credentials.service'
import { RouterLifecycleService } from './router-lifecycle.service'
import { RouterOverviewService } from './router-overview.service'
import { MikrotikController } from './mikrotik.controller'
import { RoutersController } from './routers.controller'
import { RoutersService } from './routers.service'
import { RemoteProxyService } from './remote-proxy.service'

@Module({
  imports: [AuthModule, MailModule, RadiusModule, SmsModule],
  controllers: [RoutersController, RouterCompatibilityController, MikrotikController, MikrotikAloginController],
  providers: [
    RouterCredentialsService,
    MikrotikService,
    RoutersService,
    RouterCompatibilityService,
    RouterOverviewService,
    RouterLifecycleService,
    RemoteProxyService,
    RouterCaptiveFlowInitializer,
    MikrotikCompatibilityInitializer,
    // Visual transforms are deliberately ordered last. Package clarity wraps
    // the premium captive shell so existing voucher/payment/roaming behaviour
    // is preserved while the final RouterOS login.html gets readable plan cards.
    PremiumCaptivePortalInitializer,
    PortalPackageClarityInitializer,
    // This MUST remain after the visual transforms. It is the final safety layer
    // on the real RouterOS hotspot/login.html used by first-time customers.
    CaptivePortalResilienceInitializer,
    {
      provide: APP_INTERCEPTOR,
      useClass: MikrotikInstantLoginInterceptor,
    },
  ],
  exports: [
    RouterCredentialsService,
    MikrotikService,
    RoutersService,
    RouterCompatibilityService,
    RouterLifecycleService,
    RemoteProxyService,
  ],
})
export class RoutersModule {}
