import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class CreateHotspotDto {
  @IsUUID()
  tenantId: string

  @IsString()
  @IsNotEmpty()
  name: string

  @IsOptional()
  @IsString()
  nasIpAddress?: string

  @IsOptional()
  @IsString()
  secret?: string
}
