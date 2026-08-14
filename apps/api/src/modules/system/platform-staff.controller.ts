import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PermissionsGuard } from '../auth/permissions.guard'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CreatePlatformStaffDto, UpdatePlatformStaffDto } from './dto/support-floor.dto'
import { PlatformStaffService } from './platform-staff.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('platform-staff')
export class PlatformStaffController {
  constructor(private readonly platformStaffService: PlatformStaffService) {}

  @RequirePermissions(PERMISSIONS.usersRead)
  @Get()
  list(@CurrentUser() user: AuthenticatedAdminUser) {
    return this.platformStaffService.list(user)
  }

  @RequirePermissions(PERMISSIONS.usersManage)
  @Post()
  create(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreatePlatformStaffDto) {
    return this.platformStaffService.create(dto, user)
  }

  @RequirePermissions(PERMISSIONS.usersManage)
  @Patch(':userId')
  update(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('userId') userId: string,
    @Body() dto: UpdatePlatformStaffDto,
  ) {
    return this.platformStaffService.update(userId, dto, user)
  }

  @RequirePermissions(PERMISSIONS.usersManage)
  @Post(':userId/deactivate')
  deactivate(@CurrentUser() user: AuthenticatedAdminUser, @Param('userId') userId: string) {
    return this.platformStaffService.deactivate(userId, user)
  }

  @RequirePermissions(PERMISSIONS.usersManage)
  @Post(':userId/activate')
  activate(@CurrentUser() user: AuthenticatedAdminUser, @Param('userId') userId: string) {
    return this.platformStaffService.activate(userId, user)
  }
}
