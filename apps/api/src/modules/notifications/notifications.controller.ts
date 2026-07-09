import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CreateNotificationDto } from './dto/create-notification.dto'
import { NotificationsService } from './notifications.service'

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedAdminUser) {
    return this.notificationsService.listForUser(user.id, user.tenantId)
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthenticatedAdminUser, @Param('id') id: string) {
    return this.notificationsService.markRead(id, user.id, user.tenantId)
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedAdminUser) {
    return this.notificationsService.markAllRead(user.id, user.tenantId)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Get('sent')
  listSent(@CurrentUser() user: AuthenticatedAdminUser) {
    this.assertSuperAdmin(user)
    return this.notificationsService.listSent()
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post()
  create(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateNotificationDto) {
    this.assertSuperAdmin(user)
    return this.notificationsService.create(dto, user.id)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  addAttachment(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertSuperAdmin(user)
    if (!file) {
      throw new ForbiddenException('No file uploaded')
    }
    return this.notificationsService.addAttachment(id, file)
  }

  @Get('attachments/:attachmentId/file')
  async getAttachmentFile(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const attachment = await this.notificationsService.getAttachmentFile(
      attachmentId,
      user.id,
      user.tenantId ?? null,
      this.accessScope.isSuperAdmin(user),
    )
    response.setHeader('Content-Type', attachment.mimeType)
    response.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`)
    response.send(attachment.fileData)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedAdminUser, @Param('id') id: string) {
    this.assertSuperAdmin(user)
    return this.notificationsService.remove(id)
  }

  private assertSuperAdmin(user: AuthenticatedAdminUser) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can send business notifications')
    }
  }
}
