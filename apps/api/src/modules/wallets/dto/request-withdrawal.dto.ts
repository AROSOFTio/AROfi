import { IsBoolean, IsInt, IsString, IsUUID, Max, Min } from 'class-validator'

export class RequestWithdrawalDto {
  @IsUUID()
  payoutNumberId: string

  @IsInt()
  @Min(1)
  @Max(100000000)
  amountUgx: number

  @IsString()
  secretKey: string

  @IsBoolean()
  confirmPhoneInPossession: boolean

  @IsBoolean()
  acceptFinalTerms: boolean
}
