import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator'

export const routerCompatibilityVendors = [
  'MIKROTIK',
  'RUIJIE_REYEE',
  'TP_LINK_OMADA',
  'UBIQUITI_UNIFI',
  'CISCO',
  'HUAWEI',
  'D_LINK',
  'CAMBIUM',
  'GENERIC_RADIUS',
] as const

export type RouterCompatibilityVendor = (typeof routerCompatibilityVendors)[number]

export class RegisterCompatibleRouterDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsIn(routerCompatibilityVendors)
  vendor: RouterCompatibilityVendor

  @IsString()
  @IsNotEmpty()
  nasAddress: string

  @IsOptional()
  @IsString()
  model?: string

  @IsOptional()
  @IsString()
  sharedSecret?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  authPort?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  accountingPort?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  coaPort?: number

  @IsOptional()
  @IsString()
  siteLabel?: string
}
