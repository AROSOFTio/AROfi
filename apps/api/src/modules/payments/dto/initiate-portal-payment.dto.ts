import { PaymentMethod, PaymentNetwork } from '@prisma/client'
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'

export class InitiatePortalPaymentDto {
  @IsUUID()
  packageId: string

  // A phone number remains required for internet activation, customer matching,
  // and reconnecting the device even when the customer pays by card.
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phoneNumber: string

  @IsEnum(PaymentNetwork)
  @IsNotEmpty()
  network: PaymentNetwork

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod

  @IsOptional()
  @IsEmail()
  @MaxLength(190)
  emailAddress?: string

  @IsOptional()
  @IsString()
  @MaxLength(150)
  payerName?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerReference?: string

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

  @IsOptional()
  @IsString()
  @MaxLength(32)
  macAddress?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientIp?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  routerId?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  routerKey?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hotspotServerName?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  loginUrl?: string
}
