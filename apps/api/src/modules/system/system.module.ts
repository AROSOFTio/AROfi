import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { PlatformStaffController } from './platform-staff.controller'
import { PlatformStaffService } from './platform-staff.service'
import { PublicStatsController } from './public-stats.controller'
import { SupportFloorController } from './support-floor.controller'
import { SupportFloorService } from './support-floor.service'
import { PublicSystemController, SystemController } from './system.controller'
import { SystemService } from './system.service'

@Module({
  imports: [AuthModule, MailModule],
  controllers: [
    SystemController,
    PublicSystemController,
    PublicStatsController,
    SupportFloorController,
    PlatformStaffController,
  ],
  providers: [SystemService, SupportFloorService, PlatformStaffService],
  exports: [SystemService, SupportFloorService, PlatformStaffService],
})
export class SystemModule {}
