import { PaymentNetwork } from '@prisma/client'
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'

export class RequestPayoutNumberChangeDto {
  @IsOptional()
  @IsUUID()
  existingPayoutNumberId?: string

  @IsEnum(PaymentNetwork)
  network: PaymentNetwork

  @IsString()
  @MaxLength(32)
  phoneNumber: string

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string
}
