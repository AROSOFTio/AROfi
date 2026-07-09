import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'
import { NotificationAudience } from '@prisma/client'

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  title: string

  @IsString()
  @IsNotEmpty()
  body: string

  @IsEnum(NotificationAudience)
  audience: NotificationAudience

  @IsOptional()
  @IsUUID()
  tenantId?: string
}
