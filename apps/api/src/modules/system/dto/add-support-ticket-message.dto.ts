import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

export class AddSupportTicketMessageDto {
  @IsString()
  @MaxLength(120)
  authorName!: string

  @IsString()
  @MaxLength(80)
  authorRole!: string

  @IsString()
  @MaxLength(4000)
  body!: string

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean
}
