import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class ReviewKycDocumentDto {
  @IsBoolean()
  approve: boolean

  @IsOptional()
  @IsString()
  notes?: string
}
