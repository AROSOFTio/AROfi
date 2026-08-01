import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RadiusModule } from '../radius/radius.module'
import { PackagesController } from './packages.controller'
import { PackagesService } from './packages.service'

@Module({
  imports: [AuthModule, RadiusModule],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
