import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BlogController } from './blog.controller'
import { BlogAdminController } from './blog-admin.controller'
import { BlogService } from './blog.service'

@Module({
  imports: [AuthModule],
  controllers: [BlogController, BlogAdminController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
