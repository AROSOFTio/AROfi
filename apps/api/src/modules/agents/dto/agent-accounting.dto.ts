import { PaymentNetwork } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator'

export class AgentCashDepositDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000000)
  amountUgx: number

  @IsString()
  @IsNotEmpty()
  phoneNumber: string

  @IsIn([PaymentNetwork.MTN, PaymentNetwork.AIRTEL])
  network: PaymentNetwork
}

export class AgentCommissionWithdrawalDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string

  @IsIn([PaymentNetwork.MTN, PaymentNetwork.AIRTEL])
  network: PaymentNetwork
}
