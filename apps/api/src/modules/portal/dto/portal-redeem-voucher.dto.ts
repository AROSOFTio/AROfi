import { IsNotEmpty, IsOptional, IsPhoneNumber, IsString, IsUUID, MaxLength } from 'class-validator'

export class PortalRedeemVoucherDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string

  @IsOptional()
  @IsString()
  @IsPhoneNumber()
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

  @IsOptional()
  @IsString()
  @MaxLength(32)
  macAddress?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientIp?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  routerId?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  routerKey?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hotspotServerName?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  loginUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetDevice?: string
}
