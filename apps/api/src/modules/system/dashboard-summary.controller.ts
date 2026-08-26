import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { DashboardSummaryService } from './dashboard-summary.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('system')
export class DashboardSummaryController {
  constructor(private readonly dashboardSummaryService: DashboardSummaryService) {}

  @RequirePermissions(PERMISSIONS.supportRead)
  @Get('dashboard-summary')
  getDashboardSummary() {
    return this.dashboardSummaryService.getSummary()
  }
}
