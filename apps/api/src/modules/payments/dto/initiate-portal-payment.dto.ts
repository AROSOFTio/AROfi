import { PaymentMethod, PaymentNetwork, PaymentProvider } from '@prisma/client'
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class InitiatePortalPaymentDto {
  @IsUUID()
  packageId: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phoneNumber: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerReference?: string

  @IsOptional()
  @IsEnum(PaymentNetwork)
  network?: PaymentNetwork

  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string

  @IsOptional()
  @IsString()
  @MaxLength(190)
  tenantDomain?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hotspotName?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionReference?: string
}
