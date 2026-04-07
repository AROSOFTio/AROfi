import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

export class PortalLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phoneNumber: string

  @IsOptional()
  @IsString()
  @MaxLength(190)
  tenantDomain?: string
}
