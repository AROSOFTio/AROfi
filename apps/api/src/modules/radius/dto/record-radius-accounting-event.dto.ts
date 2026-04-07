import { RadiusEventType } from '@prisma/client'
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator'

export class RecordRadiusAccountingEventDto {
  @IsUUID()
  tenantId: string

  @IsOptional()
  @IsUUID()
  routerId?: string

  @IsOptional()
  @IsUUID()
  hotspotId?: string

  @IsOptional()
  @IsUUID()
  activationId?: string

  @IsString()
  @IsNotEmpty()
  radiusSessionId: string

  @IsEnum(RadiusEventType)
  eventType: RadiusEventType

  @IsString()
  @IsNotEmpty()
  username: string

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
  packageName?: string

  @IsOptional()
  @IsString()
  sessionTimeSeconds?: string

  @IsOptional()
  @IsString()
  inputOctets?: string

  @IsOptional()
  @IsString()
  outputOctets?: string

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
