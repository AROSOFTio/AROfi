import { AgentType } from '@prisma/client'
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export class CreateAgentDto {
  @IsUUID()
  tenantId: string

  @IsString()
  @IsNotEmpty()
  code: string

  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  phoneNumber: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsEnum(AgentType)
  type?: AgentType

  @IsOptional()
  @IsString()
  territory?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  commissionRateBps?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000000)
  floatLimitUgx?: number

  @IsOptional()
  @IsString()
  notes?: string
}
