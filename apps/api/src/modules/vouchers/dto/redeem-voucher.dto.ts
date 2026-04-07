import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class RedeemVoucherDto {
  @IsString()
  @IsNotEmpty()
  code: string

  @IsOptional()
  @IsString()
  customerReference?: string

  @IsOptional()
  @IsString()
  accessPhoneNumber?: string

  @IsOptional()
  @IsUUID()
  hotspotId?: string

  @IsOptional()
  @IsUUID()
  redeemedByUserId?: string

  @IsOptional()
  @IsString()
  sessionReference?: string
}
