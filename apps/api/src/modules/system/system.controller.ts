import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { AddSupportTicketMessageDto } from './dto/add-support-ticket-message.dto'
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto'
import { UpdateFeatureLimitDto } from './dto/update-feature-limit.dto'
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto'
import { SystemService } from './system.service'

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.systemService.getOverview(tenantId)
  }

  @Get('audit-logs')
  getAuditLogs(@Query('tenantId') tenantId?: string) {
    return this.systemService.getAuditLogs(tenantId)
  }

  @Get('feature-limits')
  getFeatureLimits(@Query('tenantId') tenantId?: string) {
    return this.systemService.getFeatureLimits(tenantId)
  }

  @Patch('feature-limits/:limitId')
  updateFeatureLimit(@Param('limitId') limitId: string, @Body() dto: UpdateFeatureLimitDto) {
    return this.systemService.updateFeatureLimit(limitId, dto)
  }

  @Get('support-tickets')
  getSupportTickets(@Query('tenantId') tenantId?: string) {
    return this.systemService.getSupportTickets(tenantId)
  }

  @Post('support-tickets')
  createSupportTicket(@Body() dto: CreateSupportTicketDto) {
    return this.systemService.createSupportTicket(dto)
  }

  @Patch('support-tickets/:ticketId')
  updateSupportTicket(@Param('ticketId') ticketId: string, @Body() dto: UpdateSupportTicketDto) {
    return this.systemService.updateSupportTicket(ticketId, dto)
  }

  @Post('support-tickets/:ticketId/messages')
  addSupportTicketMessage(@Param('ticketId') ticketId: string, @Body() dto: AddSupportTicketMessageDto) {
    return this.systemService.addSupportTicketMessage(ticketId, dto)
  }
}
