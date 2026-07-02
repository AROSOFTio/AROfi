import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { BlogPostStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { sanitizeBlogHtml } from './blog-sanitize'
import { CreateBlogPostDto } from './dto/create-blog-post.dto'
import { UpdateBlogPostDto } from './dto/update-blog-post.dto'

// Every top-level static route in apps/admin-web/src/app — a post slug
// matching one of these would be permanently shadowed by the static page
// (Next.js always resolves static segments before the [slug] catch-all).
const RESERVED_SLUGS = new Set([
  'docs', 'blog', 'login', 'register', 'setup', 'api', 'dashboard', 'admin',
  'packages', 'vouchers', 'sales', 'transactions', 'earnings', 'float',
  'disbursements', 'users', 'agents', 'settings', 'support', 'tenants',
  'sales-by-tenant', 'feature-limits', 'audit-logs', 'sessions', 'hotspots',
  'payments', 'reports', 'router', 'portal',
])
const DEFAULT_PAGE_SIZE = 20
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const postSummarySelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  status: true,
  metaTitle: true,
  metaDescription: true,
  tags: true,
  coverImageId: true,
  viewCount: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BlogPostSelect

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveSlug(requested: string | undefined, title: string, excludeId?: string) {
    const base = slugify(requested && requested.length > 0 ? requested : title)
    if (!base) {
      throw new BadRequestException('Could not derive a URL slug from the title')
    }
    if (RESERVED_SLUGS.has(base)) {
      throw new BadRequestException(`"${base}" is a reserved path and cannot be used as a post slug`)
    }

    const existing = await this.prisma.blogPost.findUnique({ where: { slug: base } })
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Slug already in use')
    }

    return base
  }

  async listPublished(page = 1, pageSize = DEFAULT_PAGE_SIZE, tag?: string) {
    const where: Prisma.BlogPostWhereInput = {
      status: BlogPostStatus.PUBLISHED,
      ...(tag ? { tags: { has: tag } } : {}),
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where,
        select: postSummarySelect,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.blogPost.count({ where }),
    ])

    return { items, total, page, pageSize }
  }

  async listPublishedSlugs() {
    const posts = await this.prisma.blogPost.findMany({
      where: { status: BlogPostStatus.PUBLISHED },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
    })
    return posts
  }

  async getPublishedBySlug(slug: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { slug } })
    if (!post || post.status !== BlogPostStatus.PUBLISHED) {
      throw new NotFoundException('Post not found')
    }

    this.prisma.blogPost
      .update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined)

    return post
  }

  async getImage(id: string) {
    const image = await this.prisma.blogImage.findUnique({ where: { id } })
    if (!image) {
      throw new NotFoundException('Image not found')
    }
    return image
  }

  async listAdmin(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        select: postSummarySelect,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.blogPost.count(),
    ])
    return { items, total, page, pageSize }
  }

  async getAdminById(id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } })
    if (!post) {
      throw new NotFoundException('Post not found')
    }
    return post
  }

  async create(dto: CreateBlogPostDto, authorId?: string) {
    const slug = await this.resolveSlug(dto.slug, dto.title)
    const status = dto.status ?? BlogPostStatus.DRAFT

    return this.prisma.blogPost.create({
      data: {
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        contentHtml: sanitizeBlogHtml(dto.contentHtml),
        status,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        tags: dto.tags ?? [],
        authorId,
        publishedAt: status === BlogPostStatus.PUBLISHED ? new Date() : null,
      },
    })
  }

  async update(id: string, dto: UpdateBlogPostDto) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } })
    if (!existing) {
      throw new NotFoundException('Post not found')
    }

    const slug =
      dto.slug !== undefined || dto.title !== undefined
        ? await this.resolveSlug(dto.slug ?? existing.slug, dto.title ?? existing.title, id)
        : undefined

    const nextStatus = dto.status ?? existing.status
    const publishedAt =
      nextStatus === BlogPostStatus.PUBLISHED ? existing.publishedAt ?? new Date() : existing.publishedAt

    return this.prisma.blogPost.update({
      where: { id },
      data: {
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        contentHtml: dto.contentHtml !== undefined ? sanitizeBlogHtml(dto.contentHtml) : undefined,
        status: dto.status,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        tags: dto.tags,
        publishedAt,
      },
    })
  }

  async remove(id: string) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } })
    if (!existing) {
      throw new NotFoundException('Post not found')
    }
    await this.prisma.blogPost.delete({ where: { id } })
    return { deleted: true }
  }

  private assertImageFile(file?: { mimetype: string; size: number }) {
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WEBP, or GIF images are accepted')
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image must be 8MB or smaller')
    }
  }

  async setCoverImage(postId: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    this.assertImageFile(file)
    const post = await this.prisma.blogPost.findUnique({ where: { id: postId } })
    if (!post) {
      throw new NotFoundException('Post not found')
    }

    const previousCoverImageId = post.coverImageId

    const image = await this.prisma.$transaction(async (tx) => {
      if (previousCoverImageId) {
        await tx.blogPost.update({ where: { id: postId }, data: { coverImageId: null } })
      }
      const created = await tx.blogImage.create({
        data: {
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          fileData: file.buffer,
        },
      })
      await tx.blogPost.update({ where: { id: postId }, data: { coverImageId: created.id } })
      if (previousCoverImageId) {
        await tx.blogImage.delete({ where: { id: previousCoverImageId } }).catch(() => undefined)
      }
      return created
    })

    return { id: image.id, url: `/api/blog/images/${image.id}` }
  }

  async uploadInlineImage(file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    this.assertImageFile(file)
    const image = await this.prisma.blogImage.create({
      data: {
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileData: file.buffer,
      },
    })
    return { id: image.id, url: `/api/blog/images/${image.id}` }
  }
}
