import {
  RouterConnectionMode,
  RouterScriptMode,
  RouterVendor,
} from '@prisma/client'
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator'

export class CreateRouterDto {
  @IsUUID()
  tenantId: string

  @IsOptional()
  @IsUUID()
  groupId?: string

  @IsOptional()
  @IsUUID()
  hotspotId?: string

  @IsString()
  @IsNotEmpty()
  name: string

  @IsOptional()
  @IsString()
  identity?: string

  @IsOptional()
  @IsEnum(RouterVendor)
  vendor?: RouterVendor

  @IsOptional()
  @IsString()
  host?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  apiPort?: number

  @IsOptional()
  @IsEnum(RouterConnectionMode)
  connectionMode?: RouterConnectionMode

  @IsOptional()
  @IsString()
  username?: string

  @IsOptional()
  @IsString()
  password?: string

  @IsOptional()
  @IsString()
  sharedSecret?: string

  @IsOptional()
  @IsEnum(RouterScriptMode)
  scriptMode?: RouterScriptMode

  @IsOptional()
  @IsString()
  siteLabel?: string

  @IsOptional()
  @IsString()
  locationText?: string

  @IsOptional()
  @IsString()
  ispName?: string

  @IsOptional()
  @IsString()
  managerName?: string

  @IsOptional()
  @IsString()
  @IsPhoneNumber()
  managerPhone?: string

  @IsOptional()
  @IsString()
  model?: string

  @IsOptional()
  @IsString()
  serialNumber?: string

  @IsOptional()
  @IsString()
  routerOsVersion?: string

  @IsOptional()
  @IsString()
  radiusNasIpAddress?: string

  @IsOptional()
  @IsString()
  hotspotServerName?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  portalWalledGardenHosts?: string[]

  @IsOptional()
  ttlAntiTetheringEnabled?: boolean

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[]
}
