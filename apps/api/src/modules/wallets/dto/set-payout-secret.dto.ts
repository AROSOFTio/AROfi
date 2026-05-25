import { IsOptional, IsString, Length } from 'class-validator'

export class SetPayoutSecretDto {
  @IsOptional()
  @IsString()
  currentPassword?: string

  @IsOptional()
  @IsString()
  currentSecretKey?: string

  @IsString()
  @Length(8, 72)
  secretKey: string
}
