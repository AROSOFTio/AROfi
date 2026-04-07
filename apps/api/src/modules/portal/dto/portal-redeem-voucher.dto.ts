import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class PortalRedeemVoucherDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerReference?: string

  @IsOptional()
  @IsUUID()
  hotspotId?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionReference?: string
}
