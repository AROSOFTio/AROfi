import { IsString, MaxLength, MinLength } from 'class-validator'

export class CheckoutSubscriptionDto {
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phoneNumber!: string
}
