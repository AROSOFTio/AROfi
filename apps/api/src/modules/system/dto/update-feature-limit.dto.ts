import { FeatureLimitCategory } from '@prisma/client'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class UpdateFeatureLimitDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  name?: string

  @IsOptional()
  @IsEnum(FeatureLimitCategory)
  category?: FeatureLimitCategory

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(24)
  unit?: string

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  limitValue?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  warningThresholdPct?: number

  @IsOptional()
  @IsBoolean()
  hardLimit?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string
}
