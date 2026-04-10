import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator'

export class CreateVoucherTemplateDto {
  @IsUUID()
  tenantId: string

  @IsOptional()
  @IsUUID()
  packageId?: string

  @IsString()
  @MinLength(2)
  name: string

  @IsString()
  @MinLength(2)
  code: string

  @IsString()
  @MinLength(2)
  prefix: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  defaultQuantity?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000000)
  faceValueUgx?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresAfterDays?: number

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsString()
  notes?: string
}
