import { Controller, Get, UseGuards } from '@nestjs/common'
import { RedisCache } from '../../common/cache/redis-cache.decorators'
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
  @RedisCache({ namespace: 'system:dashboard-summary', ttlSeconds: 10 })
  @Get('dashboard-summary')
  getDashboardSummary() {
    return this.dashboardSummaryService.getSummary()
  }
}
