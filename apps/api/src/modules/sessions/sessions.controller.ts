import { Controller, Get, Query } from '@nestjs/common'
import { SessionsService } from './sessions.service'

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.sessionsService.getOverview(tenantId)
  }
}
