import { Module } from '@nestjs/common'
import { MikrotikService } from './mikrotik.service'
import { RouterCredentialsService } from './router-credentials.service'
import { RoutersController } from './routers.controller'
import { RoutersService } from './routers.service'

@Module({
  controllers: [RoutersController],
  providers: [RouterCredentialsService, MikrotikService, RoutersService],
  exports: [RouterCredentialsService, MikrotikService, RoutersService],
})
export class RoutersModule {}
