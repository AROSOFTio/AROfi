import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export const FEEDBACK_TYPES = [
  'Feature suggestion',
  'Improvement recommendation',
  'Product review',
  'Something is confusing',
  'Other feedback',
] as const

export class CreateFeedbackDto {
  @IsString()
  @IsIn(FEEDBACK_TYPES)
  type!: string

  @IsString()
  @MaxLength(160)
  title!: string

  @IsString()
  @MaxLength(3500)
  details!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number
}
