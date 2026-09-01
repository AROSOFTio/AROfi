import {
  Body,
  Controller,
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
import { CurrentUser } from '../auth/current-user.decorator'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { BackupRecoveryService } from './backup-recovery.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('system/recovery')
export class BackupRecoveryController {
  constructor(
    private readonly recovery: BackupRecoveryService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.all)
  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedAdminUser) {
    this.requirePlatformOwner(user)
    return this.recovery.getStatus()
  }

  @RequirePermissions(PERMISSIONS.all)
  @Get('backups')
  listBackups(@CurrentUser() user: AuthenticatedAdminUser) {
    this.requirePlatformOwner(user)
    return this.recovery.listBackups()
  }

  @RequirePermissions(PERMISSIONS.all)
  @Post('backups')
  createBackup(@CurrentUser() user: AuthenticatedAdminUser) {
    this.requirePlatformOwner(user)
    return this.recovery.createManualBackup(user)
  }

  @RequirePermissions(PERMISSIONS.all)
  @Get('backups/:name/download')
  async downloadBackup(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('name') name: string,
    @Res() response: Response,
  ) {
    this.requirePlatformOwner(user)
    const file = await this.recovery.getBackupFile(name)
    response.setHeader('Content-Type', 'application/octet-stream')
    response.setHeader('Content-Length', String(file.size))
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/"/g, '')}"`)
    file.stream.pipe(response)
  }

  @RequirePermissions(PERMISSIONS.all)
  @Post('backups/:name/restore')
  restoreBackup(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('name') name: string,
    @Body() body: { confirmation?: string; reason?: string },
  ) {
    this.requirePlatformOwner(user)
    return this.recovery.restoreBackup(name, body.confirmation ?? '', body.reason, user)
  }

  @RequirePermissions(PERMISSIONS.all)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 512 * 1024 * 1024 } }))
  uploadBackup(
    @CurrentUser() user: AuthenticatedAdminUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.requirePlatformOwner(user)
    if (!file) throw new ForbiddenException('No backup file uploaded')
    return this.recovery.saveUploadedBackup(file, user)
  }

  private requirePlatformOwner(user: AuthenticatedAdminUser) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only the AROFi platform owner can manage database backup and restore')
    }
  }
}
