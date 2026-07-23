import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { SystemController } from './system.controller'
import { SystemService } from './system.service'
import { PublicStatsController } from './public-stats.controller'

@Module({
  imports: [AuthModule],
  controllers: [SystemController, PublicStatsController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
