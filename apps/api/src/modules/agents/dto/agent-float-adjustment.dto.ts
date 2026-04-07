import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class AgentFloatAdjustmentDto {
  @IsInt()
  @Min(1)
  @Max(100000000)
  amountUgx: number

  @IsOptional()
  @IsString()
  notes?: string
}
