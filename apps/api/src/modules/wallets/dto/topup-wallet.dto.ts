import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator'

export class TopUpWalletDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber: string

  @IsInt()
  @Min(500)
  amountUgx: number
}
