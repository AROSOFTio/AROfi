import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class CreateRouterGroupDto {
  @IsUUID()
  tenantId: string

  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  code: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  region?: string
}
