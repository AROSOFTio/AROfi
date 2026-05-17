import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator'

export class CreateUserDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string

  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  firstName: string

  @IsString()
  @IsNotEmpty()
  lastName: string

  @IsString()
  @MinLength(8)
  password: string

  @IsString()
  @IsNotEmpty()
  roleName: string
}
