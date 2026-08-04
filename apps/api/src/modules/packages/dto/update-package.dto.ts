import { PackageStatus } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'

// Every field optional: lets a vendor edit just the name or price of an
// existing package without re-sending the whole definition.
export class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(43200)
  durationMinutes?: number

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isTrialEnabled?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  dataLimitMb?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  deviceLimit?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  downloadSpeedKbps?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  uploadSpeedKbps?: number

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFeatured?: boolean

  @IsOptional()
  @IsEnum(PackageStatus)
  status?: PackageStatus

  // When provided, supersedes the current default price (old price is ended).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000000)
  priceUgx?: number
}
