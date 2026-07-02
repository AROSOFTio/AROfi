import { BlogPostStatus } from '@prisma/client'
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator'

export class UpdateBlogPostDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(3)
  slug?: string

  @IsOptional()
  @IsString()
  excerpt?: string

  @IsOptional()
  @IsString()
  contentHtml?: string

  @IsOptional()
  @IsEnum(BlogPostStatus)
  status?: BlogPostStatus

  @IsOptional()
  @IsString()
  metaTitle?: string

  @IsOptional()
  @IsString()
  metaDescription?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]
}
