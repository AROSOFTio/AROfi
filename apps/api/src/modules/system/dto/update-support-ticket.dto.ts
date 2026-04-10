import { SupportTicketPriority, SupportTicketStatus } from '@prisma/client'
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedTo?: string
}
