import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { MikrotikService } from './mikrotik.service'
import { RouterCredentialsService } from './router-credentials.service'
import { MikrotikController } from './mikrotik.controller'
import { RoutersController } from './routers.controller'
import { RoutersService } from './routers.service'
import { RemoteProxyService } from './remote-proxy.service'

@Module({
  imports: [AuthModule, MailModule],
  controllers: [RoutersController, MikrotikController],
  providers: [RouterCredentialsService, MikrotikService, RoutersService, RemoteProxyService],
  exports: [RouterCredentialsService, MikrotikService, RoutersService, RemoteProxyService],
})
export class RoutersModule {}
