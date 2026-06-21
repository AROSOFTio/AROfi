import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RadiusModule } from '../radius/radius.module'
import { MikrotikService } from './mikrotik.service'
import { RouterCredentialsService } from './router-credentials.service'
import { MikrotikController } from './mikrotik.controller'
import { RoutersController } from './routers.controller'
import { RoutersService } from './routers.service'

@Module({
  imports: [AuthModule, RadiusModule],
  controllers: [RoutersController, MikrotikController],
  providers: [RouterCredentialsService, MikrotikService, RoutersService],
  exports: [RouterCredentialsService, MikrotikService, RoutersService],
})
export class RoutersModule {}
