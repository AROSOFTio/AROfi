import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { RadiusModule } from '../radius/radius.module'
import { SmsModule } from '../sms/sms.module'
import { MikrotikAloginController } from './mikrotik-alogin.controller'
import { MikrotikCompatibilityInitializer } from './mikrotik-compatibility.initializer'
import { MikrotikInstantLoginInterceptor } from './mikrotik-instant-login.interceptor'
import { MikrotikService } from './mikrotik.service'
import { PremiumCaptivePortalInitializer } from './premium-captive-portal.initializer'
import { RouterCaptiveFlowInitializer } from './router-captive-flow.initializer'
import { RouterCredentialsService } from './router-credentials.service'
import { RouterLifecycleService } from './router-lifecycle.service'
import { RouterOverviewService } from './router-overview.service'
import { MikrotikController } from './mikrotik.controller'
import { RoutersController } from './routers.controller'
import { RoutersService } from './routers.service'
import { RemoteProxyService } from './remote-proxy.service'

@Module({
  imports: [AuthModule, MailModule, RadiusModule, SmsModule],
  controllers: [RoutersController, MikrotikController, MikrotikAloginController],
  providers: [
    RouterCredentialsService,
    MikrotikService,
    RoutersService,
    RouterOverviewService,
    RouterLifecycleService,
    RemoteProxyService,
    RouterCaptiveFlowInitializer,
    MikrotikCompatibilityInitializer,
    // Registered after the compatibility/session initializers so its wrapper is
    // the last visual transform applied to generated hotspot/login.html.
    PremiumCaptivePortalInitializer,
    {
      provide: APP_INTERCEPTOR,
      useClass: MikrotikInstantLoginInterceptor,
    },
  ],
  exports: [RouterCredentialsService, MikrotikService, RoutersService, RouterLifecycleService, RemoteProxyService],
})
export class RoutersModule {}
