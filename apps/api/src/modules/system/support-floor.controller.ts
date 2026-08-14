import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PermissionsGuard } from '../auth/permissions.guard'
import { PERMISSIONS } from '../auth/permissions.constants'
import {
  AddSupportFloorMessageDto,
  CreateSupportFloorTicketDto,
  UpdateSupportFloorTicketDto,
} from './dto/support-floor.dto'
import { SupportFloorService } from './support-floor.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('support-floor')
export class SupportFloorController {
  constructor(private readonly supportFloorService: SupportFloorService) {}

  @RequirePermissions(PERMISSIONS.supportRead)
  @Get('tickets')
  listTickets(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.supportFloorService.listTickets(user, tenantId)
  }

  @RequirePermissions(PERMISSIONS.supportRead)
  @Get('staff')
  listAssignableStaff(@CurrentUser() user: AuthenticatedAdminUser) {
    return this.supportFloorService.listAssignableStaff(user)
  }

  @RequirePermissions(PERMISSIONS.supportWrite)
  @Post('tickets')
  createTicket(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Body() dto: CreateSupportFloorTicketDto,
  ) {
    return this.supportFloorService.createTicket(user, dto)
  }

  @RequirePermissions(PERMISSIONS.supportWrite)
  @Patch('tickets/:ticketId')
  updateTicket(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: UpdateSupportFloorTicketDto,
  ) {
    return this.supportFloorService.updateTicket(user, ticketId, dto)
  }

  @RequirePermissions(PERMISSIONS.supportWrite)
  @Post('tickets/:ticketId/messages')
  addMessage(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: AddSupportFloorMessageDto,
  ) {
    return this.supportFloorService.addMessage(user, ticketId, dto)
  }
}
