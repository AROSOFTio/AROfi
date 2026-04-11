import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PackagesController } from './packages.controller'
import { PackagesService } from './packages.service'

@Module({
  imports: [AuthModule],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
