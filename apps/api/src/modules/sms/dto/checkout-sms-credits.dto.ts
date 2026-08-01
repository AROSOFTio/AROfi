import { IsInt, IsPhoneNumber, Min } from 'class-validator'

export class CheckoutSmsCreditsDto {
  @IsInt()
  @Min(50)
  smsQuantity!: number

  @IsPhoneNumber('UG')
  phoneNumber!: string
}
