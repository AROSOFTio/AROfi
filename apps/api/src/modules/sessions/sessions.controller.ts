import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/auth.module'
import { SessionsService } from './sessions.service'

@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.sessionsService.getOverview(tenantId)
  }
}
