import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RadiusController } from './radius.controller'
import { RadiusService } from './radius.service'

@Module({
  imports: [AuthModule],
  controllers: [RadiusController],
  providers: [RadiusService],
  exports: [RadiusService],
})
export class RadiusModule {}
