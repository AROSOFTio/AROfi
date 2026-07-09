import { IsOptional, IsString } from 'class-validator'

export class UpdateRouterDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  password?: string

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
  managerPhone?: string
}
