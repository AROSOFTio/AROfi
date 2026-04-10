import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator'

export class UpdateVoucherTemplateDto {
  @IsOptional()
  @IsUUID()
  packageId?: string | null

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  code?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  prefix?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  defaultQuantity?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000000)
  faceValueUgx?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresAfterDays?: number | null

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsString()
  notes?: string | null
}
