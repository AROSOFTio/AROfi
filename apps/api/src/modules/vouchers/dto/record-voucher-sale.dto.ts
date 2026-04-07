import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class RecordVoucherSaleDto {
  @IsString()
  @IsNotEmpty()
  customerReference: string

  @IsOptional()
  @IsString()
  externalReference?: string

  @IsOptional()
  @IsUUID()
  agentId?: string
}
