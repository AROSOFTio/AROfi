import {
  RouterConnectionMode,
  RouterVendor,
} from '@prisma/client'
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
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

  @IsString()
  @IsNotEmpty()
  host: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  apiPort?: number

  @IsOptional()
  @IsEnum(RouterConnectionMode)
  connectionMode?: RouterConnectionMode

  @IsString()
  @IsNotEmpty()
  username: string

  @IsString()
  @IsNotEmpty()
  password: string

  @IsString()
  @IsNotEmpty()
  sharedSecret: string

  @IsOptional()
  @IsString()
  siteLabel?: string

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
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[]
}
