import { PaymentNetwork } from '@prisma/client'
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

export class RegisterPayoutNumberDto {
  @IsEnum(PaymentNetwork)
  network: PaymentNetwork

  @IsString()
  @MaxLength(32)
  phoneNumber: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string
}
