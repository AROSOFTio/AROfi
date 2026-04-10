import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(190)
  domain?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string

  @IsOptional()
  @IsString()
  @Matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
  brandColor?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  supportPhone?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(190)
  supportEmail?: string
}
