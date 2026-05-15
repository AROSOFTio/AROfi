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

  @IsOptional()
  @IsString()
  macAddress?: string

  @IsOptional()
  @IsString()
  clientIp?: string

  @IsOptional()
  @IsString()
  routerId?: string

  @IsOptional()
  @IsString()
  hotspotServerName?: string

  @IsOptional()
  @IsString()
  userAgent?: string
}
