import { PackageStatus } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator'

export class CreatePackageDto {
  @IsUUID()
  tenantId: string

  @IsString()
  @MinLength(2)
  name: string

  @IsString()
  @MinLength(2)
  code: string

  @IsOptional()
  @IsString()
  description?: string

  @IsInt()
  @Min(1)
  @Max(43200)
  durationMinutes: number

  @IsOptional()
  @IsInt()
  @Min(1)
  dataLimitMb?: number

  @IsOptional()
  @IsInt()
  @Min(1)
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

  @IsInt()
  @Min(1)
  @Max(100000000)
  initialPriceUgx: number
}
