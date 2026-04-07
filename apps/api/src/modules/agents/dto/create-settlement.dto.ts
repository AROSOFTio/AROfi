import { IsISO8601, IsOptional, IsString } from 'class-validator'

export class CreateSettlementDto {
  @IsOptional()
  @IsISO8601()
  periodStart?: string

  @IsOptional()
  @IsISO8601()
  periodEnd?: string

  @IsOptional()
  @IsString()
  notes?: string
}
