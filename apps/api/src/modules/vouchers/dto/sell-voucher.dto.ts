import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class SellVoucherDto {
  @IsUUID()
  packageId: string

  @IsString()
  @IsNotEmpty()
  customerReference: string

  @IsOptional()
  @IsUUID()
  agentId?: string
}
