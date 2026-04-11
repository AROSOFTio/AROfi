import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { HotspotsController } from './hotspots.controller'
import { HotspotsService } from './hotspots.service'

@Module({
  imports: [AuthModule],
  controllers: [HotspotsController],
  providers: [HotspotsService],
  exports: [HotspotsService],
})
export class HotspotsModule {}
