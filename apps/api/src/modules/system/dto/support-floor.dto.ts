import { SupportTicketPriority, SupportTicketStatus } from '@prisma/client'
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'

export class CreateSupportFloorTicketDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  subject: string

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  category: string

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  body: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phoneNumber?: string

  @IsOptional()
  @IsEmail()
  email?: string
}

export class UpdateSupportFloorTicketDto {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string | null
}

export class AddSupportFloorMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean

  @IsOptional()
  @IsEnum(SupportTicketStatus)
  statusAfterReply?: SupportTicketStatus
}

export class CreatePlatformStaffDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string

  @IsString()
  @MinLength(8)
  password: string

  @IsString()
  roleName: string
}

export class UpdatePlatformStaffDto {
  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string

  @IsOptional()
  @IsString()
  roleName?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
