import { Type } from 'class-transformer'
import { IsBoolean, IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator'

export class CreatePackagePriceDto {
  @IsInt()
  @Min(1)
  @Max(100000000)
  amountUgx: number

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isDefault?: boolean

  @IsOptional()
  @IsDateString()
  startsAt?: string

  @IsOptional()
  @IsDateString()
  endsAt?: string
}
