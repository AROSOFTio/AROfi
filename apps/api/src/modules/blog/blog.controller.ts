import { Controller, Get, Param, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ListBlogPostsDto } from './dto/list-blog-posts.dto'
import { BlogService } from './blog.service'

// Fully public — powers the SEO-facing /blog index and /[slug] post pages.
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get('posts')
  listPublished(@Query() query: ListBlogPostsDto) {
    return this.blogService.listPublished(query.page ?? 1, query.pageSize ?? 20, query.tag)
  }

  @Get('slugs')
  listSlugs() {
    return this.blogService.listPublishedSlugs()
  }

  @Get('posts/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.blogService.getPublishedBySlug(slug)
  }

  @Get('images/:id')
  async getImage(@Param('id') id: string, @Res() response: Response) {
    const image = await this.blogService.getImage(id)
    response.setHeader('Content-Type', image.mimeType)
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    response.send(image.fileData)
  }
}
