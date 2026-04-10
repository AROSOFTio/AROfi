import {
  SupportTicketChannel,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@prisma/client'
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateSupportTicketDto {
  @IsString()
  tenantId!: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string

  @IsString()
  @MaxLength(180)
  subject!: string

  @IsString()
  @MaxLength(80)
  category!: string

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority

  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus

  @IsOptional()
  @IsEnum(SupportTicketChannel)
  channel?: SupportTicketChannel

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerReference?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  openedBy?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedTo?: string
}
