import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { RecordRadiusAccountingEventDto } from './dto/record-radius-accounting-event.dto'
import { RecordRadiusAuthEventDto } from './dto/record-radius-auth-event.dto'
import { RadiusService } from './radius.service'

@Controller('radius')
export class RadiusController {
  constructor(private readonly radiusService: RadiusService) {}

  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.radiusService.getOverview(tenantId)
  }

  @Post('auth-events')
  recordAuthEvent(@Body() dto: RecordRadiusAuthEventDto) {
    return this.radiusService.recordAuthEvent(dto)
  }

  @Post('accounting-events')
  recordAccountingEvent(@Body() dto: RecordRadiusAccountingEventDto) {
    return this.radiusService.recordAccountingEvent(dto)
  }
}
