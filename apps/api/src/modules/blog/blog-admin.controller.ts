import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CreateBlogPostDto } from './dto/create-blog-post.dto'
import { ListBlogPostsDto } from './dto/list-blog-posts.dto'
import { UpdateBlogPostDto } from './dto/update-blog-post.dto'
import { BlogService } from './blog.service'

const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024

// Blog content is platform-global (not tenant-scoped), so — like commission
// rates and platform settings in SystemController — every method re-checks
// isSuperAdmin() rather than relying on tenant-scoped permissions.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('blog/admin')
export class BlogAdminController {
  constructor(
    private readonly blogService: BlogService,
    private readonly accessScope: AccessScopeService,
  ) {}

  private assertSuperAdmin(user: AuthenticatedAdminUser) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only platform admins can manage the blog')
    }
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Get('posts')
  listAdmin(@CurrentUser() user: AuthenticatedAdminUser, @Query() query: ListBlogPostsDto) {
    this.assertSuperAdmin(user)
    return this.blogService.listAdmin(query.page ?? 1, query.pageSize ?? 20)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Get('posts/:id')
  getById(@CurrentUser() user: AuthenticatedAdminUser, @Param('id') id: string) {
    this.assertSuperAdmin(user)
    return this.blogService.getAdminById(id)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post('posts')
  create(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateBlogPostDto) {
    this.assertSuperAdmin(user)
    return this.blogService.create(dto, user.id)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Patch('posts/:id')
  update(@CurrentUser() user: AuthenticatedAdminUser, @Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    this.assertSuperAdmin(user)
    return this.blogService.update(id, dto)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Delete('posts/:id')
  remove(@CurrentUser() user: AuthenticatedAdminUser, @Param('id') id: string) {
    this.assertSuperAdmin(user)
    return this.blogService.remove(id)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post('posts/:id/cover')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES } }))
  setCover(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertSuperAdmin(user)
    return this.blogService.setCoverImage(id, file)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post('images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES } }))
  uploadInlineImage(@CurrentUser() user: AuthenticatedAdminUser, @UploadedFile() file: Express.Multer.File) {
    this.assertSuperAdmin(user)
    return this.blogService.uploadInlineImage(file)
  }
}
