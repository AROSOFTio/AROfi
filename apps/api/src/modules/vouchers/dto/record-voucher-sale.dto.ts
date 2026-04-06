import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class RecordVoucherSaleDto {
  @IsString()
  @IsNotEmpty()
  customerReference: string

  @IsOptional()
  @IsString()
  externalReference?: string
}
