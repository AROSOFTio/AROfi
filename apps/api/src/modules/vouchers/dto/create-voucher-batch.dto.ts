import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateIf } from 'class-validator'

export const voucherCodeFormats = ['NUMBERS', 'MIXED', 'UPPERCASE_TEXT', 'LOWERCASE_TEXT'] as const
export type VoucherCodeFormatDto = (typeof voucherCodeFormats)[number]

export class CreateVoucherBatchDto {
  @IsUUID()
  tenantId: string

  @IsUUID()
  packageId: string

  @IsOptional()
  @IsUUID()
  templateId?: string

  @IsOptional()
  @IsUUID()
  generatedByUserId?: string

  @IsOptional()
  @IsString()
  prefix?: string

  @IsOptional()
  @IsIn(voucherCodeFormats)
  codeFormat?: VoucherCodeFormatDto

  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(24)
  codeLength?: number

  @ValidateIf((object: CreateVoucherBatchDto) => !object.templateId)
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000000)
  faceValueUgx?: number

  @IsOptional()
  @IsDateString()
  expiresAt?: string

  @IsOptional()
  @IsString()
  notes?: string
}
