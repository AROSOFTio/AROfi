import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { RadiusModule } from '../radius/radius.module'
import { SmsModule } from '../sms/sms.module'
import { MikrotikService } from './mikrotik.service'
import { RouterCaptiveFlowInitializer } from './router-captive-flow.initializer'
import { RouterCredentialsService } from './router-credentials.service'
import { MikrotikController } from './mikrotik.controller'
import { RoutersController } from './routers.controller'
import { RoutersService } from './routers.service'
import { RemoteProxyService } from './remote-proxy.service'

@Module({
  imports: [AuthModule, MailModule, RadiusModule, SmsModule],
  controllers: [RoutersController, MikrotikController],
  providers: [
    RouterCredentialsService,
    MikrotikService,
    RoutersService,
    RemoteProxyService,
    RouterCaptiveFlowInitializer,
  ],
  exports: [RouterCredentialsService, MikrotikService, RoutersService, RemoteProxyService],
})
export class RoutersModule {}
