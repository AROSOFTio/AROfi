import { PaymentNetwork } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export const agentFulfillmentModes = ['ACTIVATE_NOW', 'VOUCHER_LATER'] as const
export type AgentFulfillmentMode = (typeof agentFulfillmentModes)[number]

export class CreateAgentActivationClaimDto {
  @IsOptional()
  @IsString()
  tenantDomain?: string

  @IsOptional()
  @IsUUID()
  routerId?: string

  @IsOptional()
  @IsString()
  routerKey?: string

  @IsString()
  @IsNotEmpty()
  macAddress: string

  @IsOptional()
  @IsString()
  clientIp?: string

  @IsString()
  @IsNotEmpty()
  loginUrl: string

  @IsOptional()
  @IsString()
  hotspotServerName?: string
}

export class AgentCashSaleDto {
  @IsUUID()
  packageId: string

  @IsString()
  @IsNotEmpty()
  customerPhoneNumber: string

  @IsIn(agentFulfillmentModes)
  fulfillment: AgentFulfillmentMode

  @IsOptional()
  @IsString()
  claimCode?: string
}

export class AgentMobileMoneySaleDto extends AgentCashSaleDto {
  @IsString()
  @IsNotEmpty()
  payingPhoneNumber: string

  @IsOptional()
  @IsIn([PaymentNetwork.MTN, PaymentNetwork.AIRTEL])
  network?: PaymentNetwork
}

export class RecordAgentCashSettlementDto {
  @IsUUID()
  agentId: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000000)
  amountUgx: number

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateAgentSalesPolicyDto {
  @IsOptional()
  @IsBoolean()
  cashEnabled?: boolean

  @IsOptional()
  @IsBoolean()
  mobileMoneyEnabled?: boolean

  @IsOptional()
  @IsUUID('4', { each: true })
  allowedPackageIds?: string[]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  cashLimitUgx?: number
}
