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
}
