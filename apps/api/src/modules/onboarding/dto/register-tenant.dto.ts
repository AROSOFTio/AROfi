import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  tenantName!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  desiredDomain?: string

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName!: string

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName!: string

  @IsEmail()
  @MaxLength(160)
  email!: string

  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phoneNumber!: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  supportPhone?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  supportEmail?: string

  @IsOptional()
  @Matches(/^#?[0-9a-fA-F]{6}$/)
  brandColor?: string

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string
}
