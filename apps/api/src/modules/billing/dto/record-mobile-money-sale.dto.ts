import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export class RecordMobileMoneySaleDto {
  @IsUUID()
  tenantId: string

  @IsUUID()
  packageId: string

  @IsInt()
  @Min(1)
  @Max(100000000)
  grossAmountUgx: number

  @IsString()
  @IsNotEmpty()
  customerReference: string

  @IsString()
  @IsNotEmpty()
  externalReference: string

  @IsOptional()
  @IsString()
  paymentProvider?: string

  @IsOptional()
  @IsString()
  network?: string

  @IsOptional()
  @IsUUID()
  agentId?: string
}
