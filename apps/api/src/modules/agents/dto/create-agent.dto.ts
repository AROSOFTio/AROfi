import { AgentType } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator'

export class CreateAgentDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string

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
  @IsEmail()
  email?: string

  // When supplied with email, the API creates the VoucherAgent login in the
  // same database transaction as the Agent profile. Existing API clients may
  // omit it and keep creating profile-only Agents.
  @IsOptional()
  @IsString()
  @MinLength(8)
  temporaryPassword?: string

  @IsOptional()
  @IsEnum(AgentType)
  type?: AgentType

  @IsOptional()
  @IsString()
  territory?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  commissionRateBps?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  floatLimitUgx?: number

  @IsOptional()
  @IsString()
  notes?: string
}
