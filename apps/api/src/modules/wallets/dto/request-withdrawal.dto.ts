import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export class RequestWithdrawalDto {
  @IsOptional()
  @IsUUID()
  payoutNumberId?: string

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
