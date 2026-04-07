import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator'

export class RecordRadiusAuthEventDto {
  @IsUUID()
  tenantId: string

  @IsOptional()
  @IsUUID()
  routerId?: string

  @IsOptional()
  @IsUUID()
  hotspotId?: string

  @IsOptional()
  @IsString()
  radiusSessionId?: string

  @IsString()
  @IsNotEmpty()
  username: string

  @IsBoolean()
  accepted: boolean

  @IsOptional()
  @IsString()
  customerReference?: string

  @IsOptional()
  @IsString()
  phoneNumber?: string

  @IsOptional()
  @IsString()
  macAddress?: string

  @IsOptional()
  @IsString()
  ipAddress?: string

  @IsOptional()
  @IsString()
  nasIpAddress?: string

  @IsOptional()
  @IsString()
  authMethod?: string

  @IsOptional()
  @IsString()
  responseCode?: string

  @IsOptional()
  @IsString()
  message?: string

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>
}
