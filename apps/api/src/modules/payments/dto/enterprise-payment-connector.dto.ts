import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  ValidateNested,
} from 'class-validator'

export const enterpriseConnectorAuthTypes = [
  'NONE',
  'BEARER_STATIC',
  'API_KEY_HEADER',
  'BASIC',
  'OAUTH2_CLIENT_CREDENTIALS',
] as const

export type EnterpriseConnectorAuthType = (typeof enterpriseConnectorAuthTypes)[number]

export class EnterpriseConnectorAuthDto {
  @IsIn(enterpriseConnectorAuthTypes)
  type: EnterpriseConnectorAuthType = 'NONE'

  @IsOptional()
  @IsString()
  headerName?: string

  @IsOptional()
  @IsString()
  token?: string

  @IsOptional()
  @IsString()
  apiKey?: string

  @IsOptional()
  @IsString()
  username?: string

  @IsOptional()
  @IsString()
  password?: string

  @IsOptional()
  @IsUrl({ require_tld: false })
  tokenUrl?: string

  @IsOptional()
  @IsString()
  clientId?: string

  @IsOptional()
  @IsString()
  clientSecret?: string

  @IsOptional()
  @IsString()
  scope?: string

  @IsOptional()
  @IsString()
  tokenField?: string
}

export class EnterpriseConnectorFieldMapDto {
  @IsString()
  @IsNotEmpty()
  amount: string = 'amount'

  @IsString()
  @IsNotEmpty()
  currency: string = 'currency'

  @IsString()
  @IsNotEmpty()
  phone: string = 'phoneNumber'

  @IsString()
  @IsNotEmpty()
  reference: string = 'reference'

  @IsOptional()
  @IsString()
  narrative?: string

  @IsOptional()
  @IsString()
  callbackUrl?: string

  @IsOptional()
  @IsString()
  customerReference?: string
}

export class EnterpriseConnectorResponseMapDto {
  @IsString()
  @IsNotEmpty()
  status: string = 'status'

  @IsOptional()
  @IsString()
  providerReference?: string

  @IsOptional()
  @IsString()
  checkoutUrl?: string

  @IsOptional()
  @IsString()
  message?: string

  @IsOptional()
  @IsString()
  amount?: string

  @IsOptional()
  @IsString()
  currency?: string
}

export class EnterpriseConnectorStatusMapDto {
  @IsArray()
  @IsString({ each: true })
  success: string[] = ['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'PAID']

  @IsArray()
  @IsString({ each: true })
  pending: string[] = ['PENDING', 'PROCESSING', 'INITIATED']

  @IsArray()
  @IsString({ each: true })
  failed: string[] = ['FAILED', 'REJECTED', 'DECLINED', 'ERROR']

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cancelled?: string[]
}

export class CreateEnterprisePaymentConnectorDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @Length(2, 2)
  countryCode: string

  @IsString()
  @IsNotEmpty()
  currency: string

  @IsString()
  @IsNotEmpty()
  networkCode: string

  @IsString()
  @IsNotEmpty()
  providerName: string

  @IsUrl({ require_tld: false })
  collectionUrl: string

  @IsOptional()
  @IsUrl({ require_tld: false })
  statusUrl?: string

  @IsOptional()
  @IsUrl({ require_tld: false })
  disbursementUrl?: string

  @IsOptional()
  @IsUrl({ require_tld: false })
  disbursementStatusUrl?: string

  @IsOptional()
  @IsString()
  collectionMethod?: string

  @IsOptional()
  @IsString()
  statusMethod?: string

  @IsOptional()
  @IsString()
  disbursementMethod?: string

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>

  @IsOptional()
  @IsObject()
  staticBody?: Record<string, unknown>

  @ValidateNested()
  @Type(() => EnterpriseConnectorAuthDto)
  auth: EnterpriseConnectorAuthDto

  @ValidateNested()
  @Type(() => EnterpriseConnectorFieldMapDto)
  fields: EnterpriseConnectorFieldMapDto

  @ValidateNested()
  @Type(() => EnterpriseConnectorResponseMapDto)
  response: EnterpriseConnectorResponseMapDto

  @ValidateNested()
  @Type(() => EnterpriseConnectorStatusMapDto)
  statusMap: EnterpriseConnectorStatusMapDto

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsBoolean()
  supportsCollections?: boolean

  @IsOptional()
  @IsBoolean()
  supportsDisbursements?: boolean
}

export class UpdateEnterprisePaymentConnectorDto extends CreateEnterprisePaymentConnectorDto {}

export class EnterpriseConnectorCollectDto {
  @IsString()
  @IsNotEmpty()
  amount: string

  @IsString()
  @IsNotEmpty()
  phoneNumber: string

  @IsString()
  @IsNotEmpty()
  externalReference: string

  @IsOptional()
  @IsString()
  narrative?: string

  @IsOptional()
  @IsString()
  customerReference?: string

  @IsOptional()
  @IsUrl({ require_tld: false })
  callbackUrl?: string
}

export class EnterpriseConnectorStatusDto {
  @IsString()
  @IsNotEmpty()
  reference: string
}
