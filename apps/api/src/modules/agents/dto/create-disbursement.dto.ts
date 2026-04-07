import { DisbursementMethod } from '@prisma/client'
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export class CreateDisbursementDto {
  @IsOptional()
  @IsUUID()
  settlementId?: string

  @IsInt()
  @Min(1)
  @Max(100000000)
  amountUgx: number

  @IsOptional()
  @IsEnum(DisbursementMethod)
  method?: DisbursementMethod

  @IsOptional()
  @IsString()
  destinationReference?: string

  @IsOptional()
  @IsString()
  providerReference?: string

  @IsOptional()
  @IsString()
  notes?: string
}
