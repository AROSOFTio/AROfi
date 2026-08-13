import { Equals, IsBoolean, IsEmail, IsIn, IsOptional, IsPhoneNumber, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class RegisterTenantDto {
  @IsOptional()
  @IsIn(['WIFI_VENDOR', 'RESELLER'])
  accountType?: 'WIFI_VENDOR' | 'RESELLER'

  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string

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
  @IsPhoneNumber()
  @MinLength(7)
  @MaxLength(32)
  phoneNumber!: string

  @IsOptional()
  @IsString()
  @IsPhoneNumber()
  @MaxLength(32)
  supportPhone?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  supportEmail?: string

  @IsOptional()
  @Matches(/^#?[0-9a-fA-F]{6}$/)
  brandColor?: string

  @IsOptional()
  @IsString()
  @Matches(/^(classic|fresh|midnight|sunrise|minimal)$/)
  portalTemplate?: string

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string

  @IsBoolean()
  @Equals(true, { message: 'You must accept the Terms of Service and Privacy Policy.' })
  acceptedTermsAndPrivacy!: boolean
}
