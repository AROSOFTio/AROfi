import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { DashboardSummaryController } from './dashboard-summary.controller'
import { DashboardSummaryService } from './dashboard-summary.service'
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
    DashboardSummaryController,
  ],
  providers: [SystemService, SupportFloorService, PlatformStaffService, DashboardSummaryService],
  exports: [SystemService, SupportFloorService, PlatformStaffService],
})
export class SystemModule {}
