import { IsInt, IsNotEmpty, IsString, IsUUID, Max, Min } from 'class-validator'

export class AdjustWalletDto {
  @IsUUID()
  tenantId: string

  @IsInt()
  @Min(-100000000)
  @Max(100000000)
  amountUgx: number

  @IsString()
  @IsNotEmpty()
  description: string
}
