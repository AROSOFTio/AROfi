import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator'

export class CreateVoucherBatchDto {
  @IsUUID()
  tenantId: string

  @IsUUID()
  packageId: string

  @IsOptional()
  @IsUUID()
  generatedByUserId?: string

  @IsString()
  @MinLength(2)
  prefix: string

  @IsInt()
  @Min(1)
  @Max(10000)
  quantity: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000000)
  faceValueUgx?: number

  @IsOptional()
  @IsDateString()
  expiresAt?: string

  @IsOptional()
  @IsString()
  notes?: string
}
