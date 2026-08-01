import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'

export class CreateTvActivationDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string

  @IsString()
  @Matches(/^([0-9a-fA-F]{2}[:-]?){5}[0-9a-fA-F]{2}$/, {
    message: 'Enter a valid TV MAC address, for example AA:BB:CC:DD:EE:FF',
  })
  macAddress: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerName?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string

  @IsOptional()
  @IsUUID()
  routerId?: string

  @IsOptional()
  @IsUUID()
  hotspotId?: string
}
